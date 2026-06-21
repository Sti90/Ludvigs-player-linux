import { useState, useEffect, useRef } from 'react';
import { VinylRecord } from './components/VinylRecord';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface Track {
  id: number;
  title: string;
  artist: string;
  lyrics?: string;
  coverUrl?: string;
  audioUrl?: string; // used for mock tracks
  path?: string;     // used for scanned local files
  duration?: number;
}

const MOCK_PLAYLIST: Track[] = [];

interface MprisState {
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  isPlaying: boolean;
  duration: number;
  playerName: string;
  volume: number;
}

type Language = 'no' | 'en' | 'es';

interface Translations {
  localMode: string;
  systemAudio: string;
  automatic: string;
  automaticDesc: string;
  localDesc: string;
  systemDesc: string;
  activePlayer: string;
  noActivePlayer: string;
  unknownArtist: string;
  unknownAlbum: string;
  playlist: string;
  closePlaylist: string;
  clickToEditTitle: string;
  playbackFolder: string;
  playbackFolderPlaceholder: string;
  scan: string;
  scanning: string;
  noSongsFound: string;
  totalSongs: string;
  connectLive: string;
  mute: string;
  unmute: string;
  local: string;
}

const TRANSLATIONS: Record<Language, Translations> = {
  no: {
    localMode: 'Lokal musikk',
    systemAudio: 'Systemlyd',
    automatic: 'Automatisk',
    automaticDesc: 'Velger kilde basert på aktivitet',
    localDesc: 'Spill av musikkfiler fra valgt mappe',
    systemDesc: 'Stream og synk med Spotify, Chrome osv.',
    activePlayer: 'Aktiv Spiller',
    noActivePlayer: 'Ingen aktiv spiller',
    unknownArtist: 'Ukjent artist',
    unknownAlbum: 'Ukjent album',
    playlist: 'Spilleliste',
    closePlaylist: 'Lukk spilleliste',
    clickToEditTitle: 'Klikk for å endre tittel',
    playbackFolder: 'Avspillingsmappe',
    playbackFolderPlaceholder: 'F.eks. ~/Music eller full bane',
    scan: 'Skann',
    scanning: 'Skanner...',
    noSongsFound: 'her var det tomt ??',
    totalSongs: 'Totalt',
    connectLive: 'Koble til Live',
    mute: 'Demp',
    unmute: 'Opphev demping',
    local: 'Lokal',
  },
  en: {
    localMode: 'Local Music',
    systemAudio: 'System Audio',
    automatic: 'Automatic',
    automaticDesc: 'Selects source based on activity',
    localDesc: 'Play music files from selected folder',
    systemDesc: 'Stream and sync with Spotify, Chrome etc.',
    activePlayer: 'Active Player',
    noActivePlayer: 'No active player',
    unknownArtist: 'Unknown Artist',
    unknownAlbum: 'Unknown Album',
    playlist: 'Playlist',
    closePlaylist: 'Close playlist',
    clickToEditTitle: 'Click to edit title',
    playbackFolder: 'Playback Folder',
    playbackFolderPlaceholder: 'E.g. ~/Music or full path',
    scan: 'Scan',
    scanning: 'Scanning...',
    noSongsFound: 'here it was empty ??',
    totalSongs: 'Total',
    connectLive: 'Connect Live',
    mute: 'Mute',
    unmute: 'Unmute',
    local: 'Local',
  },
  es: {
    localMode: 'Música local',
    systemAudio: 'Audio del sistema',
    automatic: 'Automático',
    automaticDesc: 'Selecciona la fuente según la actividad',
    localDesc: 'Reproduce archivos de música de la carpeta seleccionada',
    systemDesc: 'Transmite y sincroniza con Spotify, Chrome, etc.',
    activePlayer: 'Reproductor activo',
    noActivePlayer: 'Sin reproductor activo',
    unknownArtist: 'Artista desconocido',
    unknownAlbum: 'Álbum desconocido',
    playlist: 'Lista de reproducción',
    closePlaylist: 'Cerrar lista',
    clickToEditTitle: 'Haz clic para editar el título',
    playbackFolder: 'Carpeta de reproducción',
    playbackFolderPlaceholder: 'Ej. ~/Music o ruta completa',
    scan: 'Escanear',
    scanning: 'Escaneando...',
    noSongsFound: 'aquí estaba vacío ??',
    totalSongs: 'Total',
    connectLive: 'Conectar en vivo',
    mute: 'Silenciar',
    unmute: 'Desactivar silencio',
    local: 'Local',
  }
};

export default function App() {
  const [mprisState, setMprisState] = useState<MprisState>({
    title: 'No Active Player',
    artist: 'Unknown Artist',
    album: 'Unknown Album',
    coverUrl: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=500&q=80',
    isPlaying: false,
    duration: 0,
    playerName: 'None',
    volume: 0.7
  });

  const [isLocalMode, setIsLocalMode] = useState(true);
  const [audioSourceMode, setAudioSourceModeState] = useState<'auto' | 'local' | 'system'>('auto');
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const audioSourceModeRef = useRef<'auto' | 'local' | 'system'>('auto');

  const [lang, setLang] = useState<Language>('no');
  const t = TRANSLATIONS[lang];

  useEffect(() => {
    // 1. Initial quick detection using browser locale preferences
    const browserLang = navigator.language || (navigator.languages && navigator.languages[0]) || '';
    let detectedLang: Language = 'en';
    if (browserLang.startsWith('no') || browserLang.startsWith('nb') || browserLang.startsWith('nn')) {
      detectedLang = 'no';
    } else if (browserLang.startsWith('es')) {
      detectedLang = 'es';
    }
    setLang(detectedLang);

    // 2. Exact country lookup using public GeoIP API
    fetch('https://ipapi.co/json/')
      .then((res) => res.json())
      .then((data) => {
        const country = data.country_code;
        if (country === 'NO') {
          setLang('no');
        } else if (['ES', 'MX', 'AR', 'CO', 'PE', 'VE', 'CL', 'EC', 'GT', 'CU', 'BO', 'DO', 'HN', 'PY', 'SV', 'NI', 'CR', 'PR', 'UY'].includes(country)) {
          setLang('es');
        } else {
          setLang('en');
        }
      })
      .catch((err) => {
        console.warn('IP location detection failed, using browser locale fallback:', err);
      });
  }, []);

  const setAudioSourceMode = (mode: 'auto' | 'local' | 'system') => {
    audioSourceModeRef.current = mode;
    setAudioSourceModeState(mode);
    if (mode === 'local') {
      setIsLocalMode(true);
    } else if (mode === 'system') {
      setIsLocalMode(false);
      setIsPlayingLocal(false);
    } else if (mode === 'auto') {
      if (mprisState.isPlaying && mprisState.playerName !== 'None') {
        setIsLocalMode(false);
        setIsPlayingLocal(false);
      } else {
        setIsLocalMode(true);
      }
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSourceDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const [localTracks, setLocalTracks] = useState<Track[]>([]);
  const [musicPath, setMusicPath] = useState('~/Music');
  const [isLoadingLocal, setIsLoadingLocal] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlayingLocal, setIsPlayingLocal] = useState(false);
  const [localTime, setLocalTime] = useState(0);
  const [localDuration, setLocalDuration] = useState(0);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);

  const [currentTime, setCurrentTime] = useState(0);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [likedTrackIds, setLikedTrackIds] = useState<Set<string>>(new Set());
  const [previousVolume, setPreviousVolume] = useState(0.7);
  const [appTitle, setAppTitle] = useState(() => {
    return localStorage.getItem('ludvis_mediaspiller_app_title') || 'Ludvis - Mediaspiller';
  });
  const [showSettings, setShowSettings] = useState(false);
  const [appIcon, setAppIcon] = useState<string>(() => {
    return localStorage.getItem('ludvis_custom_app_icon') || '/app-icon.png';
  });

  const [dynamicBg, setDynamicBg] = useState(() => {
    return localStorage.getItem('ludvis_dynamic_bg') !== 'false';
  });

  const [graphicsSettings, setGraphicsSettings] = useState<{
    backend: string;
    disable_dmabuf: boolean;
    disable_compositing: boolean;
  }>({
    backend: 'auto',
    disable_dmabuf: false,
    disable_compositing: false,
  });
  const [isRestartRequired, setIsRestartRequired] = useState(false);

  const [activeSettingsTab, setActiveSettingsTab] = useState<'om-app' | 'utseende' | 'skjerm' | 'avansert' | 'om'>('om-app');
  const sectionOmAppRef = useRef<HTMLDivElement>(null);
  const sectionUtseendeRef = useRef<HTMLDivElement>(null);
  const sectionSkjermRef = useRef<HTMLDivElement>(null);
  const sectionAvansertRef = useRef<HTMLDivElement>(null);
  const sectionOmRef = useRef<HTMLDivElement>(null);
  const mprisSyncRef = useRef<{ position: number; timestamp: number }>({ position: 0, timestamp: 0 });

  const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>, tab: 'om-app' | 'utseende' | 'skjerm' | 'avansert' | 'om') => {
    setActiveSettingsTab(tab);
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const [showControls, setShowControls] = useState(false);
  const controlsTimeoutRef = useRef<number | null>(null);

  const triggerControlsVisibility = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      window.clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = window.setTimeout(() => {
      setShowControls(false);
    }, 2500);
  };

  const handleMouseLeaveWindow = () => {
    setShowControls(false);
    if (controlsTimeoutRef.current) {
      window.clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        window.clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  const shouldShowControls = showControls || showSettings || showPlaylist;

  const audioRef = useRef<HTMLAudioElement>(null);

  const handleTitleChange = (newTitle: string) => {
    const trimmed = newTitle.trim();
    const finalTitle = trimmed !== '' ? trimmed : 'Ludvis - Mediaspiller';
    setAppTitle(finalTitle);
    localStorage.setItem('ludvis_mediaspiller_app_title', finalTitle);
  };

  const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          setAppIcon(result);
          localStorage.setItem('ludvis_custom_app_icon', result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleResetIcon = () => {
    setAppIcon('/app-icon.png');
    localStorage.removeItem('ludvis_custom_app_icon');
  };

  const handleDynamicBgToggle = (enabled: boolean) => {
    setDynamicBg(enabled);
    localStorage.setItem('ludvis_dynamic_bg', String(enabled));
  };

  const handleGraphicsChange = async (key: string, value: any) => {
    const updated = {
      ...graphicsSettings,
      [key]: value
    };
    setGraphicsSettings(updated);
    setIsRestartRequired(true);
    try {
      await invoke('save_graphics_settings', { settings: updated });
    } catch (err) {
      console.error('Kunne ikke lagre grafikkinnstillinger:', err);
    }
  };

  // Scan local folder
  const scanLocalFolder = async (customPath?: string) => {
    setIsLoadingLocal(true);
    setScanError(null);
    try {
      const pathArg = customPath || musicPath;
      const tracks: any[] = await invoke('scan_local_music', { customPath: pathArg ? pathArg : null });
      
      const mappedTracks: Track[] = tracks.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        path: t.path,
        duration: t.duration || 0,
        coverUrl: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=500&q=80',
        lyrics: `${t.path}`
      }));

      setLocalTracks(mappedTracks);
      if (mappedTracks.length > 0) {
        setCurrentTrackIndex(0);
        setIsLocalMode(true);
      } else {
        setScanError(TRANSLATIONS[lang].noSongsFound);
      }
    } catch (err: any) {
      console.error("Scan error:", err);
      setScanError(err.toString());
    } finally {
      setIsLoadingLocal(false);
    }
  };

  // Scan on mount and load graphics settings
  useEffect(() => {
    scanLocalFolder();
    
    invoke<any>('get_graphics_settings')
      .then((settings) => {
        if (settings) {
          setGraphicsSettings(settings);
        }
      })
      .catch((err) => console.error('Failed to load graphics settings:', err));
  }, []);

  // Listen to MPRIS events from Rust backend
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const formatCoverUrl = (url: string) => {
      if (!url) return 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=500&q=80';
      if (url.startsWith('file://')) {
        let path = url.replace(/^file:\/\/(localhost)?/, '');
        path = decodeURIComponent(path);
        return convertFileSrc(path);
      }
      return url;
    };

    listen<any>('mpris-media-state', (event) => {
      const payload = event.payload;
      // If external player starts playing, automatically switch to MPRIS mode and pause local
      if (payload.is_playing && payload.player_name !== 'None' && audioSourceModeRef.current === 'auto') {
        setIsLocalMode(false);
        setIsPlayingLocal(false);
      }
      setMprisState({
        title: payload.title || 'No Title',
        artist: payload.artist || 'Unknown Artist',
        album: payload.album || 'Unknown Album',
        coverUrl: formatCoverUrl(payload.cover_url),
        isPlaying: payload.is_playing,
        duration: payload.duration || 0,
        playerName: payload.player_name || 'None',
        volume: payload.volume !== undefined ? payload.volume : 0.7
      });
      if (payload.position !== undefined) {
        mprisSyncRef.current = {
          position: payload.position,
          timestamp: Date.now()
        };
        setCurrentTime(payload.position);
      }
    }).then((unsub) => {
      unlisten = unsub;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Sync current time with title changes (MPRIS)
  useEffect(() => {
    setCurrentTime(0);
  }, [mprisState.title]);

  // Interpolate time progression locally while playing (MPRIS)
  useEffect(() => {
    let animationFrame: number;
    
    const updateProgress = () => {
      if (mprisState.isPlaying && !isLocalMode && mprisSyncRef.current.timestamp > 0) {
        const elapsed = (Date.now() - mprisSyncRef.current.timestamp) / 1000;
        const estimatedTime = mprisSyncRef.current.position + elapsed;
        setCurrentTime(Math.min(estimatedTime, mprisState.duration));
      }
      animationFrame = requestAnimationFrame(updateProgress);
    };

    if (mprisState.isPlaying && !isLocalMode) {
      animationFrame = requestAnimationFrame(updateProgress);
    }
    
    return () => cancelAnimationFrame(animationFrame);
  }, [mprisState.isPlaying, mprisState.duration, isLocalMode]);

  // Sync volume with local audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = mprisState.volume;
    }
  }, [mprisState.volume]);

  // Local play/pause trigger
  useEffect(() => {
    if (!audioRef.current) return;
    if (isLocalMode) {
      if (isPlayingLocal) {
        audioRef.current.play().catch(console.error);
      } else {
        audioRef.current.pause();
      }
    } else {
      audioRef.current.pause();
      setIsPlayingLocal(false);
    }
  }, [isPlayingLocal, isLocalMode]);

  const currentPlaylist = localTracks.length > 0 ? localTracks : MOCK_PLAYLIST;
  const currentTrack = currentPlaylist[currentTrackIndex] || MOCK_PLAYLIST[0];

  // Load local track when index changes or track list changes
  useEffect(() => {
    if (audioRef.current && isLocalMode && currentTrack) {
      const audioUrl = currentTrack.path ? convertFileSrc(currentTrack.path) : currentTrack.audioUrl;
      if (audioUrl) {
        audioRef.current.src = audioUrl;
        audioRef.current.load();
        setLocalTime(0);
        if (isPlayingLocal) {
          audioRef.current.play().catch(console.error);
        }
      }
    }
  }, [currentTrackIndex, localTracks, isLocalMode]);

  const handleLocalTimeUpdate = () => {
    if (audioRef.current) {
      setLocalTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setLocalDuration(audioRef.current.duration);
    }
  };

  const handleLocalEnded = () => {
    if (isRepeat) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(console.error);
      }
    } else {
      handleNextTrack();
    }
  };

  const handlePlayPauseToggle = () => {
    if (isLocalMode) {
      setIsPlayingLocal((prev) => !prev);
    } else {
      invoke('mpris_toggle_play').catch(console.error);
    }
  };

  const handleNextTrack = () => {
    if (isLocalMode) {
      if (isShuffle) {
        const nextIndex = Math.floor(Math.random() * currentPlaylist.length);
        setCurrentTrackIndex(nextIndex);
      } else {
        setCurrentTrackIndex((prev) => (prev + 1) % currentPlaylist.length);
      }
    } else {
      invoke('mpris_next').catch(console.error);
    }
  };

  const handlePrevTrack = () => {
    if (isLocalMode) {
      setCurrentTrackIndex((prev) => (prev - 1 + currentPlaylist.length) % currentPlaylist.length);
    } else {
      invoke('mpris_prev').catch(console.error);
    }
  };

  const toggleLike = () => {
    if (isLocalMode && !currentTrack) return;
    const trackKey = isLocalMode 
      ? `local-${currentTrack.id}` 
      : `${mprisState.artist}-${mprisState.title}`;
    setLikedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackKey)) {
        next.delete(trackKey);
      } else {
        next.add(trackKey);
      }
      return next;
    });
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isLocalMode || !audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const clickPercentage = clickX / width;
    const newTime = clickPercentage * (audioRef.current.duration || 0);
    audioRef.current.currentTime = newTime;
    setLocalTime(newTime);
  };

  const handleVolumeChange = (newVolume: number) => {
    setMprisState((prev) => ({ ...prev, volume: newVolume }));
    invoke('mpris_set_volume', { volume: newVolume }).catch(console.error);
  };

  const toggleMute = () => {
    if (mprisState.volume > 0) {
      setPreviousVolume(mprisState.volume);
      handleVolumeChange(0);
    } else {
      handleVolumeChange(previousVolume || 1.0);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      const target = e.target as HTMLElement;
      if (target.hasAttribute('data-tauri-drag-region')) {
        getCurrentWindow().startDragging().catch(console.error);
      }
    }
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      e.stopPropagation();
      getCurrentWindow().startResizeDragging('SouthEast').catch(console.error);
    }
  };

  const currentTitle = isLocalMode ? (currentTrack ? currentTrack.title : t.noSongsFound) : (mprisState.title === 'No Active Player' ? t.noActivePlayer : mprisState.title);
  const currentArtist = isLocalMode ? (currentTrack ? currentTrack.artist : '') : (mprisState.artist === 'Unknown Artist' ? t.unknownArtist : mprisState.artist);
  const currentCover = isLocalMode ? ((currentTrack && currentTrack.coverUrl) || 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=500&q=80') : mprisState.coverUrl;
  const currentIsPlaying = isLocalMode ? (currentTrack ? isPlayingLocal : false) : mprisState.isPlaying;
  const currentDuration = isLocalMode ? (currentTrack ? localDuration : 0) : mprisState.duration;
  const currentProgress = isLocalMode ? (currentTrack ? localTime : 0) : currentTime;
  const currentQuote = isLocalMode 
    ? (currentTrack ? (currentTrack.lyrics || `${lang === 'no' ? 'Bane' : lang === 'es' ? 'Ruta' : 'Path'}: ${currentTrack.path}`) : '') 
    : (mprisState.album && mprisState.album !== 'Unknown Album' ? `Album: ${mprisState.album}` : `${t.activePlayer}: ${mprisState.playerName}`);
  
  const isCurrentTrackLiked = (isLocalMode && currentTrack) ? likedTrackIds.has(`local-${currentTrack.id}`) : (!isLocalMode ? likedTrackIds.has(`${mprisState.artist}-${mprisState.title}`) : false);

  return (
    <div 
      data-tauri-drag-region 
      onMouseDown={handleMouseDown} 
      onMouseMove={triggerControlsVisibility}
      onMouseLeave={handleMouseLeaveWindow}
      className="min-h-screen w-full bg-radial from-zinc-800 to-zinc-950 flex flex-col items-center justify-center p-4 md:p-8 font-sans antialiased text-white select-none rounded-3xl border border-white/10 overflow-hidden relative"
    >
      
      {/* Hidden local audio player */}
      <audio 
        ref={audioRef}
        onTimeUpdate={handleLocalTimeUpdate}
        onEnded={handleLocalEnded}
        onLoadedMetadata={handleLoadedMetadata}
      />

      {/* Background ambient glow matching the cover art colors */}
      {dynamicBg ? (
        <div 
          className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden"
          style={{ transform: 'translate3d(0, 0, 0)' }}
        >
          <img 
            key={currentCover}
            src={currentCover}
            className="w-full h-full object-cover blur-[64px] scale-110 pointer-events-none animate-fade-in-bg"
            style={{ 
              willChange: 'transform, opacity',
              transform: 'translate3d(0, 0, 0)'
            }}
            alt=""
          />
        </div>
      ) : (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-pink-500/20 via-purple-600/10 to-sky-400/20 rounded-full blur-[120px] pointer-events-none" />
      )}

      {/* Top Left Settings / Back Button */}
      <div className={`absolute top-6 left-6 z-50 transition-opacity duration-300 ${shouldShowControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 hover:border-white/20 transition-all text-zinc-300 hover:text-white cursor-pointer flex items-center justify-center"
          title={showSettings ? (lang === 'no' ? 'Gå tilbake til musikkspiller' : 'Back to Music Player') : 'Innstillinger'}
        >
          {showSettings ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.43l-1.003.828c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.43l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          )}
        </button>
      </div>

      {/* Top Right Close Button */}
      <div className={`absolute top-6 right-6 z-50 transition-opacity duration-300 ${shouldShowControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <button
          onClick={() => {
            try {
              getCurrentWindow().close();
            } catch (err) {
              console.error("Kunne ikke lukke vinduet:", err);
            }
          }}
          className="p-2.5 rounded-full bg-white/5 hover:bg-rose-500/20 hover:text-rose-400 active:scale-95 border border-white/10 hover:border-rose-500/30 transition-all text-zinc-300 cursor-pointer flex items-center justify-center"
          title={lang === 'no' ? 'Lukk appen' : 'Close App'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {showSettings ? (
        /* Settings Page Layout */
        <div className="relative z-10 w-full max-w-4xl bg-[#1a181c]/95 border border-white/10 backdrop-blur-2xl rounded-3xl p-6 shadow-2xl transition-all duration-300 flex flex-col animate-in fade-in zoom-in-95 duration-200 select-none text-left">
          
          <div className="flex flex-col md:flex-row gap-6 min-h-[500px]">
            {/* Sidebar Column */}
            <div className="w-full md:w-60 flex flex-col gap-6 shrink-0 pt-2">
              {/* Sidebar Header */}
              <div className="flex items-center gap-3 px-2">
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-800/50 border border-white/10 shadow-lg flex items-center justify-center p-1.5 shrink-0">
                  <img src={appIcon} className="w-full h-full object-contain rounded-lg" alt="App Icon" />
                </div>
                <div className="flex flex-col min-w-0">
                  <h2 className="text-base font-bold tracking-tight text-white truncate">{lang === 'no' ? 'Innstillinger' : 'Settings'}</h2>
                  <p className="text-[10px] text-zinc-400 font-light truncate">{lang === 'no' ? 'Konfigurer Ludvis Mediaspiller' : 'Configure Ludvis Media Player'}</p>
                </div>
              </div>

              {/* Sidebar Menu Items */}
              <nav className="flex flex-col gap-1">
                <button
                  onClick={() => scrollToSection(sectionOmAppRef, 'om-app')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                    activeSettingsTab === 'om-app'
                      ? 'bg-white/10 text-white shadow-inner'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 111.083.985l-.04.02a.75.75 0 11-1.084-.985zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{lang === 'no' ? 'Om applikasjonen' : 'About application'}</span>
                </button>

                <button
                  onClick={() => scrollToSection(sectionUtseendeRef, 'utseende')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                    activeSettingsTab === 'utseende'
                      ? 'bg-white/10 text-white shadow-inner'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-1.245c0-.778-.367-1.478-.94-1.928Zm0 0a5.058 5.058 0 0 1 8.722-.516M19.5 10.5c.02.086.03.176.03.268A3.5 3.5 0 1 1 16 7.25c.092 0 .182.01.268.03m-2.699 9.902-.123-.008a3 3 0 0 1-2.24-2.24l-.008-.123m8.962-2.127c-.288 0-.578-.023-.868-.068a3 3 0 0 1-2.24-2.24c-.045-.29-.068-.58-.068-.868M9 7.5h.008v.008H9V7.5Zm.375 2.25h.007v.008H9.375V9.75Zm-.375 3h.008v.008H9v-.008Zm10.5-5.25h.008v.008h-.008V7.5Zm-.375 2.25h.008v.008h-.008V9.75Zm-.375 3h.008v.008h-.008v-.008Z" />
                  </svg>
                  <span>{lang === 'no' ? 'Utseende' : 'Appearance'}</span>
                </button>

                <button
                  onClick={() => scrollToSection(sectionSkjermRef, 'skjerm')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                    activeSettingsTab === 'skjerm'
                      ? 'bg-white/10 text-white shadow-inner'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25" />
                  </svg>
                  <span>{lang === 'no' ? 'Skjerm og ytelse' : 'Display & performance'}</span>
                </button>

                <button
                  onClick={() => scrollToSection(sectionAvansertRef, 'avansert')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                    activeSettingsTab === 'avansert'
                      ? 'bg-white/10 text-white shadow-inner'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
                  </svg>
                  <span>{lang === 'no' ? 'Avansert' : 'Advanced'}</span>
                </button>

                <button
                  onClick={() => scrollToSection(sectionOmRef, 'om')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                    activeSettingsTab === 'om'
                      ? 'bg-white/10 text-white shadow-inner'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 111.083.985l-.04.02a.75.75 0 11-1.084-.985zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{lang === 'no' ? 'Om' : 'About'}</span>
                </button>
              </nav>
            </div>

            {/* Right Scrollable Content Column */}
            <div className="flex-1 bg-[#131214]/90 border border-white/5 rounded-3xl p-6 overflow-y-auto max-h-[480px] scroll-smooth flex flex-col gap-8 scrollbar-thin scrollbar-thumb-white/10">
              
              {/* Section: Om applikasjonen */}
              <div ref={sectionOmAppRef} className="flex flex-col gap-4">
                <h3 className="text-xl font-bold tracking-tight text-white">{lang === 'no' ? 'Om applikasjonen' : 'About the application'}</h3>
                
                <div className="flex flex-col gap-2 bg-[#201f22]/50 border border-white/5 rounded-2xl p-4">
                  <div className="flex justify-between items-center text-xs py-2.5 border-b border-white/5">
                    <span className="text-zinc-400">{lang === 'no' ? 'Navn' : 'Name'}</span>
                    <span className="text-zinc-200 font-medium">{appTitle}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs py-2.5 border-b border-white/5">
                    <span className="text-zinc-400">{lang === 'no' ? 'Versjon' : 'Version'}</span>
                    <span className="text-zinc-200 font-mono">0.1.9</span>
                  </div>
                  <div className="flex justify-between items-center text-xs py-2.5">
                    <span className="text-zinc-400">{lang === 'no' ? 'Plattform' : 'Platform'}</span>
                    <span className="text-zinc-200 font-mono text-[10px] uppercase tracking-wider">TAURI V2 + REACT</span>
                  </div>
                </div>
              </div>

              {/* Section: Utseende */}
              <div ref={sectionUtseendeRef} className="flex flex-col gap-4">
                <h3 className="text-xl font-bold tracking-tight text-white">{lang === 'no' ? 'Utseende' : 'Appearance'}</h3>
                
                {/* App-ikon Card */}
                <div className="flex flex-col gap-2.5 bg-[#201f22]/50 border border-white/5 rounded-2xl p-5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">{lang === 'no' ? 'App-ikon' : 'App Icon'}</span>
                  <div className="flex flex-col sm:flex-row items-center gap-6 mt-1.5">
                    {/* Icon Preview */}
                    <div className="relative group w-24 h-24 rounded-2xl overflow-hidden bg-[#18171a] border border-white/10 shadow-xl flex items-center justify-center p-2 transition-all hover:border-white/20 shrink-0">
                      <img src={appIcon} className="w-full h-full object-contain rounded-xl" alt="App Icon Preview" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                        <span className="text-[10px] text-white font-medium uppercase tracking-wider">{lang === 'no' ? 'Forhåndsvisning' : 'Preview'}</span>
                      </div>
                    </div>

                    {/* Upload controls */}
                    <div className="flex-1 flex flex-col gap-3 w-full">
                      <p className="text-xs text-zinc-400 font-light leading-relaxed">
                        {lang === 'no' 
                          ? 'Tilpass utseendet til mediaspilleren ved å laste opp et eget app-ikon.'
                          : 'Customize the look of the media player by uploading a custom app icon.'}
                        <span className="block text-[10px] text-zinc-500 font-normal mt-0.5">
                          {lang === 'no' ? 'Støtter PNG, JPG, WebP og SVG.' : 'Supports PNG, JPG, WebP and SVG.'}
                        </span>
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <label className="px-4 py-2 bg-white/5 hover:bg-white/10 active:scale-95 text-xs text-white font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 border border-white/5">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                          </svg>
                          <span>{lang === 'no' ? 'Last opp eget bilde...' : 'Upload custom image...'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleIconChange}
                            className="hidden"
                          />
                        </label>
                        
                        {appIcon !== '/app-icon.png' && (
                          <button
                            onClick={handleResetIcon}
                            className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/15 active:scale-95 text-xs text-rose-400 font-semibold rounded-xl transition-all cursor-pointer border border-rose-500/20"
                          >
                            {lang === 'no' ? 'Nullstill ikon' : 'Reset icon'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dynamic Background Card */}
                <div className="flex items-center justify-between gap-4 bg-[#201f22]/50 border border-white/5 rounded-2xl p-5">
                  <div className="flex flex-col pr-4">
                    <span className="text-xs font-semibold text-zinc-200">
                      {lang === 'no' ? 'Fargelegg bakgrunn etter album' : 'Color background by album art'}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-light mt-0.5 leading-relaxed">
                      {lang === 'no'
                        ? 'Lar bakgrunnen automatisk endre seg for å matche fargene på albumet som spilles.'
                        : 'Allows the background to automatically change to match the colors of the album playing.'}
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={dynamicBg}
                      onChange={(e) => handleDynamicBgToggle(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-white peer-checked:after:bg-zinc-950 peer-checked:after:border-white"></div>
                  </label>
                </div>
              </div>

              {/* Section: Skjerm og ytelse */}
              <div ref={sectionSkjermRef} className="flex flex-col gap-4">
                <h3 className="text-xl font-bold tracking-tight text-white">{lang === 'no' ? 'Skjerm og ytelse' : 'Display & performance'}</h3>
                
                <div className="flex flex-col gap-4 bg-[#201f22]/50 border border-white/5 rounded-2xl p-5">
                  {/* Graphics Engine Select */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-zinc-200">
                        {lang === 'no' ? 'Grafikkmotor (GDK Backend)' : 'Graphics Engine (GDK Backend)'}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-light mt-0.5 leading-relaxed">
                        {lang === 'no' 
                          ? 'Velg grafikkmotor. Wayland er moderne, X11 kan løse hakking.' 
                          : 'Select graphics engine. Wayland is modern, X11 can resolve stuttering.'}
                      </span>
                    </div>
                    <select
                      value={graphicsSettings.backend}
                      onChange={(e) => handleGraphicsChange('backend', e.target.value)}
                      className="px-3 py-1.5 bg-[#18171a] border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-white/30 cursor-pointer w-full sm:w-auto text-center"
                    >
                      <option value="auto">{lang === 'no' ? 'Automatisk (Standard)' : 'Automatic (Default)'}</option>
                      <option value="x11">X11 (Kompatibilitetsmodus)</option>
                      <option value="wayland">Wayland</option>
                    </select>
                  </div>

                  {/* Disable DMA-buf renderer */}
                  <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-4">
                    <div className="flex flex-col pr-4">
                      <span className="text-xs font-semibold text-zinc-200">
                        {lang === 'no' ? 'Deaktiver DMA-buf rendering' : 'Disable DMA-buf rendering'}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-light mt-0.5 leading-relaxed">
                        {lang === 'no'
                          ? 'Løser ofte flimring eller tom skjerm på Intel/Nvidia GPUer.'
                          : 'Often resolves flickering or blank screens on Intel/Nvidia GPUs.'}
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={graphicsSettings.disable_dmabuf}
                        onChange={(e) => handleGraphicsChange('disable_dmabuf', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-white peer-checked:after:bg-zinc-950 peer-checked:after:border-white"></div>
                    </label>
                  </div>

                  {/* Disable WebKit Compositing mode */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col pr-4">
                      <span className="text-xs font-semibold text-zinc-200">
                        {lang === 'no' ? 'Deaktiver Compositing Mode' : 'Disable Compositing Mode'}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-light mt-0.5 leading-relaxed">
                        {lang === 'no'
                          ? 'Tvinger standard rendering. Kan hjelpe mot lagging under Linux.'
                          : 'Forces basic rendering. Can help reduce lag under Linux.'}
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={graphicsSettings.disable_compositing}
                        onChange={(e) => handleGraphicsChange('disable_compositing', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-white peer-checked:after:bg-zinc-950 peer-checked:after:border-white"></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Section: Avansert */}
              <div ref={sectionAvansertRef} className="flex flex-col gap-4">
                <h3 className="text-xl font-bold tracking-tight text-white">{lang === 'no' ? 'Avansert' : 'Advanced'}</h3>
                
                <div className="flex flex-col gap-4 bg-[#201f22]/50 border border-white/5 rounded-2xl p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-zinc-200">
                        {lang === 'no' ? 'Nullstill innstillinger' : 'Reset settings'}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-light mt-0.5 leading-relaxed">
                        {lang === 'no'
                          ? 'Gjenoppretter standardtittel og opprinnelig app-ikon.'
                          : 'Restores the default application title and the original app icon.'}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        handleTitleChange('Ludvis - Mediaspiller');
                        handleResetIcon();
                      }}
                      className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/15 active:scale-95 text-xs text-rose-400 font-semibold rounded-xl transition-all cursor-pointer border border-rose-500/20"
                    >
                      {lang === 'no' ? 'Nullstill nå' : 'Reset now'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Section: Om */}
              <div ref={sectionOmRef} className="flex flex-col gap-4">
                <h3 className="text-xl font-bold tracking-tight text-white">{lang === 'no' ? 'Om' : 'About'}</h3>
                
                <div className="bg-[#201f22]/50 border border-white/5 rounded-2xl p-5 flex flex-col gap-3">
                  <p className="text-xs text-zinc-300 leading-relaxed font-light">
                    {lang === 'no'
                      ? 'Ludvis Mediaspiller er en elegant, maskinvareakselerert mediespiller for Linux, bygget med Tauri v2 og React.'
                      : 'Ludvis Media Player is an elegant, hardware-accelerated media player for Linux, built with Tauri v2 and React.'}
                  </p>
                  <p className="text-[10px] text-zinc-500 font-mono">
                    © 2026 Ludvig. All rights reserved.
                  </p>
                </div>
              </div>

              {/* Restart Notification */}
              {isRestartRequired && (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-2xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 mt-0.5 flex-shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <div className="flex-1 flex flex-col gap-1 text-left">
                    <span className="text-xs font-semibold">{lang === 'no' ? 'Restart påkrevd' : 'Restart Required'}</span>
                    <span className="text-[10px] leading-relaxed text-amber-200/80">
                      {lang === 'no' 
                        ? 'Innstillingene for grafikkmotor og WebKit krever at du starter applikasjonen på nytt for å tre i kraft.' 
                        : 'Graphics engine and WebKit options require an application restart to take effect.'}
                    </span>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Footer Area with Done Button */}
          <div className="mt-4 pt-2 border-t border-white/5 flex justify-end">
            <button
              onClick={() => setShowSettings(false)}
              className="px-6 py-2 bg-[#423d4f] hover:bg-[#524b61] active:scale-95 text-zinc-100 font-semibold text-xs rounded-xl shadow-lg transition-all cursor-pointer uppercase tracking-wider"
            >
              {lang === 'no' ? 'Ferdig' : 'Done'}
            </button>
          </div>

        </div>
      ) : (
        /* Main Music Player View */
        <>
          <header className="mb-8 text-center relative z-50 flex flex-col items-center" data-tauri-drag-region>

            <h1 
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => handleTitleChange(e.currentTarget.textContent || 'Ludvis - Mediaspiller')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              className="text-3xl text-zinc-100 outline-none hover:bg-white/5 rounded-lg px-4 py-1 cursor-text transition-all font-cursive normal-case"
              title={lang === 'no' ? 'Klikk for å endre tittel' : 'Click to change title'}
            >
              {appTitle}
            </h1>
            <div ref={dropdownRef} className="relative mt-2 z-50">
              <button
                onClick={() => setShowSourceDropdown(!showSourceDropdown)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 hover:border-white/20 transition-all text-xs font-semibold text-zinc-300 tracking-wider uppercase cursor-pointer"
              >
                <span>
                  {audioSourceMode === 'auto' && `⚡ ${t.automatic}`}
                  {audioSourceMode === 'local' && `📁 ${t.localMode}`}
                  {audioSourceMode === 'system' && `🎧 ${t.systemAudio} (${mprisState.playerName !== 'None' ? mprisState.playerName : 'Spotify'})`}
                </span>
                {audioSourceMode === 'auto' && (
                  <span className="text-[10px] text-zinc-500 font-normal">
                    ({isLocalMode ? t.local : mprisState.playerName !== 'None' ? mprisState.playerName : t.systemAudio})
                  </span>
                )}
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  viewBox="0 0 20 20" 
                  fill="currentColor" 
                  className={`w-4 h-4 text-zinc-400 transition-transform duration-300 ${showSourceDropdown ? 'rotate-180' : ''}`}
                >
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>

              {showSourceDropdown && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-zinc-900/95 border border-white/10 backdrop-blur-xl rounded-2xl p-1.5 shadow-2xl flex flex-col gap-1 z-50 transition-all duration-200">
                  
                  <button
                    onClick={() => {
                      setAudioSourceMode('auto');
                      setShowSourceDropdown(false);
                    }}
                    className={`flex flex-col items-start w-full text-left px-3 py-2 rounded-xl transition-colors cursor-pointer ${
                      audioSourceMode === 'auto' 
                        ? 'bg-white/10 text-white font-medium' 
                        : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
                      <span>⚡ {t.automatic}</span>
                      {audioSourceMode === 'auto' && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />}
                    </div>
                    <span className="text-[10px] text-zinc-500 font-light mt-0.5">{t.automaticDesc}</span>
                  </button>

                  <button
                    onClick={() => {
                      setAudioSourceMode('local');
                      setShowSourceDropdown(false);
                    }}
                    className={`flex flex-col items-start w-full text-left px-3 py-2 rounded-xl transition-colors cursor-pointer ${
                      audioSourceMode === 'local' 
                        ? 'bg-white/10 text-white font-medium' 
                        : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
                      <span>📁 {t.localMode}</span>
                      {audioSourceMode === 'local' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                    </div>
                    <span className="text-[10px] text-zinc-500 font-light mt-0.5">{t.localDesc}</span>
                  </button>

                  <button
                    onClick={() => {
                      setAudioSourceMode('system');
                      setShowSourceDropdown(false);
                    }}
                    className={`flex flex-col items-start w-full text-left px-3 py-2 rounded-xl transition-colors cursor-pointer ${
                      audioSourceMode === 'system' 
                        ? 'bg-white/10 text-white font-medium' 
                        : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
                      <span>🎧 {t.systemAudio}</span>
                      {audioSourceMode === 'system' && <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />}
                    </div>
                    <span className="text-[10px] text-zinc-500 font-light mt-0.5">{t.systemDesc}</span>
                  </button>

                </div>
              )}
            </div>
          </header>

          <main className="relative z-10 flex flex-col md:flex-row items-center justify-center gap-6 md:gap-0 max-w-4xl w-full">
            
            {/* Vinyl Record Section */}
            <div className="md:translate-x-10 z-20 transition-all duration-500 drop-shadow-[0_25px_25px_rgba(0,0,0,0.6)]">
              <VinylRecord
                isPlaying={currentIsPlaying}
                onPlayPause={handlePlayPauseToggle}
                coverUrl={currentCover}
                albumName={isLocalMode ? (currentTrack ? currentTrack.title : '') : mprisState.album}
                artistName={currentArtist}
                size={360}
                currentTime={currentProgress}
                duration={currentDuration}
              />
            </div>

            {/* Flippable Glassmorphic Player Card */}
            <div className="w-full max-w-md perspective-1000 h-[390px] relative z-30">
              <div className={`w-full h-full transition-transform duration-700 transform-style-3d relative ${showPlaylist ? 'rotate-y-180' : ''}`}>
                
                {/* FRONT SIDE (Active Track View) */}
                <div className={`absolute inset-0 w-full h-full backface-hidden bg-white/5 border border-white/10 backdrop-blur-xl rounded-3xl p-8 shadow-2xl flex flex-col justify-between transition-all duration-500 text-center ${showPlaylist ? 'opacity-0 pointer-events-none invisible' : 'opacity-100'}`}>
                  
                  {/* Action buttons on Top Right */}
                  <div className="absolute top-6 right-6 flex items-center gap-3">
                    <button 
                      onClick={toggleLike}
                      className={`transition-colors duration-200 ${
                        isCurrentTrackLiked ? 'text-rose-500' : 'text-zinc-400 hover:text-rose-400'
                      }`}
                      aria-label="Like track"
                    >
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        fill={isCurrentTrackLiked ? 'currentColor' : 'none'} 
                        viewBox="0 0 24 24" 
                        strokeWidth={1.5} 
                        stroke="currentColor" 
                        className="w-6 h-6"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                      </svg>
                    </button>

                    <button 
                      onClick={() => setShowPlaylist(true)}
                      className="text-zinc-400 hover:text-white transition-colors duration-200"
                      aria-label="Show Playlist"
                      title="Spilleliste"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M12 17.25h8.25" />
                      </svg>
                    </button>
                  </div>

                  {/* Card Center Info */}
                  <div className="flex flex-col items-center mt-8">
                    <h2 className="text-2xl font-semibold tracking-tight text-white mb-1 transition-all duration-300 w-full truncate px-8">
                      {currentTitle}
                    </h2>
                    <p className="text-sm font-medium text-zinc-400 w-full truncate px-8">
                      {currentArtist}
                    </p>
                  </div>

                  {/* Lyric / Album snippet */}
                  <div className="my-1 min-h-[44px] flex items-center justify-center">
                    <p className="text-xs text-zinc-400 italic font-light tracking-wide leading-relaxed px-6 line-clamp-2" title={currentQuote}>
                      "{currentQuote}"
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full mb-1">
                    <div 
                      onClick={handleSeek}
                      className={`relative w-full h-1.5 bg-white/10 rounded-full mb-1 ${isLocalMode ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      <div 
                        className={`absolute top-0 left-0 h-full bg-white rounded-full ${isLocalMode ? 'transition-all duration-200 ease-linear' : 'transition-none'}`}
                        style={{ width: `${currentDuration > 0 ? (currentProgress / currentDuration) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                      <span>{formatTime(currentProgress)}</span>
                      <span>{formatTime(currentDuration)}</span>
                    </div>
                  </div>

                  {/* Player controls */}
                  <div className="flex items-center justify-center gap-6 mb-2">
                    {/* Shuffle */}
                    <button 
                      onClick={() => setIsShuffle(!isShuffle)}
                      className={`transition-colors duration-200 ${isShuffle ? 'text-sky-400' : 'text-zinc-400 hover:text-white'} ${!isLocalMode && 'opacity-30 cursor-not-allowed'}`}
                      title="Shuffle"
                      disabled={!isLocalMode}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.656 48.656 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3M3 12c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M3 12l-3 3m3-3 3 3" />
                      </svg>
                    </button>

                    {/* Prev */}
                    <button 
                      onClick={handlePrevTrack}
                      className="text-zinc-300 hover:text-white transition-colors duration-200"
                      title="Previous Track"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                        <path d="M9.195 18.44c1.25.713 2.805-.19 2.805-1.629v-2.34l6.945 3.968c1.25.714 2.805-.188 2.805-1.628V7.188c0-1.44-1.555-2.342-2.805-1.628L12 9.528v-2.34c0-1.44-1.555-2.343-2.805-1.629L2.25 9.528c-1.25.714-1.25 2.518 0 3.232l6.945 3.968z" />
                      </svg>
                    </button>

                    {/* Play/Pause */}
                    <button 
                      onClick={handlePlayPauseToggle}
                      className="w-16 h-16 rounded-full bg-white text-zinc-950 flex items-center justify-center shadow-lg transition-transform duration-200 transform hover:scale-105 active:scale-95"
                      title={currentIsPlaying ? 'Pause' : 'Play'}
                    >
                      {currentIsPlaying ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                          <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25zm7.5 0A.75.75 0 0 1 15 4.5h1.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H15a.75.75 0 0 1-.75-.75V5.25z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 translate-x-[1.5px]">
                          <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>

                    {/* Next */}
                    <button 
                      onClick={handleNextTrack}
                      className="text-zinc-300 hover:text-white transition-colors duration-200"
                      title="Next Track"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                        <path d="M5.055 7.06c-1.25-.714-2.805.189-2.805 1.628v8.123c0 1.44 1.555 2.342 2.805 1.628L12 14.472v2.34c0 1.44 1.555 2.342 2.805 1.628l6.945-3.968c1.25-.714 1.25-2.518 0-3.232l-6.945-3.968C13.555 6.558 12 7.46 12 8.9v2.34L5.055 7.06z" />
                      </svg>
                    </button>

                    {/* Repeat */}
                    <button 
                      onClick={() => setIsRepeat(!isRepeat)}
                      className={`transition-colors duration-200 ${isRepeat ? 'text-sky-400' : 'text-zinc-400 hover:text-white'} ${!isLocalMode && 'opacity-30 cursor-not-allowed'}`}
                      title="Repeat"
                      disabled={!isLocalMode}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                      </svg>
                    </button>
                  </div>

                  {/* Volume Slider */}
                  <div className="flex items-center gap-3 mt-2 w-full px-1">
                    <button 
                      onClick={toggleMute}
                      className="text-zinc-400 hover:text-white transition-colors duration-200"
                      title={mprisState.volume === 0 ? "Opphev demping" : "Demp"}
                    >
                      {mprisState.volume === 0 ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                        </svg>
                      ) : mprisState.volume < 0.4 ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                        </svg>
                      )}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={mprisState.volume}
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white hover:bg-white/20 transition-all duration-200"
                    />
                    <span className="text-[10px] text-zinc-500 font-mono w-8 text-right select-none">
                      {Math.round(mprisState.volume * 100)}%
                    </span>
                  </div>

                </div>

                {/* BACK SIDE (Playlist View) */}
                <div className={`absolute inset-0 w-full h-full backface-hidden rotate-y-180 bg-white/5 border border-white/10 backdrop-blur-xl rounded-3xl p-6 shadow-2xl flex flex-col justify-between transition-all duration-500 text-left ${!showPlaylist ? 'opacity-0 pointer-events-none invisible' : 'opacity-100'}`}>
                  
                  {/* Card Top Info */}
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-semibold tracking-wider text-zinc-200 uppercase">
                      {t.localMode}
                    </h3>
                    
                    <button 
                      onClick={() => setShowPlaylist(false)}
                      className="text-zinc-400 hover:text-white transition-colors duration-200"
                      aria-label="Show Player"
                      title={t.closePlaylist}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Directory Scan Section */}
                  <div className="flex flex-col gap-1.5 mb-2">
                    <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">{t.playbackFolder}</span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={musicPath}
                        onChange={(e) => setMusicPath(e.target.value)}
                        placeholder={t.playbackFolderPlaceholder}
                        className="flex-1 text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-white/35 transition-colors font-mono"
                      />
                      <button
                        onClick={() => scanLocalFolder()}
                        disabled={isLoadingLocal}
                        className="px-3 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 text-xs text-white rounded-lg transition-all font-semibold cursor-pointer"
                      >
                        {isLoadingLocal ? t.scanning : t.scan}
                      </button>
                    </div>
                    {scanError && (
                      <span className="text-[10px] text-rose-400 font-light truncate mt-0.5">{scanError}</span>
                    )}
                  </div>

                  {/* Scrollable Playlist Area */}
                  <div className="flex-1 overflow-y-auto max-h-[190px] pr-1 flex flex-col gap-1.5 my-1">
                    {currentPlaylist.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
                        <p className="text-xs text-zinc-400">{t.noSongsFound}</p>
                      </div>
                    ) : (
                      currentPlaylist.map((track, idx) => {
                        const isCurrent = isLocalMode && idx === currentTrackIndex;
                        return (
                          <div 
                            key={track.id + '-' + idx}
                            onClick={() => {
                              setCurrentTrackIndex(idx);
                              if (audioSourceModeRef.current === 'system') {
                                setAudioSourceMode('auto');
                              }
                              setIsLocalMode(true);
                              setIsPlayingLocal(true);
                              setShowPlaylist(false);
                            }}
                            className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-colors duration-200 ${
                              isCurrent ? 'bg-white/15 border-l-2 border-white' : 'hover:bg-white/5 border-l-2 border-transparent'
                            }`}
                          >
                            <div className="w-8 h-8 rounded-lg bg-zinc-700/50 flex items-center justify-center text-xs text-zinc-400 font-bold overflow-hidden">
                              {track.coverUrl ? (
                                <img src={track.coverUrl} className="w-full h-full object-cover" alt="" />
                              ) : (
                                <span>♫</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-semibold truncate ${isCurrent ? 'text-white' : 'text-zinc-200'}`}>{track.title}</p>
                              <p className="text-[10px] text-zinc-400 truncate">{track.artist}</p>
                            </div>
                            {track.duration ? (
                              <span className="text-[10px] text-zinc-500 font-mono">{formatTime(track.duration)}</span>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Card Footer Actions */}
                  <div className="text-[10px] text-zinc-500 flex items-center justify-between border-t border-white/10 pt-3 mt-1">
                    <span>{t.totalSongs}: {currentPlaylist.length} {lang === 'no' ? 'sanger' : lang === 'es' ? 'canciones' : 'songs'}</span>
                    
                    {mprisState.playerName !== 'None' && (
                      <button
                        onClick={() => {
                          setAudioSourceMode('system');
                          setShowPlaylist(false);
                        }}
                        className="text-sky-400 hover:text-sky-300 font-semibold hover:underline flex items-center gap-1 transition-all cursor-pointer"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                        {t.connectLive} ({mprisState.playerName})
                      </button>
                    )}
                  </div>

                </div>

              </div>
            </div>

          </main>
        </>
      )}

      {/* Bottom Right Resize Grab Handle */}
      <div 
        onMouseDown={handleResizeMouseDown}
        className={`absolute bottom-1 right-1 z-50 w-6 h-6 flex items-end justify-end cursor-se-resize p-1 select-none transition-opacity duration-300 text-white/20 hover:text-white/60 active:text-white ${shouldShowControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        title={lang === 'no' ? 'Dra for å endre størrelse' : 'Drag to resize'}
      >
        <svg 
          className="w-3 h-3 transition-colors duration-150" 
          viewBox="0 0 10 10" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="8" y1="5" x2="5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="8" y1="8" x2="8" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
