use std::fs;
use std::path::PathBuf;
use lofty::prelude::*;
use lofty::probe::Probe;

#[derive(serde::Serialize)]
struct LocalTrack {
  id: usize,
  title: String,
  artist: String,
  path: String,
  duration: f64,
  cover_url: Option<String>,
}

fn path_hash(path: &str) -> String {
  use std::collections::hash_map::DefaultHasher;
  use std::hash::{Hash, Hasher};
  let mut hasher = DefaultHasher::new();
  path.hash(&mut hasher);
  format!("{:x}", hasher.finish())
}

fn get_audio_files_recursive(dir: &PathBuf, files: &mut Vec<PathBuf>) {
  if let Ok(entries) = fs::read_dir(dir) {
    for entry in entries {
      if let Ok(entry) = entry {
        let path = entry.path();
        if path.is_dir() {
          if let Some(name) = path.file_name() {
            if name.to_string_lossy().starts_with('.') {
              continue;
            }
          }
          get_audio_files_recursive(&path, files);
        } else if path.is_file() {
          if let Some(ext) = path.extension() {
            let ext_str = ext.to_string_lossy().to_lowercase();
            if ext_str == "mp3" || ext_str == "wav" || ext_str == "ogg" || ext_str == "flac" || ext_str == "m4a" {
              files.push(path);
            }
          }
        }
      }
    }
  }
}

#[tauri::command]
fn scan_local_music(custom_path: Option<String>) -> Result<Vec<LocalTrack>, String> {
  let music_dir = if let Some(ref path_str) = custom_path {
    if path_str.starts_with("~/") {
      let home = std::env::var("HOME").map_err(|e| e.to_string())?;
      PathBuf::from(home).join(&path_str[2..])
    } else if path_str == "~" {
      let home = std::env::var("HOME").map_err(|e| e.to_string())?;
      PathBuf::from(home)
    } else {
      PathBuf::from(path_str)
    }
  } else {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    PathBuf::from(home).join("Music")
  };

  if !music_dir.exists() {
    return Err(format!("Mappen finnes ikke: {:?}", music_dir));
  }

  let home = std::env::var("HOME").map_err(|e| e.to_string())?;
  let mut tracks = Vec::new();
  let mut id_counter = 1;

  let mut file_paths = Vec::new();
  get_audio_files_recursive(&music_dir, &mut file_paths);

  for path in file_paths {
    let path_str = path.to_string_lossy().to_string();
    
    // Try parsing with lofty
    let tagged_file = Probe::open(&path).ok().and_then(|p| p.read().ok());
    
    let mut duration = 0.0;
    let mut artist = None;
    let mut title = None;
    let mut cover_url = None;

    if let Some(ref tf) = tagged_file {
      duration = tf.properties().duration().as_secs_f64();
      if let Some(tag) = tf.primary_tag().or_else(|| tf.first_tag()) {
        artist = tag.artist().map(|a| a.to_string());
        title = tag.title().map(|t| t.to_string());
        
        let pictures = tag.pictures();
        if !pictures.is_empty() {
          let pic = &pictures[0];
          let bytes = pic.data();
          let hash = path_hash(&path_str);
          let covers_dir = PathBuf::from(&home).join(".config").join("ludvis-mediaspiller").join("covers");
          let _ = fs::create_dir_all(&covers_dir);
          
          let mime_str = format!("{:?}", pic.mime_type()).to_lowercase();
          let ext = if mime_str.contains("png") { "png" } else { "jpg" };
          
          let cached_pic_path = covers_dir.join(format!("{}.{}", hash, ext));
          if !cached_pic_path.exists() {
            let _ = fs::write(&cached_pic_path, bytes);
          }
          cover_url = Some(cached_pic_path.to_string_lossy().to_string());
        }
      }
    }

    // Fallbacks
    let title = title.unwrap_or_else(|| {
      let file_name = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
      let parts: Vec<&str> = file_name.splitn(2, " - ").collect();
      if parts.len() == 2 {
        parts[1].to_string()
      } else {
        file_name
      }
    });

    let artist = artist.unwrap_or_else(|| {
      let file_name = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
      let parts: Vec<&str> = file_name.splitn(2, " - ").collect();
      if parts.len() == 2 {
        parts[0].to_string()
      } else {
        "Ukjent artist".to_string()
      }
    });

    tracks.push(LocalTrack {
      id: id_counter,
      title,
      artist,
      path: path_str,
      duration,
      cover_url,
    });
    id_counter += 1;
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
  position: f64,
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
  let position = player.get_position().map(|d| d.as_secs_f64()).unwrap_or(0.0);
  let player_name = player.identity().to_string();
  let volume = player.get_volume().unwrap_or(1.0);

  let state = MprisState {
    title,
    artist,
    album,
    cover_url,
    is_playing,
    duration,
    position,
    player_name,
    volume,
  };

  let _ = app_handle.emit("mpris-media-state", state);
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct GraphicsSettings {
  backend: String,
  disable_dmabuf: bool,
  disable_compositing: bool,
}

impl Default for GraphicsSettings {
  fn default() -> Self {
    Self {
      backend: "auto".to_string(),
      disable_dmabuf: false,
      disable_compositing: false,
    }
  }
}

fn get_graphics_config_path() -> PathBuf {
  let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
  PathBuf::from(home).join(".config").join("ludvis-mediaspiller").join("graphics.json")
}

#[tauri::command]
fn get_graphics_settings() -> Result<GraphicsSettings, String> {
  let path = get_graphics_config_path();
  if !path.exists() {
    return Ok(GraphicsSettings::default());
  }
  let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
  let settings: GraphicsSettings = serde_json::from_str(&content).map_err(|e| e.to_string())?;
  Ok(settings)
}

#[tauri::command]
fn save_graphics_settings(settings: GraphicsSettings) -> Result<(), String> {
  let path = get_graphics_config_path();
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
  fs::write(path, content).map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
fn read_audio_file(path: String) -> Result<Vec<u8>, String> {
  fs::read(path).map_err(|e| e.to_string())
}

static PORT: std::sync::Mutex<u16> = std::sync::Mutex::new(0);

fn percent_decode(s: &str) -> String {
  let mut bytes = Vec::new();
  let mut chars = s.bytes();
  while let Some(b) = chars.next() {
    if b == b'%' {
      let h1 = chars.next().unwrap_or(0);
      let h2 = chars.next().unwrap_or(0);
      let mut hex = Vec::new();
      hex.push(h1);
      hex.push(h2);
      if let Ok(hex_str) = String::from_utf8(hex) {
        if let Ok(val) = u8::from_str_radix(&hex_str, 16) {
          bytes.push(val);
          continue;
        }
      }
    }
    bytes.push(b);
  }
  String::from_utf8_lossy(&bytes).into_owned()
}

#[tauri::command]
fn get_audio_server_port() -> u16 {
  *PORT.lock().unwrap()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Start local HTTP server for streaming audio to GStreamer
  if let Ok(listener) = std::net::TcpListener::bind("127.0.0.1:0") {
    if let Ok(addr) = listener.local_addr() {
      *PORT.lock().unwrap() = addr.port();
      
      std::thread::spawn(move || {
        use std::io::{Read, Write};
        for stream in listener.incoming() {
          if let Ok(mut stream) = stream {
            std::thread::spawn(move || {
              let mut buffer = [0; 2048];
              if let Ok(n) = stream.read(&mut buffer) {
                let request = String::from_utf8_lossy(&buffer[..n]);
                if request.starts_with("GET /music") {
                  if let Some(start) = request.find("path=") {
                    let rest = &request[start + 5..];
                    if let Some(end) = rest.find(' ') {
                      let encoded_path = &rest[..end];
                      let decoded_path = percent_decode(encoded_path);
                      let path = std::path::PathBuf::from(decoded_path);
                      if path.exists() && path.is_file() {
                        if let Ok(mut file) = std::fs::File::open(&path) {
                          use std::io::Seek;
                          let len = file.metadata().map(|m| m.len()).unwrap_or(0);
                          let mime = match path.extension().and_then(|e| e.to_str()).unwrap_or("") {
                            "mp3" => "audio/mpeg",
                            "ogg" => "audio/ogg",
                            "wav" => "audio/wav",
                            "flac" => "audio/flac",
                            "m4a" => "audio/mp4",
                            _ => "application/octet-stream"
                          };
                          
                          // Parse Range header
                          let mut range_start = 0;
                          let mut range_end = if len > 0 { len - 1 } else { 0 };
                          let mut is_partial = false;

                          if let Some(r_idx) = request.find("Range: bytes=") {
                            let r_str = &request[r_idx + 13..];
                            if let Some(nl_idx) = r_str.find("\r\n") {
                              let range_val = &r_str[..nl_idx];
                              let parts: Vec<&str> = range_val.split('-').collect();
                              if !parts.is_empty() {
                                if let Ok(s) = parts[0].trim().parse::<u64>() {
                                  range_start = s;
                                  is_partial = true;
                                }
                                if parts.len() > 1 && !parts[1].trim().is_empty() {
                                  if let Ok(e) = parts[1].trim().parse::<u64>() {
                                    range_end = e;
                                  }
                                }
                              }
                            }
                          }

                          if range_start >= len {
                            let response = format!(
                              "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */{}\r\nContent-Length: 0\r\n\r\n",
                              len
                            );
                            let _ = stream.write_all(response.as_bytes());
                            return;
                          }

                          if is_partial {
                            let content_length = range_end - range_start + 1;
                            let response_headers = format!(
                              "HTTP/1.1 206 Partial Content\r\nContent-Type: {}\r\nContent-Length: {}\r\nContent-Range: bytes {}-{}/{}\r\nAccept-Ranges: bytes\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
                              mime, content_length, range_start, range_end, len
                            );
                            
                            if stream.write_all(response_headers.as_bytes()).is_ok() {
                              let _ = file.seek(std::io::SeekFrom::Start(range_start));
                              let mut file_buf = [0; 65536];
                              let mut bytes_to_send = content_length;
                              while bytes_to_send > 0 {
                                let chunk_size = std::cmp::min(file_buf.len() as u64, bytes_to_send) as usize;
                                if let Ok(n) = file.read(&mut file_buf[..chunk_size]) {
                                  if n == 0 { break; }
                                  if stream.write_all(&file_buf[..n]).is_err() {
                                    break;
                                  }
                                  bytes_to_send -= n as u64;
                                } else {
                                  break;
                                }
                              }
                            }
                          } else {
                            let response_headers = format!(
                              "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nAccept-Ranges: bytes\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
                              mime, len
                            );
                            if stream.write_all(response_headers.as_bytes()).is_ok() {
                              let mut file_buf = [0; 65536];
                              while let Ok(n) = file.read(&mut file_buf) {
                                if n == 0 { break; }
                                if stream.write_all(&file_buf[..n]).is_err() {
                                  break;
                                }
                              }
                            }
                          }
                          return;
                        }
                      }
                    }
                  }
                }
                let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
              }
            });
          }
        }
      });
    }
  }

  // Load and apply graphics settings before Tauri starts up
  if let Ok(settings_json) = fs::read_to_string(get_graphics_config_path()) {
    if let Ok(settings) = serde_json::from_str::<GraphicsSettings>(&settings_json) {
      match settings.backend.as_str() {
        "x11" => std::env::set_var("GDK_BACKEND", "x11"),
        "wayland" => std::env::set_var("GDK_BACKEND", "wayland"),
        _ => {}
      }
      if settings.disable_dmabuf {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
      }
      if settings.disable_compositing {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
      }
    }
  }

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
            } else {
              use tauri::Emitter;
              let _ = app_handle.emit("mpris-media-state", MprisState {
                title: "No Active Player".to_string(),
                artist: "Unknown Artist".to_string(),
                album: "".to_string(),
                cover_url: "".to_string(),
                is_playing: false,
                duration: 0.0,
                position: 0.0,
                player_name: "None".to_string(),
                volume: 1.0,
              });
            }
            std::thread::sleep(Duration::from_millis(500));
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
      scan_local_music,
      get_graphics_settings,
      save_graphics_settings,
      read_audio_file,
      get_audio_server_port
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
