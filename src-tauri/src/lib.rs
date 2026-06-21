use std::fs;
use std::path::PathBuf;

#[derive(serde::Serialize)]
struct LocalTrack {
  id: usize,
  title: String,
  artist: String,
  path: String,
  duration: f64,
}

#[tauri::command]
fn scan_local_music(custom_path: Option<String>) -> Result<Vec<LocalTrack>, String> {
  let music_dir = if let Some(ref path_str) = custom_path {
    PathBuf::from(path_str)
  } else {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    PathBuf::from(home).join("Music")
  };

  if !music_dir.exists() {
    return Err(format!("Mappen finnes ikke: {:?}", music_dir));
  }

  let mut tracks = Vec::new();
  let mut id_counter = 1;

  let entries = fs::read_dir(music_dir).map_err(|e| e.to_string())?;
  for entry in entries {
    if let Ok(entry) = entry {
      let path = entry.path();
      if path.is_file() {
        if let Some(ext) = path.extension() {
          let ext_str = ext.to_string_lossy().to_lowercase();
          if ext_str == "mp3" || ext_str == "wav" || ext_str == "ogg" || ext_str == "flac" || ext_str == "m4a" {
            let file_name = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
            let parts: Vec<&str> = file_name.splitn(2, " - ").collect();
            let (artist, title) = if parts.len() == 2 {
              (parts[0].to_string(), parts[1].to_string())
            } else {
              ("Ukjent artist".to_string(), file_name.clone())
            };

            let path_str = path.to_string_lossy().to_string();
            tracks.push(LocalTrack {
              id: id_counter,
              title,
              artist,
              path: path_str,
              duration: 0.0,
            });
            id_counter += 1;
          }
        }
      }
    }
  }

  tracks.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
  Ok(tracks)
}

#[derive(Clone, serde::Serialize)]
struct MprisState {
  title: String,
  artist: String,
  album: String,
  cover_url: String,
  is_playing: bool,
  duration: f64,
  player_name: String,
  volume: f64,
}

#[tauri::command]
fn mpris_toggle_play() {
  if let Ok(finder) = mpris::PlayerFinder::new() {
    if let Ok(player) = finder.find_active() {
      let _ = player.play_pause();
    }
  }
}

#[tauri::command]
fn mpris_next() {
  if let Ok(finder) = mpris::PlayerFinder::new() {
    if let Ok(player) = finder.find_active() {
      let _ = player.next();
    }
  }
}

#[tauri::command]
fn mpris_prev() {
  if let Ok(finder) = mpris::PlayerFinder::new() {
    if let Ok(player) = finder.find_active() {
      let _ = player.previous();
    }
  }
}

#[tauri::command]
fn mpris_set_volume(volume: f64) {
  if let Ok(finder) = mpris::PlayerFinder::new() {
    if let Ok(player) = finder.find_active() {
      let _ = player.set_volume(volume);
    }
  }
}



fn emit_current_state(app_handle: &tauri::AppHandle, player: &mpris::Player) {
  use tauri::Emitter;

  let metadata = player.get_metadata().ok();
  let title = metadata.as_ref().and_then(|m| m.title()).unwrap_or("No Title").to_string();
  let artist = metadata.as_ref().and_then(|m| m.artists().map(|a| a.join(", "))).unwrap_or_else(|| "Unknown Artist".to_string());
  let album = metadata.as_ref().and_then(|m| m.album_name()).unwrap_or("Unknown Album").to_string();
  let cover_url = metadata.as_ref().and_then(|m| m.art_url()).unwrap_or("").to_string();
  
  let is_playing = player.get_playback_status().map(|s| s == mpris::PlaybackStatus::Playing).unwrap_or(false);
  let duration = metadata.as_ref().and_then(|m| m.length()).map(|d| d.as_secs_f64()).unwrap_or(0.0);
  let player_name = player.identity().to_string();
  let volume = player.get_volume().unwrap_or(1.0);

  let state = MprisState {
    title,
    artist,
    album,
    cover_url,
    is_playing,
    duration,
    player_name,
    volume,
  };

  let _ = app_handle.emit("mpris-media-state", state);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      #[cfg(target_os = "linux")]
      {
        let app_handle = app.handle().clone();
        std::thread::spawn(move || {
          use mpris::PlayerFinder;
          use std::time::Duration;

          let finder = match PlayerFinder::new() {
            Ok(f) => f,
            Err(e) => {
              log::error!("Failed to initialize PlayerFinder: {}", e);
              return;
            }
          };

          loop {
            if let Ok(player) = finder.find_active() {
              emit_current_state(&app_handle, &player);

              if let Ok(events) = player.events() {
                for event in events {
                  match event {
                    Ok(_) => {
                      emit_current_state(&app_handle, &player);
                    }
                    Err(_) => {
                      break;
                    }
                  }
                }
              }
            } else {
              use tauri::Emitter;
              let _ = app_handle.emit("mpris-media-state", MprisState {
                title: "No Active Player".to_string(),
                artist: "Unknown Artist".to_string(),
                album: "".to_string(),
                cover_url: "".to_string(),
                is_playing: false,
                duration: 0.0,
                player_name: "None".to_string(),
                volume: 1.0,
              });
            }
            std::thread::sleep(Duration::from_secs(2));
          }
        });
      }

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      mpris_toggle_play,
      mpris_next,
      mpris_prev,
      mpris_set_volume,
      scan_local_music
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
