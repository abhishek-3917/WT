import React, { useEffect, useRef, useState, useCallback } from 'react';
import socket from '../../services/socket';
import Hls from 'hls.js';
import { 
  Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, 
  RefreshCw, RotateCcw, ShieldAlert, Sparkles, CheckCircle2,
  Tv, Film, AlertTriangle, Loader2, Monitor, ExternalLink,
  Radio, Globe, Compass, Timer, Copy, Check, Zap, Languages,
  Mic, MicOff, Video, VideoOff, User, Crown, Key, Lock,
  ChevronDown, ChevronUp, Camera, CameraOff, X, GripHorizontal, Move,
  List, SkipForward, Layers, Search
} from 'lucide-react';

export const formatLanguageName = (track) => {
  if (!track) return 'Default Audio';
  const rawLang = (track.lang || '').toLowerCase().trim();
  const rawName = (track.name || '').trim();

  const langMap = {
    'hin': 'Hindi (हिन्दी)',
    'hi': 'Hindi (हिन्दी)',
    'hindi': 'Hindi (हिन्दी)',
    'eng': 'English',
    'en': 'English',
    'english': 'English',
    'spa': 'Spanish (Español)',
    'es': 'Spanish (Español)',
    'spanish': 'Spanish (Español)',
    'fre': 'French (Français)',
    'fra': 'French (Français)',
    'fr': 'French (Français)',
    'french': 'French (Français)',
    'ger': 'German (Deutsch)',
    'deu': 'German (Deutsch)',
    'de': 'German (Deutsch)',
    'german': 'German (Deutsch)',
    'ita': 'Italian (Italiano)',
    'it': 'Italian (Italiano)',
    'italian': 'Italian (Italiano)',
    'jpn': 'Japanese (日本語)',
    'ja': 'Japanese (日本語)',
    'japanese': 'Japanese (日本語)',
    'kor': 'Korean (한국어)',
    'ko': 'Korean (한국어)',
    'korean': 'Korean (한국어)',
    'zho': 'Chinese (中文)',
    'chi': 'Chinese (中文)',
    'zh': 'Chinese (中文)',
    'chinese': 'Chinese (中文)',
    'rus': 'Russian (Русский)',
    'ru': 'Russian (Русский)',
    'russian': 'Russian (Русский)',
    'tam': 'Tamil (தமிழ்)',
    'ta': 'Tamil (தமிழ்)',
    'tamil': 'Tamil (தமிழ்)',
    'tel': 'Telugu (తెలుగు)',
    'te': 'Telugu (తెలుగు)',
    'telugu': 'Telugu (తెలుగు)',
    'mal': 'Malayalam (മലയാളം)',
    'ml': 'Malayalam (മലയാളം)',
    'kan': 'Kannada (ಕನ್ನಡ)',
    'kn': 'Kannada (ಕನ್ನಡ)',
    'ben': 'Bengali (বাংলা)',
    'bn': 'Bengali (বাংলা)',
    'por': 'Portuguese (Português)',
    'pt': 'Portuguese (Português)',
    'portuguese': 'Portuguese (Português)',
    'ara': 'Arabic (العربية)',
    'ar': 'Arabic (العربية)',
    'arabic': 'Arabic (العربية)',
    'tur': 'Turkish (Türkçe)',
    'tr': 'Turkish (Türkçe)',
    'turkish': 'Turkish (Türkçe)'
  };

  if (rawLang && langMap[rawLang]) return langMap[rawLang];
  if (rawName && langMap[rawName.toLowerCase()]) return langMap[rawName.toLowerCase()];
  if (rawName && !rawName.toLowerCase().startsWith('audio_') && !rawName.toLowerCase().startsWith('track_')) {
    return rawName;
  }
  if (rawLang && rawLang !== 'und') {
    return rawLang.toUpperCase();
  }
  return `Audio Track ${track.id !== undefined ? Number(track.id) + 1 : ''}`;
};

export default function SyncedPlayer({ 
  room, 
  currentUser, 
  members = [],
  onRequestSync, 
  onOpenCatalog = null,
  reactions = [],
  isScreenSharing = false,
  localStream = null,
  remoteStreams = {},
  isAudioMuted = false,
  isVideoMuted = false,
  onToggleAudio = null,
  onToggleVideo = null,
  onToggleScreenShare = null
}) {
  const videoRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const screenVideoRef = useRef(null);
  const iframeRef = useRef(null);
  const playerContainerRef = useRef(null);
  const localFsVideoRef = useRef(null);
  const remoteFsVideoRef = useRef(null);
  const isRemoteAction = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFloatingCam, setShowFloatingCam] = useState(false);
  const [isFloatingCamMinimized, setIsFloatingCamMinimized] = useState(false);
  const [floatingCamPos, setFloatingCamPos] = useState({ x: null, y: null }); // null = default top-right
  const [isDraggingCam, setIsDraggingCam] = useState(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, camX: 0, camY: 0 });
  const floatingCamRef = useRef(null);

  // Draggable Floating Video Chat in Fullscreen & Theater mode
  const handleDragStart = useCallback((e) => {
    if (e.target.closest('button')) return;

    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    if (clientX === undefined || clientY === undefined) return;

    const el = floatingCamRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    dragStartRef.current = {
      mouseX: clientX,
      mouseY: clientY,
      camX: rect.left,
      camY: rect.top
    };

    setIsDraggingCam(true);

    const onMove = (moveEvent) => {
      const curX = moveEvent.clientX ?? moveEvent.touches?.[0]?.clientX;
      const curY = moveEvent.clientY ?? moveEvent.touches?.[0]?.clientY;
      if (curX === undefined || curY === undefined) return;

      const deltaX = curX - dragStartRef.current.mouseX;
      const deltaY = curY - dragStartRef.current.mouseY;

      let newX = dragStartRef.current.camX + deltaX;
      let newY = dragStartRef.current.camY + deltaY;

      // Clamping within viewport boundaries
      const camWidth = el.offsetWidth || 320;
      const camHeight = el.offsetHeight || 220;
      const maxX = Math.max(0, window.innerWidth - camWidth - 10);
      const maxY = Math.max(0, window.innerHeight - camHeight - 10);

      newX = Math.max(10, Math.min(newX, maxX));
      newY = Math.max(10, Math.min(newY, maxY));

      setFloatingCamPos({ x: newX, y: newY });
    };

    const onEnd = () => {
      setIsDraggingCam(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }, []);
  const [streamServer, setStreamServer] = useState('primary'); // 'primary' | 'backup'
  const [showControls, setShowControls] = useState(true);
  const [syncStatus, setSyncStatus] = useState('synced');
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [mediaError, setMediaError] = useState(null);
  const [permissionNotice, setPermissionNotice] = useState(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  // Platform Co-Watch & In-Website Window States
  const [countdown, setCountdown] = useState(null);
  const [portalUrl, setPortalUrl] = useState('');
  const [custom1fmoviesUrl, setCustom1fmoviesUrl] = useState('');
  const [useProxy, setUseProxy] = useState(true); // Default to true to enable script injection auto-sync!

  const controlsTimeoutRef = useRef(null);

  const media = room?.media;
  const isHost = currentUser?.isHost;
  const remoteControllerId = room?.remoteControllerId || room?.hostId;
  const remoteControllerName = room?.remoteControllerName || room?.hostName || 'Host';
  const holdsRemote = currentUser?.socketId === remoteControllerId || (!room?.remoteControllerId && isHost);
  const canControl = holdsRemote || isHost || room?.settings?.controlMode === 'open';

  // State for direct HLS stream resolution (converts third-party iframe embeds into native synced player)
  const [resolvedHlsUrl, setResolvedHlsUrl] = useState(null);
  const [isResolvingStream, setIsResolvingStream] = useState(false);
  const hlsRef = useRef(null);
  const lastHeartbeatRef = useRef(0);
  const [audioTracks, setAudioTracks] = useState([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState(0);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [qualityLevels, setQualityLevels] = useState([]);
  const [currentQualityLevel, setCurrentQualityLevel] = useState(-1);
  const [selectedQuality, setSelectedQuality] = useState('2160p');
  const [qualityNotice, setQualityNotice] = useState(null);
  const [audioNotice, setAudioNotice] = useState(null);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  // In-Player TV Series Season & Episode Selector Drawer
  const [showEpisodesDrawer, setShowEpisodesDrawer] = useState(false);
  const [playerTvDetails, setPlayerTvDetails] = useState(null);
  const [playerActiveSeason, setPlayerActiveSeason] = useState(media?.season || 1);
  const [playerSeasonEpisodes, setPlayerSeasonEpisodes] = useState([]);
  const [playerLoadingEpisodes, setPlayerLoadingEpisodes] = useState(false);

  const handleToggleEpisodesDrawer = async () => {
    const nextState = !showEpisodesDrawer;
    setShowEpisodesDrawer(nextState);
    if (!nextState) return;

    const detectedTmdbId = media?.tmdbId ||
      (media?.id && media?.id.match(/(?:tmdb|7reels|1fmovies)-(\d+)/)?.[1]) ||
      (media?.url?.match(/tmdb_id=(\d+)/)?.[1]) ||
      (media?.url?.match(/(?:movie|tv)\/(\d+)/)?.[1]);

    if (!detectedTmdbId) return;

    const currentSeason = media?.season || 1;
    setPlayerActiveSeason(currentSeason);
    setPlayerLoadingEpisodes(true);

    try {
      const res = await fetch(`/api/tv-details?tmdbId=${detectedTmdbId}`);
      if (res.ok) {
        const data = await res.json();
        setPlayerTvDetails(data);
      }
      const epRes = await fetch(`/api/tv-season?tmdbId=${detectedTmdbId}&season=${currentSeason}`);
      if (epRes.ok) {
        const epData = await epRes.json();
        setPlayerSeasonEpisodes(epData.episodes || []);
      }
    } catch (e) {
      console.warn('[Player TV Details Error]', e);
    } finally {
      setPlayerLoadingEpisodes(false);
    }
  };

  const handlePlayerSelectSeason = async (seasonNum) => {
    setPlayerActiveSeason(seasonNum);
    const detectedTmdbId = media?.tmdbId ||
      (media?.id && media?.id.match(/(?:tmdb|7reels|1fmovies)-(\d+)/)?.[1]) ||
      (media?.url?.match(/tmdb_id=(\d+)/)?.[1]) ||
      (media?.url?.match(/(?:movie|tv)\/(\d+)/)?.[1]);
    if (!detectedTmdbId) return;

    setPlayerLoadingEpisodes(true);
    try {
      const epRes = await fetch(`/api/tv-season?tmdbId=${detectedTmdbId}&season=${seasonNum}`);
      if (epRes.ok) {
        const epData = await epRes.json();
        setPlayerSeasonEpisodes(epData.episodes || []);
      }
    } catch (e) {
      console.warn('[Player Season Episodes Error]', e);
    } finally {
      setPlayerLoadingEpisodes(false);
    }
  };

  const handlePlayerSelectEpisode = async (seasonNum, episodeNum, epName) => {
    if (!canControl) {
      triggerPermissionNotice();
      return;
    }

    const detectedTmdbId = media?.tmdbId ||
      (media?.id && media?.id.match(/(?:tmdb|7reels|1fmovies)-(\d+)/)?.[1]) ||
      (media?.url?.match(/tmdb_id=(\d+)/)?.[1]) ||
      (media?.url?.match(/(?:movie|tv)\/(\d+)/)?.[1]);

    setShowEpisodesDrawer(false);

    try {
      const res = await fetch(`/api/resolve-stream?tmdbId=${detectedTmdbId}&type=series&season=${seasonNum}&episode=${episodeNum}`);
      const data = await res.json();
      const newUrl = (data.success && data.streamUrl) ? data.streamUrl : media.url;

      socket.emit('media_change', {
        roomId: room.id,
        media: {
          ...media,
          id: `media-${detectedTmdbId}-s${seasonNum}e${episodeNum}-${Date.now()}`,
          url: newUrl,
          type: newUrl?.includes('.m3u8') ? 'hls' : media.type,
          isTv: true,
          season: seasonNum,
          episode: episodeNum,
          episodeTitle: epName,
          title: media.title,
          currentTime: 0,
          isPlaying: true
        }
      });
    } catch (e) {
      console.warn('[Player Select Episode Error]', e);
    }
  };

  const handlePlayerNextEpisode = () => {
    if (!canControl) {
      triggerPermissionNotice();
      return;
    }
    const currentSeason = media?.season || 1;
    const currentEpisode = media?.episode || 1;
    handlePlayerSelectEpisode(currentSeason, currentEpisode + 1, `Episode ${currentEpisode + 1}`);
  };

  const hasTmdbStream = Boolean(
    media?.tmdbId ||
    media?.url?.match(/tmdb_id=(\d+)/) ||
    media?.url?.match(/(?:movie|tv)\/(\d+)/) ||
    media?.backupUrl?.match(/(?:movie|tv)\/(\d+)/) ||
    (media?.id && media?.id.match(/(?:tmdb|7reels|1fmovies)-(\d+)/))
  );

  const isFrom7Reels = Boolean(
    media?.source === '7REELS' || 
    media?.platform === '7reels' || 
    media?.type === '7reels' ||
    media?.id?.toString().startsWith('7reels') || 
    media?.url?.includes('7reels.cc') || 
    media?.url?.includes('vidbolt') ||
    media?.url?.includes('rousav.tech')
  );

  // Direct HLS / Native video streams (rendered in HTML5 synchronized video player)
  const isDirectStream = Boolean(
    resolvedHlsUrl || 
    media?.type === 'hls' || 
    media?.type === 'video' ||
    media?.url?.includes('.m3u8') ||
    media?.url?.includes('rousav.tech') ||
    media?.url?.includes('media.silverlinehub.org') ||
    (media?.url && (media.url.endsWith('.mp4') || media.url.endsWith('.webm')))
  );

  const isNativeVideo = isDirectStream || (hasTmdbStream && isResolvingStream);

  // In-Website Portal / Embed Window (ONLY for web pages that cannot be resolved to direct HLS)
  const isPortalType = !isNativeVideo && (
    media?.type === '1fmovies' || 
    media?.type === '7reels' || 
    media?.type === 'platform' || 
    media?.type === 'portal' || 
    media?.url?.includes('1fmovies.live') || 
    media?.url?.includes('7reels.cc') ||
    media?.url?.includes('anyembed.xyz')
  );

  // Original quality options fetched separately for 7REELS and 1Fmovies (highest quality available)
  const availableQualityOptions = React.useMemo(() => {
    const is7Reels = media?.source === '7REELS' || media?.platform === '7reels' || media?.url?.includes('7reels') || media?.url?.includes('vidy.st');
    const is1Fmovies = media?.source === '1Fmovies' || media?.platform === '1fmovies' || media?.url?.includes('1fmovies') || media?.url?.includes('anyembed');

    if (is7Reels) {
      // 7REELS Original Qualities: 2160p (4K UHD), 1080p (Full HD), 720p (HD), 480p (SD), Auto
      return [
        {
          id: '2160p',
          label: '2160p (4K UHD)',
          shortLabel: '2160p 4K',
          height: 2160,
          badge: '2160p 4K',
          badgeClass: 'bg-amber-500/25 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-500/30',
          description: '7REELS Original 2160p (4K Ultra HD)'
        },
        {
          id: '1080p',
          label: '1080p (Full HD)',
          shortLabel: '1080p',
          height: 1080,
          badge: '1080p',
          badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-sm shadow-indigo-500/20',
          description: '7REELS Original 1080p (Full HD)'
        },
        {
          id: '720p',
          label: '720p (HD)',
          shortLabel: '720p',
          height: 720,
          badge: '720p',
          badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
          description: '7REELS Original 720p (HD)'
        },
        {
          id: '480p',
          label: '480p (SD)',
          shortLabel: '480p',
          height: 480,
          badge: '480p',
          badgeClass: 'bg-slate-700/50 text-slate-300 border-slate-600',
          description: '7REELS Original 480p (SD)'
        },
        {
          id: 'auto',
          label: 'Auto (Adaptive)',
          shortLabel: 'Auto',
          height: -1,
          badge: 'Auto',
          badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          description: '7REELS Adaptive Stream Quality'
        }
      ];
    }

    if (is1Fmovies) {
      // 1Fmovies Original Qualities: 1080p (Full HD), 720p (HD), 480p (SD), 360p, Auto
      return [
        {
          id: '1080p',
          label: '1080p (Full HD)',
          shortLabel: '1080p',
          height: 1080,
          badge: '1080p',
          badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          description: '1Fmovies Original 1080p (Full HD)'
        },
        {
          id: '720p',
          label: '720p (HD)',
          shortLabel: '720p',
          height: 720,
          badge: '720p',
          badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
          description: '1Fmovies Original 720p (HD)'
        },
        {
          id: '480p',
          label: '480p (SD)',
          shortLabel: '480p',
          height: 480,
          badge: '480p',
          badgeClass: 'bg-slate-700/50 text-slate-300 border-slate-600',
          description: '1Fmovies Original 480p (SD)'
        },
        {
          id: '360p',
          label: '360p (Data Saver)',
          shortLabel: '360p',
          height: 360,
          badge: '360p',
          badgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
          description: '1Fmovies Original 360p (Data Saver)'
        },
        {
          id: 'auto',
          label: 'Auto (Adaptive)',
          shortLabel: 'Auto',
          height: -1,
          badge: 'Auto',
          badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          description: '1Fmovies Adaptive Stream Quality'
        }
      ];
    }

    // Direct HLS stream: fetch ALL EXACT levels from playlist (highest resolution first)
    if (qualityLevels && qualityLevels.length > 0) {
      const uniqueHeights = [...new Set(qualityLevels.map(l => l.height).filter(h => h > 0))].sort((a, b) => b - a);
      const hlsOptions = uniqueHeights.map(h => {
        const lvlIdx = qualityLevels.findIndex(l => l.height === h);
        let badgeClass = 'bg-slate-700/50 text-slate-300 border-slate-600';
        let label = `${h}p`;
        let badge = `${h}p`;

        if (h >= 2160) {
          badgeClass = 'bg-amber-500/25 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-500/30';
          label = `${h}p (4K UHD)`;
          badge = '2160p 4K';
        } else if (h >= 1440) {
          badgeClass = 'bg-purple-500/20 text-purple-300 border-purple-500/40';
          label = `${h}p (2K QHD)`;
          badge = '1440p 2K';
        } else if (h >= 1080) {
          badgeClass = 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
          label = `${h}p (Full HD)`;
          badge = '1080p FHD';
        } else if (h >= 720) {
          badgeClass = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
          label = `${h}p (HD)`;
          badge = '720p HD';
        }

        return {
          id: `${h}p`,
          label,
          shortLabel: `${h}p`,
          height: h,
          levelIndex: lvlIdx,
          badge,
          badgeClass,
          description: `Original Stream ${h}p Quality`
        };
      });

      const activeHeight = currentQualityLevel >= 0 && qualityLevels[currentQualityLevel]
        ? qualityLevels[currentQualityLevel].height
        : null;

      hlsOptions.push({
        id: 'auto',
        label: 'Auto (Adaptive)',
        shortLabel: activeHeight ? `Auto • ${activeHeight}p` : 'Auto',
        height: -1,
        levelIndex: -1,
        badge: 'Auto',
        badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        description: 'Auto adaptive stream quality'
      });

      return hlsOptions;
    }

    // Generic fallback (highest quality available)
    return [
      { id: '2160p', label: '2160p (4K UHD)', shortLabel: '2160p 4K', height: 2160, badge: '2160p 4K', badgeClass: 'bg-amber-500/25 text-amber-300 border-amber-500/50', description: '4K Ultra HD' },
      { id: '1080p', label: '1080p (Full HD)', shortLabel: '1080p', height: 1080, badge: '1080p', badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40', description: 'Full HD' },
      { id: '720p', label: '720p (HD)', shortLabel: '720p', height: 720, badge: '720p', badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40', description: 'HD' },
      { id: '480p', label: '480p (SD)', shortLabel: '480p', height: 480, badge: '480p', badgeClass: 'bg-slate-700/50 text-slate-300 border-slate-600', description: 'SD' },
      { id: 'auto', label: 'Auto (Adaptive)', shortLabel: 'Auto', height: -1, badge: 'Auto', badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', description: 'Adaptive' }
    ];
  }, [media?.source, media?.platform, media?.url, qualityLevels, currentQualityLevel]);

  useEffect(() => {
    // Immediately clear previous stream & reset player state when movie/show changes
    setResolvedHlsUrl(null);
    setPortalUrl(media?.url || '');
    setCustom1fmoviesUrl(media?.url || '');
    setCurrentTime(0);
    setDuration(0);
    setQualityLevels([]);
    setCurrentQualityLevel(-1);

    // Default to highest quality available
    if (media?.source === '7REELS' || media?.platform === '7reels') setSelectedQuality('2160p');
    else if (media?.source === '1Fmovies' || media?.platform === '1fmovies') setSelectedQuality('1080p');
    else setSelectedQuality('2160p');

    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
        hlsRef.current = null;
      } catch (e) {}
    }
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      } catch (e) {}
    }

    if (media?.url?.includes('.m3u8')) {
      setResolvedHlsUrl(media.url);
      if (media.audioTracks && media.audioTracks.length > 0) {
        setAudioTracks(media.audioTracks);
      }
      setIsResolvingStream(false);
      return;
    }

    const detectedTmdbId = media?.tmdbId ||
      (media?.id && media?.id.match(/(?:tmdb|7reels|1fmovies)-(\d+)/)?.[1]) ||
      (media?.url?.match(/tmdb_id=(\d+)/)?.[1]) ||
      (media?.url?.match(/(?:movie|tv)\/(\d+)/)?.[1]) ||
      (media?.backupUrl?.match(/(?:movie|tv)\/(\d+)/)?.[1]);

    if (detectedTmdbId && media?.type !== 'platform' && !media?.url?.includes('.m3u8')) {
      const tmdbId = detectedTmdbId;
      const isTv = Boolean(
        media?.isTv || 
        media?.platform === 'tv' || 
        media?.genre?.includes('Series') || 
        media?.duration === 'Series' || 
        media?.url?.includes('type=series') || 
        media?.backupUrl?.includes('tmdb-tv') || 
        media?.url?.includes('/tv/') || 
        media?.backupUrl?.includes('/tv/') ||
        media?.season
      );
      const season = media?.season || 1;
      const episode = media?.episode || 1;
      const is7Reels = Boolean(
        media?.source === '7REELS' || 
        media?.platform === '7reels' || 
        media?.id?.toString().startsWith('7reels') || 
        media?.url?.includes('7reels') ||
        media?.url?.includes('vidbolt') ||
        media?.url?.includes('rousav.tech')
      );
      const sourceParam = `&source=${is7Reels ? '7REELS' : '1Fmovies'}`;
      const seriesQuery = isTv ? `&type=series&season=${season}&episode=${episode}` : '&type=movie';
      console.log('[Auto-HLS] Resolving direct stream for TMDB', tmdbId, 'isTv:', isTv, `S${season}:E${episode}`, 'Source:', is7Reels ? '7REELS' : '1Fmovies');
      setIsResolvingStream(true);
      fetch(`/api/resolve-stream?tmdbId=${tmdbId}${seriesQuery}${sourceParam}`)
        .then(r => r.json())
        .then(data => {
          if (data.success && data.streamUrl) {
            console.log(`[Auto-Stream Resolve] Successfully converted "${media?.title}" (S${season}:E${episode}) to direct native HLS:`, data.streamUrl);
            setResolvedHlsUrl(data.streamUrl);
            if (data.audioTracks && data.audioTracks.length > 0) {
              setAudioTracks(data.audioTracks);
            }
          } else {
            console.log(`[Auto-Stream Resolve] Direct HLS not available for "${media?.title}", falling back to embed`);
            setResolvedHlsUrl(null);
          }
        })
        .catch(err => {
          console.warn('[Auto-Stream Resolve Error]', err);
          setResolvedHlsUrl(null);
        })
        .finally(() => setIsResolvingStream(false));
    } else {
      setResolvedHlsUrl(null);
      setIsResolvingStream(false);
    }
  }, [media?.url, media?.id, media?.backupUrl, media?.tmdbId, media?.season, media?.episode]);

  const isHtmlPageUrl = Boolean(
    media?.url?.includes('player.silverlinehub.org') ||
    media?.url?.includes('1fmovies.live') ||
    media?.url?.includes('7reels.cc') ||
    media?.url?.includes('vidy.st') ||
    media?.url?.includes('netflix.com') ||
    media?.url?.includes('primevideo.com') ||
    media?.url?.includes('hotstar.com') ||
    media?.url?.includes('anyembed.xyz') ||
    media?.url?.includes('autoembed.co')
  );

  const handleSelectAudioTrack = (trackId) => {
    if (hlsRef.current) {
      hlsRef.current.audioTrack = trackId;
      setCurrentAudioTrack(trackId);
      setShowAudioMenu(false);
      const track = (audioTracks || []).find(t => t.id === trackId) || audioTracks?.[trackId];
      const langLabel = formatLanguageName(track);
      setAudioNotice(`Audio: ${langLabel}`);
      setTimeout(() => setAudioNotice(null), 3500);
      socket.emit('media_audio_track', {
        roomId: room.id,
        trackId,
        trackLang: track?.lang || null,
        trackName: langLabel
      });
    }
  };

  const handleSelectQuality = (qualityId) => {
    setSelectedQuality(qualityId);
    setShowQualityMenu(false);

    const is7Reels = media?.source === '7REELS' || media?.platform === '7reels' || media?.url?.includes('7reels') || media?.url?.includes('vidy.st') || portalUrl?.includes('vidy.st');
    const is1Fmovies = media?.source === '1Fmovies' || media?.platform === '1fmovies' || media?.url?.includes('1fmovies') || media?.url?.includes('anyembed') || media?.url?.includes('silverlinehub') || portalUrl?.includes('silverlinehub');

    if (is7Reels) {
      // Apply quality directly to 7REELS original stream without downscaling/upscaling
      if (media?.url?.includes('vidy.st') || portalUrl?.includes('vidy.st')) {
        try {
          const currentUrl = portalUrl || media?.url || custom1fmoviesUrl;
          const u = new URL(currentUrl);
          if (qualityId === 'auto') {
            u.searchParams.delete('quality');
          } else {
            u.searchParams.set('quality', qualityId);
          }
          setPortalUrl(u.toString());
        } catch (e) {}
      }
      if (iframeRef.current) {
        try {
          iframeRef.current.contentWindow?.postMessage({ type: 'SET_QUALITY', quality: qualityId }, '*');
        } catch (e) {}
      }
      setQualityNotice(`🎬 7REELS Original Quality: ${qualityId.toUpperCase()}`);
      setTimeout(() => setQualityNotice(null), 3500);
      return;
    }

    if (is1Fmovies) {
      // Apply quality directly to 1Fmovies original stream
      if (iframeRef.current) {
        try {
          iframeRef.current.contentWindow?.postMessage({ command: 'setQuality', quality: qualityId }, '*');
          iframeRef.current.contentWindow?.postMessage({ type: 'SET_QUALITY', quality: qualityId }, '*');
        } catch (e) {}
      }
      setQualityNotice(`🍿 1Fmovies Original Quality: ${qualityId.toUpperCase()}`);
      setTimeout(() => setQualityNotice(null), 3500);
      return;
    }

    // Direct HLS stream
    if (qualityId === 'auto') {
      if (hlsRef.current) hlsRef.current.currentLevel = -1;
      setCurrentQualityLevel(-1);
      setSelectedQuality('auto');
      setQualityNotice('✨ Auto Adaptive Stream Quality');
      setTimeout(() => setQualityNotice(null), 3000);
      return;
    }

    const option = availableQualityOptions.find(q => q.id === qualityId);
    if (option && hlsRef.current && option.levelIndex !== undefined && option.levelIndex >= 0) {
      hlsRef.current.currentLevel = option.levelIndex;
      setCurrentQualityLevel(option.levelIndex);
      setQualityNotice(`🎬 Original Quality: ${option.label}`);
    } else {
      setQualityNotice(`Original Quality: ${qualityId}`);
    }
    setTimeout(() => setQualityNotice(null), 3500);
  };

  // Synchronize fullscreen state with document changes (e.g. Esc key, F11, resize)
  useEffect(() => {
    const handleFsChange = () => {
      const isFs = Boolean(
        document.fullscreenElement || 
        document.webkitFullscreenElement || 
        document.mozFullScreenElement || 
        document.msFullscreenElement
      );
      setIsFullscreen(isFs);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  // Keyboard shortcut: 'f' or 'F' toggles fullscreen
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Synchronize portal URL when media changes
  useEffect(() => {
    if (media?.url) {
      setPortalUrl(media.url);
      setCustom1fmoviesUrl(media.url);
    }
  }, [media?.url]);

  // Peer & member resolution for Floating Fullscreen Cam
  const remotePeerEntries = Object.entries(remoteStreams);
  const firstRemoteEntry = remotePeerEntries[0];
  const firstRemoteStream = firstRemoteEntry?.[1]?.stream;
  const firstRemoteUser = firstRemoteEntry?.[1]?.user;

  const memberList = (members && members.length > 0)
    ? members
    : (room?.members && room.members.length > 0)
      ? room.members
      : (currentUser ? [currentUser] : []);

  const otherMembers = memberList.filter(m => m.socketId !== currentUser?.socketId);
  const partnerMember = otherMembers[0] || (firstRemoteUser ? { name: firstRemoteUser.name, isHost: firstRemoteUser.isHost } : null);

  // Hook fullscreen & floating video elements
  useEffect(() => {
    if ((isFullscreen || showFloatingCam) && localFsVideoRef.current && localStream) {
      localFsVideoRef.current.srcObject = localStream;
    }
  }, [isFullscreen, showFloatingCam, localStream, isVideoMuted]);

  useEffect(() => {
    if ((isFullscreen || showFloatingCam) && remoteFsVideoRef.current && firstRemoteStream) {
      remoteFsVideoRef.current.srcObject = firstRemoteStream;
    }
  }, [isFullscreen, showFloatingCam, firstRemoteStream]);

  // Check if any peer or local user is screen sharing
  const remoteScreenStream = Object.values(remoteStreams).find(
    s => s.stream?.getVideoTracks?.().some(t => t.label?.toLowerCase().includes('screen') || t.contentHint === 'detail')
  )?.stream;

  const activeScreenStream = isScreenSharing ? localStream : remoteScreenStream;

  // Format seconds to mm:ss or hh:mm:ss
  const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const triggerPermissionNotice = () => {
    setPermissionNotice('Only the Host can control playback in this room.');
    setTimeout(() => setPermissionNotice(null), 3000);
  };

  // Safe play helper to handle browser autoplay policies
  const safePlay = useCallback((targetTime = null) => {
    if (isNativeVideo && videoRef.current) {
      const v = videoRef.current;
      if (targetTime !== null && !isNaN(targetTime)) {
        if (Math.abs(v.currentTime - targetTime) > 0.5) {
          v.currentTime = targetTime;
        }
      }
      const playPromise = v.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            setAutoplayBlocked(false);
            setMediaError(null);
          })
          .catch((err) => {
            console.warn('[SyncedPlayer] Play prevented:', err);
            if (err.name === 'NotAllowedError') {
              v.muted = true;
              setIsMuted(true);
              setAutoplayBlocked(true);
              v.play()
                .then(() => setIsPlaying(true))
                .catch((e) => console.error('[SyncedPlayer] Muted play also failed:', e));
            }
          });
      }
    } else if (media?.type === 'youtube' && ytPlayerRef.current) {
      try {
        if (targetTime !== null && !isNaN(targetTime)) {
          ytPlayerRef.current.seekTo(targetTime, true);
        }
        ytPlayerRef.current.playVideo();
        setIsPlaying(true);
      } catch (err) {
        console.warn('[SyncedPlayer] YT play error:', err);
      }
    } else if (isPortalType && iframeRef.current) {
      iframeRef.current.contentWindow?.postMessage({
        type: 'CINESYNC_EXEC_PLAY',
        currentTime: targetTime
      }, '*');
      setIsPlaying(true);
    } else {
      setIsPlaying(true);
    }
  }, [media?.type, isNativeVideo, isPortalType]);

  const safePause = useCallback((targetTime = null) => {
    if (isNativeVideo && videoRef.current) {
      const v = videoRef.current;
      if (targetTime !== null && !isNaN(targetTime)) {
        if (Math.abs(v.currentTime - targetTime) > 0.5) {
          v.currentTime = targetTime;
        }
      }
      v.pause();
      setIsPlaying(false);
    } else if (media?.type === 'youtube' && ytPlayerRef.current) {
      try {
        if (targetTime !== null && !isNaN(targetTime)) {
          ytPlayerRef.current.seekTo(targetTime, true);
        }
        ytPlayerRef.current.pauseVideo();
        setIsPlaying(false);
      } catch (err) {
        console.warn('[SyncedPlayer] YT pause error:', err);
      }
    } else if (isPortalType && iframeRef.current) {
      iframeRef.current.contentWindow?.postMessage({
        type: 'CINESYNC_EXEC_PAUSE',
        currentTime: targetTime
      }, '*');
      setIsPlaying(false);
    } else {
      setIsPlaying(false);
    }
  }, [media?.type, isNativeVideo, isPortalType]);

  // Handle active screen stream video element
  useEffect(() => {
    if (screenVideoRef.current && activeScreenStream) {
      screenVideoRef.current.srcObject = activeScreenStream;
    }
  }, [activeScreenStream]);

  // Synchronized countdown timer for platform co-watching
  const handleStartCountdown = () => {
    if (!canControl) {
      triggerPermissionNotice();
      return;
    }
    socket.emit('send_reaction', { roomId: room.id, emoji: '⏱️ 3... 2... 1... PLAY!' });
    let count = 3;
    setCountdown(count);
    const interval = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
      } else if (count === 0) {
        setCountdown('PLAY!');
        safePlay();
        socket.emit('media_play', { roomId: room.id, currentTime: 0 });
      } else {
        setCountdown(null);
        clearInterval(interval);
      }
    }, 1000);
  };

  // ==============================================================
  // AUTO-SYNC BRIDGE: LISTEN TO MESSAGES FROM 1FMOVIES INJECTED SCRIPT
  // ==============================================================
  useEffect(() => {
    const handleIframeMessage = (event) => {
      const data = event.data;
      if (!data || !data.type) return;

      // 1. Navigation change inside 1Fmovies (user clicked a movie or series)
      if (data.type === 'CINESYNC_AUTO_NAV') {
        console.log('[Auto-Sync] Received internal navigation in 1Fmovies:', data.url);
        if (canControl && data.url && data.url !== media?.url && !data.url.includes('/api/stream-proxy') && !data.url.includes('localhost:')) {
          socket.emit('media_change', {
            roomId: room.id,
            media: {
              ...media,
              id: `1fmovies-${Date.now()}`,
              title: "1Fmovies — Auto Mirrored Live",
              url: data.url,
              type: "1fmovies",
              platform: "1fmovies",
              thumbnail: "https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?auto=format&fit=crop&w=800&q=80",
              color: "#10b981"
            }
          });
        }
      }
      // 2. Play event inside 1Fmovies
      else if (data.type === 'CINESYNC_AUTO_PLAY') {
        console.log('[Auto-Sync] Received video play event from 1Fmovies at', data.currentTime);
        if (canControl) {
          setIsPlaying(true);
          socket.emit('media_play', { roomId: room.id, currentTime: data.currentTime || 0 });
        }
      }
      // 3. Pause event inside 1Fmovies
      else if (data.type === 'CINESYNC_AUTO_PAUSE') {
        console.log('[Auto-Sync] Received video pause event from 1Fmovies at', data.currentTime);
        if (canControl) {
          setIsPlaying(false);
          socket.emit('media_pause', { roomId: room.id, currentTime: data.currentTime || 0 });
        }
      }
      // 4. Seek event inside 1Fmovies
      else if (data.type === 'CINESYNC_AUTO_SEEK') {
        console.log('[Auto-Sync] Received video seek event from 1Fmovies to', data.currentTime);
        if (canControl) {
          socket.emit('media_seek', { roomId: room.id, currentTime: data.currentTime || 0 });
        }
      }
      // 5. Scroll event inside 1Fmovies / portal
      else if (data.type === 'CINESYNC_AUTO_SCROLL') {
        if (canControl) {
          socket.emit('media_scroll', {
            roomId: room.id,
            scrollX: data.scrollX,
            scrollY: data.scrollY
          });
        }
      }
    };

    window.addEventListener('message', handleIframeMessage);
    return () => window.removeEventListener('message', handleIframeMessage);
  }, [canControl, media, room?.id]);

  // YouTube IFrame API Initialization
  useEffect(() => {
    if (media?.type !== 'youtube') return;

    let destroyed = false;

    const loadYT = () => {
      if (window.YT && window.YT.Player) {
        initYTPlayer();
      } else {
        if (!document.getElementById('yt-iframe-script')) {
          const tag = document.createElement('script');
          tag.id = 'yt-iframe-script';
          tag.src = 'https://www.youtube.com/iframe_api';
          const firstScriptTag = document.getElementsByTagName('script')[0];
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        }
        window.onYouTubeIframeAPIReady = initYTPlayer;
      }
    };

    const initYTPlayer = () => {
      if (destroyed) return;
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch (e) {}
      }

      ytPlayerRef.current = new window.YT.Player('youtube-player-container', {
        videoId: media.url,
        playerVars: {
          autoplay: media.isPlaying ? 1 : 0,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          enablejsapi: 1,
          origin: window.location.origin
        },
        events: {
          onReady: (event) => {
            setDuration(event.target.getDuration() || 0);
            if (media.currentTime > 0) {
              event.target.seekTo(media.currentTime, true);
            }
            if (media.isPlaying) {
              event.target.playVideo();
              setIsPlaying(true);
            }
          },
          onStateChange: (event) => {
            if (isRemoteAction.current) return;
            if (event.data === window.YT.PlayerState.PLAYING) {
              if (!canControl) {
                isRemoteAction.current = true;
                ytPlayerRef.current?.pauseVideo();
                triggerPermissionNotice();
                setTimeout(() => { isRemoteAction.current = false; }, 300);
                return;
              }
              setIsPlaying(true);
              const curr = ytPlayerRef.current.getCurrentTime();
              socket.emit('media_play', { roomId: room.id, currentTime: curr });
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              if (!canControl) {
                isRemoteAction.current = true;
                ytPlayerRef.current?.playVideo();
                triggerPermissionNotice();
                setTimeout(() => { isRemoteAction.current = false; }, 300);
                return;
              }
              setIsPlaying(false);
              const curr = ytPlayerRef.current.getCurrentTime();
              socket.emit('media_pause', { roomId: room.id, currentTime: curr });
            }
          }
        }
      });
    };

    loadYT();

    return () => {
      destroyed = true;
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch (e) {}
      }
    };
  }, [media?.type, media?.url, room.id, canControl]);

  // Periodic Host/Controller heartbeat to broadcast live sync pulse to participants
  useEffect(() => {
    if (!canControl || !room?.id) return;

    const interval = setInterval(() => {
      let curr = 0;
      let playing = isPlaying;

      if (isNativeVideo && videoRef.current) {
        curr = videoRef.current.currentTime || 0;
        playing = !videoRef.current.paused;
      } else if (media?.type === 'youtube' && ytPlayerRef.current && ytPlayerRef.current.getCurrentTime) {
        try {
          curr = ytPlayerRef.current.getCurrentTime() || 0;
          playing = ytPlayerRef.current.getPlayerState?.() === 1;
        } catch (e) {}
      }

      socket.emit('host_heartbeat', {
        roomId: room.id,
        currentTime: curr,
        isPlaying: playing,
        mediaId: media?.id
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [canControl, isPlaying, isNativeVideo, media?.type, media?.id, room?.id]);

  // Automatic Instant Sync for participants when mounting or when media changes
  useEffect(() => {
    if (!canControl && room?.id) {
      const timer = setTimeout(() => {
        socket.emit('request_sync', { roomId: room.id });
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [canControl, room?.id, media?.id]);

  // HLS stream loader using hls.js for fetched movies (TMDB / Silverlinehub)
  useEffect(() => {
    const video = videoRef.current;
    const targetUrl = resolvedHlsUrl || (media?.url?.includes('.m3u8') ? media.url : null);
    if (!video) return;

    if (!targetUrl) {
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
          hlsRef.current = null;
        } catch (e) {}
      }
      return;
    }

    let hlsInstance = null;

    if (Hls.isSupported()) {
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
          hlsRef.current = null;
        } catch (e) {}
      }

      hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 60 * 1000 * 1000,
        capLevelToPlayerSize: false,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 5
      });

      hlsRef.current = hlsInstance;
      hlsInstance.loadSource(targetUrl);
      hlsInstance.attachMedia(video);

      hlsInstance.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        setIsLoadingMedia(false);
        if (hlsInstance.audioTracks && hlsInstance.audioTracks.length > 0) {
          setAudioTracks(hlsInstance.audioTracks);
          setCurrentAudioTrack(hlsInstance.audioTrack >= 0 ? hlsInstance.audioTrack : 0);
        }
        if (hlsInstance.levels && hlsInstance.levels.length > 0) {
          setQualityLevels(hlsInstance.levels);

          // Find the level with the highest height / resolution and highest bitrate
          let highestLevelIdx = 0;
          let maxHeight = 0;
          let maxBitrate = 0;

          hlsInstance.levels.forEach((lvl, idx) => {
            const h = lvl.height || 0;
            const b = lvl.bitrate || 0;
            if (h > maxHeight || (h === maxHeight && b > maxBitrate)) {
              maxHeight = h;
              maxBitrate = b;
              highestLevelIdx = idx;
            }
          });

          // Instruct HLS to fetch highest quality segments without breaking playback pipeline
          hlsInstance.startLevel = highestLevelIdx;
          setCurrentQualityLevel(highestLevelIdx);
          const topQualityLabel = maxHeight ? `${maxHeight}p` : 'Highest';
          setSelectedQuality(topQualityLabel);
          console.log(`[HLS] Automatically starting at HIGHEST quality: ${topQualityLabel} (${(maxBitrate / 1000000).toFixed(1)} Mbps, level ${highestLevelIdx})`);
        }
        if (media?.currentTime > 0) {
          video.currentTime = media.currentTime;
        }
        if (media?.isPlaying) {
          safePlay();
        }
      });

      hlsInstance.on(Hls.Events.AUDIO_TRACKS_UPDATED, (event, data) => {
        if (data.audioTracks && data.audioTracks.length > 0) {
          setAudioTracks(data.audioTracks);
          if (hlsInstance.audioTrack >= 0) {
            setCurrentAudioTrack(hlsInstance.audioTrack);
          }
        }
      });

      hlsInstance.on(Hls.Events.AUDIO_TRACK_SWITCHED, (event, data) => {
        setCurrentAudioTrack(data.id);
      });

      hlsInstance.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        setCurrentQualityLevel(data.level);
      });

      hlsInstance.on(Hls.Events.LEVEL_LOADED, (event, data) => {
        if (hlsInstance.levels && hlsInstance.levels.length > 0) {
          setQualityLevels(hlsInstance.levels);
        }
      });

      hlsInstance.on(Hls.Events.ERROR, (event, data) => {
        // Auto-nudge past minor buffer gaps and stalls to prevent infinite buffering
        if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR || data.details === Hls.ErrorDetails.BUFFER_SEEK_OVER_HOLE) {
          console.warn('[HLS] Buffer stall detected, auto-nudging video head...', data.details);
          if (video && !video.paused) {
            video.currentTime += 0.1;
          }
        }
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('[HLS Fatal] Network error, recovering...');
              hlsInstance.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('[HLS Fatal] Media error, attempting recovery...');
              hlsInstance.recoverMediaError();
              break;
            default:
              console.error('[HLS Fatal Error]', data);
              hlsInstance.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = targetUrl;
    }

    return () => {
      if (hlsInstance) {
        try {
          hlsInstance.destroy();
          hlsRef.current = null;
        } catch (e) {}
      }
      if (video) {
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch (e) {}
      }
    };
  }, [resolvedHlsUrl, media?.url, media?.id]);

  // HTML5 Video Event Listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isNativeVideo) return;

    setMediaError(null);

    const onTimeUpdate = () => {
      setIsLoadingMedia(false);
      setCurrentTime(video.currentTime || 0);
      if (video.duration && !isNaN(video.duration) && isFinite(video.duration) && video.duration > 0) {
        setDuration(video.duration);
      }

      // Periodically update host heartbeat so server and room participants stay aligned to Host's exact video position
      if (canControl && !video.paused) {
        const now = Date.now();
        if (now - lastHeartbeatRef.current >= 1000) {
          lastHeartbeatRef.current = now;
          socket.emit('host_heartbeat', {
            roomId: room.id,
            currentTime: video.currentTime || 0,
            isPlaying: true
          });
        }
      }
    };

    const onDurationChange = () => {
      if (video.duration && !isNaN(video.duration) && isFinite(video.duration) && video.duration > 0) {
        setDuration(video.duration);
      }
    };

    const onLoadedMetadata = () => {
      if (video.duration && !isNaN(video.duration) && isFinite(video.duration) && video.duration > 0) {
        setDuration(video.duration);
      }
      setIsLoadingMedia(false);
      if (media.currentTime > 0) {
        video.currentTime = media.currentTime;
      }
      if (media.isPlaying) {
        safePlay();
      }
      if (!canControl && room?.id) {
        socket.emit('request_sync', { roomId: room.id });
      }
    };

    const onWaiting = () => {
      if (!video.paused) {
        setIsLoadingMedia(true);
      }
    };
    const onPlaying = () => setIsLoadingMedia(false);
    const onCanPlay = () => setIsLoadingMedia(false);
    const onCanPlayThrough = () => setIsLoadingMedia(false);
    const onLoadedData = () => setIsLoadingMedia(false);

    const onError = (e) => {
      console.error('[Video Error]', video.error, e);
      setIsLoadingMedia(false);
      setMediaError(`Stream load error: ${video.error?.message || 'Unsupported format or network block'}`);
    };

    const onPlay = () => {
      setIsLoadingMedia(false);
      setIsPlaying(true);
      if (isRemoteAction.current) return;
      if (!canControl) {
        isRemoteAction.current = true;
        video.pause();
        triggerPermissionNotice();
        setTimeout(() => { isRemoteAction.current = false; }, 300);
        return;
      }
      socket.emit('media_play', { roomId: room.id, currentTime: video.currentTime || 0 });
      socket.emit('host_heartbeat', { roomId: room.id, currentTime: video.currentTime || 0, isPlaying: true });
    };

    const onPause = () => {
      setIsLoadingMedia(false);
      setIsPlaying(false);
      if (isRemoteAction.current) return;
      if (!canControl) {
        isRemoteAction.current = true;
        safePlay();
        triggerPermissionNotice();
        setTimeout(() => { isRemoteAction.current = false; }, 300);
        return;
      }
      socket.emit('media_pause', { roomId: room.id, currentTime: video.currentTime || 0 });
      socket.emit('host_heartbeat', { roomId: room.id, currentTime: video.currentTime || 0, isPlaying: false });
    };

    const onSeeked = () => {
      setIsLoadingMedia(false);
      if (isRemoteAction.current) return;
      if (!canControl) return;
      socket.emit('media_seek', { roomId: room.id, currentTime: video.currentTime || 0 });
      socket.emit('host_heartbeat', { roomId: room.id, currentTime: video.currentTime || 0, isPlaying: !video.paused });
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('canplaythrough', onCanPlayThrough);
    video.addEventListener('error', onError);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', onSeeked);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('canplaythrough', onCanPlayThrough);
      video.removeEventListener('error', onError);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', onSeeked);
    };
  }, [isNativeVideo, resolvedHlsUrl, media?.type, media?.url, canControl, room.id, safePlay]);

  // ==============================================================
  // AUTOMATIC BACKGROUND CONTINUOUS SYNCHRONIZATION
  // ==============================================================
  useEffect(() => {
    // 1. Remote Play event
    const handleRemotePlay = ({ currentTime: targetTime }) => {
      isRemoteAction.current = true;
      safePlay(targetTime);
      setTimeout(() => { isRemoteAction.current = false; }, 400);
    };

    // 2. Remote Pause event
    const handleRemotePause = ({ currentTime: targetTime }) => {
      isRemoteAction.current = true;
      safePause(targetTime);
      setTimeout(() => { isRemoteAction.current = false; }, 400);
    };

    // 3. Remote Seek event
    const handleRemoteSeek = ({ currentTime: targetTime, isPlaying: shouldPlay }) => {
      isRemoteAction.current = true;
      setCurrentTime(targetTime);

      if (isNativeVideo && videoRef.current) {
        videoRef.current.currentTime = targetTime;
        if (shouldPlay) safePlay();
      } else if (media?.type === 'youtube' && ytPlayerRef.current) {
        try {
          ytPlayerRef.current.seekTo(targetTime, true);
          if (shouldPlay) ytPlayerRef.current.playVideo();
        } catch (e) {}
      } else if (isPortalType && iframeRef.current) {
        iframeRef.current.contentWindow?.postMessage({
          type: 'CINESYNC_EXEC_SEEK',
          currentTime: targetTime
        }, '*');
      }

      setTimeout(() => { isRemoteAction.current = false; }, 400);
    };

    // 4. Exact Sync State response
    const handleSyncState = ({ currentTime: targetTime, isPlaying: remoteIsPlaying }) => {
      isRemoteAction.current = true;
      setSyncStatus('synced');
      setCurrentTime(targetTime);

      if (isNativeVideo && videoRef.current) {
        const v = videoRef.current;
        if (targetTime !== null && !isNaN(targetTime)) {
          v.currentTime = targetTime;
        }
        if (remoteIsPlaying) {
          safePlay(targetTime);
        } else {
          safePause(targetTime);
        }
      } else if (media?.type === 'youtube' && ytPlayerRef.current) {
        try {
          ytPlayerRef.current.seekTo(targetTime, true);
          if (remoteIsPlaying) ytPlayerRef.current.playVideo();
          else ytPlayerRef.current.pauseVideo();
        } catch (e) {}
      } else if (isPortalType && iframeRef.current) {
        iframeRef.current.contentWindow?.postMessage({
          type: remoteIsPlaying ? 'CINESYNC_EXEC_PLAY' : 'CINESYNC_EXEC_PAUSE',
          currentTime: targetTime
        }, '*');
      }

      setTimeout(() => { isRemoteAction.current = false; }, 500);
    };

    // 5. Automatic Continuous Heartbeat Pulse (Keeps participants automatically aligned without any button clicks)
    const handleAutoSyncPulse = ({ currentTime: pulseTime, isPlaying: pulseIsPlaying, mediaId }) => {
      if (canControl) return; // Controller is the reference clock
      if (mediaId && media?.id && mediaId !== media?.id && mediaId !== media?.url && (!media?.title || !mediaId.includes(media.title))) {
        if (media?.url && !mediaId.includes(media.url) && !media.url.includes(mediaId)) {
          return;
        }
      }

      if (isNativeVideo && videoRef.current) {
        const v = videoRef.current;
        const drift = Math.abs(v.currentTime - pulseTime);
        if (drift > 0.8) {
          console.log(`[Auto-Sync] Smoothly reconciling drift (${drift.toFixed(2)}s) to ${pulseTime.toFixed(2)}s`);
          v.currentTime = pulseTime;
        }
        if (pulseIsPlaying && v.paused) {
          safePlay(pulseTime);
        } else if (!pulseIsPlaying && !v.paused) {
          v.pause();
          setIsPlaying(false);
        }
      } else if (media?.type === 'youtube' && ytPlayerRef.current) {
        try {
          const currYT = ytPlayerRef.current.getCurrentTime() || 0;
          if (Math.abs(currYT - pulseTime) > 1.0) {
            ytPlayerRef.current.seekTo(pulseTime, true);
          }
          const ytState = ytPlayerRef.current.getPlayerState?.();
          if (pulseIsPlaying && ytState !== 1 && ytState !== 3) {
            ytPlayerRef.current.playVideo();
          } else if (!pulseIsPlaying && ytState === 1) {
            ytPlayerRef.current.pauseVideo();
          }
        } catch (e) {}
      } else if (isPortalType && iframeRef.current) {
        iframeRef.current.contentWindow?.postMessage({
          type: pulseIsPlaying ? 'CINESYNC_EXEC_PLAY' : 'CINESYNC_EXEC_PAUSE',
          currentTime: pulseTime
        }, '*');
      }
    };

    // 6. Remote scroll sync (Host scrolls, participants mirror scroll)
    const handleRemoteScroll = ({ scrollX, scrollY }) => {
      if (!canControl && iframeRef.current) {
        iframeRef.current.contentWindow?.postMessage({
          type: 'CINESYNC_EXEC_SCROLL',
          scrollX,
          scrollY
        }, '*');
      }
    };

    const handleRemoteAudioTrack = ({ trackId, trackLang, trackName, changedBy }) => {
      console.log(`[Remote Audio] Audio changed to ${trackName || trackId} by ${changedBy}`);
      if (hlsRef.current && trackId !== undefined) {
        hlsRef.current.audioTrack = trackId;
        setCurrentAudioTrack(trackId);
        setAudioNotice(`Audio changed to ${trackName || 'Selected Language'}`);
        setTimeout(() => setAudioNotice(null), 3000);
      }
    };

    socket.on('media_play', handleRemotePlay);
    socket.on('media_pause', handleRemotePause);
    socket.on('media_seek', handleRemoteSeek);
    socket.on('sync_state', handleSyncState);
    socket.on('auto_sync_pulse', handleAutoSyncPulse);
    socket.on('media_scroll', handleRemoteScroll);
    socket.on('media_audio_track_changed', handleRemoteAudioTrack);

    return () => {
      socket.off('media_play', handleRemotePlay);
      socket.off('media_pause', handleRemotePause);
      socket.off('media_seek', handleRemoteSeek);
      socket.off('sync_state', handleSyncState);
      socket.off('auto_sync_pulse', handleAutoSyncPulse);
      socket.off('media_scroll', handleRemoteScroll);
      socket.off('media_audio_track_changed', handleRemoteAudioTrack);
    };
  }, [media?.type, safePlay, safePause, canControl, isPortalType, isNativeVideo]);

  // Watchdog: auto-clear stuck buffering state after 3 seconds
  useEffect(() => {
    if (!isLoadingMedia) return;
    const timer = setTimeout(() => {
      const v = videoRef.current;
      if (v) {
        if (!v.paused && v.currentTime > 0) {
          setIsLoadingMedia(false);
        } else if (!v.paused) {
          v.currentTime += 0.1;
          setIsLoadingMedia(false);
        } else {
          setIsLoadingMedia(false);
        }
      } else {
        setIsLoadingMedia(false);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [isLoadingMedia]);

  // Toggle Play / Pause User Action
  const handleTogglePlay = (e) => {
    if (e) e.stopPropagation();

    if (videoRef.current && (autoplayBlocked || isMuted)) {
      videoRef.current.muted = false;
      setIsMuted(false);
      setAutoplayBlocked(false);
    }

    if (!canControl) {
      // If room media is playing, or local video is paused, allow participant to unmute, start playback, and sync with host!
      if (room?.media?.isPlaying || (videoRef.current && videoRef.current.paused)) {
        if (videoRef.current) {
          videoRef.current.muted = false;
          setIsMuted(false);
          setAutoplayBlocked(false);
          safePlay(room?.media?.currentTime);
        }
        socket.emit('request_sync', { roomId: room.id });
        return;
      }
      triggerPermissionNotice();
      return;
    }

    if (isNativeVideo && videoRef.current) {
      const v = videoRef.current;
      if (v.paused || !isPlaying) {
        setIsPlaying(true);
        safePlay();
        socket.emit('media_play', { roomId: room.id, currentTime: v.currentTime || 0 });
      } else {
        setIsPlaying(false);
        safePause();
        socket.emit('media_pause', { roomId: room.id, currentTime: v.currentTime || 0 });
      }
    } else if (media?.type === 'youtube' && ytPlayerRef.current) {
      const state = ytPlayerRef.current.getPlayerState?.();
      if (state === 1 || isPlaying) {
        setIsPlaying(false);
        ytPlayerRef.current.pauseVideo();
        socket.emit('media_pause', { roomId: room.id, currentTime: ytPlayerRef.current.getCurrentTime() || 0 });
      } else {
        setIsPlaying(true);
        ytPlayerRef.current.playVideo();
        socket.emit('media_play', { roomId: room.id, currentTime: ytPlayerRef.current.getCurrentTime() || 0 });
      }
    } else {
      if (isPlaying) {
        setIsPlaying(false);
        safePause();
        socket.emit('media_pause', { roomId: room.id, currentTime });
      } else {
        setIsPlaying(true);
        safePlay();
        socket.emit('media_play', { roomId: room.id, currentTime });
      }
    }
  };

  // Mirror In-Website Portal URL to partner
  const handleMirrorPortalUrl = () => {
    if (!canControl) {
      triggerPermissionNotice();
      return;
    }
    const target = (portalUrl || custom1fmoviesUrl || media?.url || '').trim();
    if (!target) return;

    socket.emit('media_change', {
      roomId: room.id,
      media: {
        ...media,
        id: `${media?.platform || media?.type || 'stream'}-${Date.now()}`,
        title: media?.title || "In-Website Stream",
        url: target,
        type: media?.type || 'platform',
        platform: media?.platform || null
      }
    });
  };

  const handleMirror1FmoviesUrl = handleMirrorPortalUrl;

  // Request sync action
  const handleRequestSync = () => {
    setSyncStatus('syncing');
    socket.emit('request_sync', { roomId: room.id });
    if (onRequestSync) onRequestSync();
  };

  // Scrub timeline
  const handleScrub = (e) => {
    if (!canControl) {
      triggerPermissionNotice();
      return;
    }

    const seekTime = parseFloat(e.target.value);
    setCurrentTime(seekTime);

    if (isNativeVideo && videoRef.current) {
      videoRef.current.currentTime = seekTime;
      socket.emit('media_seek', { roomId: room.id, currentTime: seekTime });
    } else if (media?.type === 'youtube' && ytPlayerRef.current) {
      ytPlayerRef.current.seekTo(seekTime, true);
      socket.emit('media_seek', { roomId: room.id, currentTime: seekTime });
    } else if (isPortalType && iframeRef.current) {
      iframeRef.current.contentWindow?.postMessage({
        type: 'CINESYNC_EXEC_SEEK',
        currentTime: seekTime
      }, '*');
      socket.emit('media_seek', { roomId: room.id, currentTime: seekTime });
    }
  };

  // Volume
  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);

    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = (val === 0);
    }
    if (ytPlayerRef.current) {
      ytPlayerRef.current.setVolume(val * 100);
      if (val === 0) ytPlayerRef.current.mute();
      else ytPlayerRef.current.unMute();
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
    }
    if (ytPlayerRef.current) {
      if (nextMuted) ytPlayerRef.current.mute();
      else ytPlayerRef.current.unMute();
    }
  };

  // Fullscreen
  const toggleFullscreen = () => {
    if (!playerContainerRef.current) return;

    if (!document.fullscreenElement) {
      playerContainerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3200);
  };

  // Platform & Brand details for In-Website Portal
  const platform = (media?.platform || (media?.url?.includes('1fmovies') ? '1fmovies' : '') || media?.type || 'platform').toLowerCase();
  const isCredentialsPlatform = (platform === 'netflix' || platform === 'hotstar' || platform === 'prime' || media?.url?.includes('netflix.com') || media?.url?.includes('hotstar.com') || media?.url?.includes('primevideo.com'));
  
  const getBrandDetails = () => {
    if (platform === 'netflix' || media?.url?.includes('netflix.com')) {
      return {
        name: 'Netflix In-Website Window',
        shortTag: 'Netflix',
        colorBadge: 'bg-red-600/20 text-red-400 border border-red-500/40',
        pingDot: 'bg-red-400',
        btnColor: 'bg-red-600 hover:bg-red-500',
        focusBorder: 'focus:border-red-500',
        icon: 'N'
      };
    }
    if (platform === 'hotstar' || media?.url?.includes('hotstar.com')) {
      return {
        name: 'Disney+ Hotstar In-Website Window',
        shortTag: 'Hotstar',
        colorBadge: 'bg-blue-600/20 text-blue-400 border border-blue-500/40',
        pingDot: 'bg-blue-400',
        btnColor: 'bg-blue-600 hover:bg-blue-500',
        focusBorder: 'focus:border-blue-500',
        icon: '★'
      };
    }
    if (platform === 'prime' || media?.url?.includes('primevideo.com') || media?.url?.includes('amazon.')) {
      return {
        name: 'Amazon Prime Video In-Website Window',
        shortTag: 'Prime Video',
        colorBadge: 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/40',
        pingDot: 'bg-cyan-400',
        btnColor: 'bg-cyan-600 hover:bg-cyan-500',
        focusBorder: 'focus:border-cyan-500',
        icon: 'P'
      };
    }
    if (platform === '7reels' || media?.source === '7REELS' || media?.url?.includes('7reels.cc') || media?.url?.includes('vidy.st') || portalUrl?.includes('vidy.st')) {
      return {
        name: '7REELS Movies, Shows & Anime',
        shortTag: '7REELS',
        colorBadge: 'bg-rose-500/20 text-rose-400 border border-rose-500/40',
        pingDot: 'bg-rose-400',
        btnColor: 'bg-rose-600 hover:bg-rose-500',
        focusBorder: 'focus:border-rose-500',
        icon: '7R'
      };
    }
    if (platform === '1fmovies' || media?.source === '1Fmovies' || media?.url?.includes('1fmovies.live') || media?.url?.includes('silverlinehub.org') || portalUrl?.includes('silverlinehub.org')) {
      return {
        name: '1Fmovies Live',
        shortTag: '1Fmovies',
        colorBadge: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40',
        pingDot: 'bg-emerald-400',
        btnColor: 'bg-emerald-600 hover:bg-emerald-500',
        focusBorder: 'focus:border-emerald-500',
        icon: '1F'
      };
    }
    return {
      name: `${media?.title || 'Web Stream'} In-Website Window`,
      shortTag: 'Web Stream',
      colorBadge: 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/40',
      pingDot: 'bg-indigo-400',
      btnColor: 'bg-indigo-600 hover:bg-indigo-500',
      focusBorder: 'focus:border-indigo-500',
      icon: '🌐'
    };
  };

  const brand = getBrandDetails();

  // Target embed URL for In-Website Window
  const currentPortalTarget = portalUrl || media?.url || custom1fmoviesUrl || 'https://1fmovies.live/';
  const isDirectEmbed = Boolean(
    currentPortalTarget.includes('vidy.st') ||
    currentPortalTarget.includes('7reels.cc') ||
    currentPortalTarget.includes('silverlinehub.org') ||
    currentPortalTarget.includes('autoembed') ||
    currentPortalTarget.includes('anyembed') ||
    currentPortalTarget.includes('1fmovies') ||
    currentPortalTarget.includes('vidfast') ||
    media?.source === '7REELS' ||
    media?.source === '1Fmovies' ||
    media?.platform === '7reels' ||
    media?.platform === '1fmovies'
  );
  const embedPortalSrc = (!isDirectEmbed && useProxy) 
    ? `/api/stream-proxy?url=${encodeURIComponent(currentPortalTarget)}`
    : currentPortalTarget;
  const embed1fmoviesSrc = embedPortalSrc;

  return (
    <div 
      ref={playerContainerRef}
      onMouseMove={handleMouseMove}
      className="relative w-full h-full bg-black rounded-2xl overflow-hidden shadow-2xl flex flex-col justify-center items-center select-none group"
      style={{ minHeight: '460px' }}
    >
      {/* Floating Reactions Overlay */}
      <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
        {reactions.map((rx) => (
          <div 
            key={rx.id} 
            className="absolute bottom-16 text-4xl animate-float-reaction flex flex-col items-center"
            style={{ 
              left: `${rx.x || 30 + Math.random() * 40}%`,
              filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.6))'
            }}
          >
            <span>{rx.emoji}</span>
            <span className="text-xs font-semibold bg-black/60 text-white/90 px-1.5 py-0.5 rounded-full mt-1">
              {rx.senderName}
            </span>
          </div>
        ))}
      </div>

      {/* Fullscreen & Pinned Draggable Floating Video Chat */}
      {(isFullscreen || showFloatingCam) && (
        <div 
          ref={floatingCamRef}
          style={floatingCamPos.x !== null ? {
            left: `${floatingCamPos.x}px`,
            top: `${floatingCamPos.y}px`,
            right: 'auto',
            bottom: 'auto'
          } : undefined}
          className={`absolute z-[100] animate-in fade-in zoom-in-95 duration-150 pointer-events-auto transition-shadow ${
            floatingCamPos.x === null ? 'top-4 right-4' : ''
          } ${isDraggingCam ? 'opacity-90 shadow-[0_0_35px_rgba(99,102,241,0.45)] ring-2 ring-indigo-500/60 scale-[1.01]' : ''}`}
        >
          {!isFloatingCamMinimized ? (
            <div className="w-72 sm:w-80 bg-slate-950/95 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-2xl p-2.5 flex flex-col space-y-2 ring-1 ring-black/60">
              {/* Header (Draggable Handle) */}
              <div 
                onMouseDown={handleDragStart}
                onTouchStart={handleDragStart}
                className="flex items-center justify-between px-2 py-1.5 text-xs text-slate-300 cursor-grab active:cursor-grabbing select-none bg-white/5 hover:bg-white/10 rounded-xl transition-all group"
                title="Click and drag to move video chat anywhere on screen"
              >
                <div className="flex items-center space-x-1.5">
                  <GripHorizontal className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-400 transition-colors" />
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span className="font-bold text-white text-[11px]">Party Cam</span>
                  <span className="text-emerald-400 font-mono text-[10px] font-semibold">
                    ({Math.max((members || []).length, Object.keys(remoteStreams).length + 1, 1)} online)
                  </span>
                </div>
                <div className="flex items-center space-x-1">
                  {floatingCamPos.x !== null && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFloatingCamPos({ x: null, y: null });
                      }}
                      className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white border border-white/10 transition cursor-pointer"
                      title="Reset position to top-right corner"
                    >
                      Reset
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsFloatingCamMinimized(true);
                    }}
                    className="p-1 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
                    title="Minimize Floating Cam"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isFullscreen) toggleFullscreen();
                      else setShowFloatingCam(false);
                    }}
                    className="p-1 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
                    title={isFullscreen ? "Exit Fullscreen" : "Close Floating Cam"}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Video Area (Partner Video + Local User Mini PIP) */}
              <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-white/10 shadow-inner">
                {firstRemoteStream && firstRemoteStream.getVideoTracks().some(t => t.enabled) ? (
                  <video
                    ref={remoteFsVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : partnerMember ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-300 p-2">
                    <div className="w-10 h-10 rounded-full bg-indigo-600/30 border border-indigo-500/50 flex items-center justify-center text-sm font-bold text-indigo-300 shadow">
                      {partnerMember.name?.charAt(0)?.toUpperCase() || 'P'}
                    </div>
                    <span className="text-[11px] font-bold text-white mt-1 flex items-center space-x-1">
                      {partnerMember.isHost && <Crown className="w-2.5 h-2.5 text-amber-400" />}
                      <span>{partnerMember.name}</span>
                    </span>
                    <span className="text-[9px] text-emerald-400 font-medium">Connected • Camera Off</span>
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900/80 text-slate-500 text-xs">
                    <User className="w-6 h-6 mb-1 opacity-50" />
                    <span>Waiting for friend...</span>
                  </div>
                )}

                {/* Partner Name Tag in Top-Left of PIP */}
                {partnerMember && (
                  <div className="absolute top-1.5 left-1.5 bg-black/75 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-semibold text-white flex items-center space-x-1 pointer-events-none">
                    {partnerMember.isHost && <Crown className="w-2.5 h-2.5 text-amber-400" />}
                    <span>{partnerMember.name}</span>
                  </div>
                )}

                {/* Local User Mini PIP Tile in Bottom-Right Corner */}
                <div className="absolute bottom-1.5 right-1.5 w-20 h-14 bg-slate-950 rounded-lg overflow-hidden border border-indigo-500/50 shadow-lg">
                  {localStream && !isVideoMuted ? (
                    <video
                      ref={localFsVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover transform -scale-x-100"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400">
                      <span className="text-[10px] font-bold text-indigo-300">
                        {currentUser?.name?.charAt(0)?.toUpperCase() || 'Y'}
                      </span>
                      <span className="text-[8px] text-slate-500">You</span>
                    </div>
                  )}
                  <div className="absolute bottom-0.5 left-0.5 right-0.5 flex items-center justify-between px-1 pointer-events-none bg-black/60 rounded">
                    <span className="text-[8px] font-bold text-white/90">You</span>
                    <span className={`text-[8px] ${isAudioMuted ? 'text-red-400' : 'text-emerald-400'}`}>
                      {isAudioMuted ? <MicOff className="w-2 h-2 inline" /> : <Mic className="w-2 h-2 inline" />}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom Quick Controls in Fullscreen */}
              <div className="flex items-center justify-between pt-1 border-t border-white/10 px-1">
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={onToggleAudio}
                    className={`p-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      isAudioMuted ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                    }`}
                    title={isAudioMuted ? "Unmute Mic" : "Mute Mic"}
                  >
                    {isAudioMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-emerald-400" />}
                  </button>

                  <button
                    onClick={onToggleVideo}
                    className={`p-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      isVideoMuted ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                    }`}
                    title={isVideoMuted ? "Turn Video On" : "Turn Video Off"}
                  >
                    {isVideoMuted ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5 text-indigo-400" />}
                  </button>
                </div>

                <button
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer text-xs flex items-center space-x-1"
                  title="Exit Fullscreen"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span className="text-[10px]">Exit</span>
                </button>
              </div>
            </div>
          ) : (
            /* Minimized Floating Cam Pill (Draggable) */
            <div
              onMouseDown={handleDragStart}
              onTouchStart={handleDragStart}
              className="flex items-center space-x-2 bg-slate-950/90 backdrop-blur-xl border border-white/20 px-3 py-1.5 rounded-full shadow-2xl cursor-grab active:cursor-grabbing hover:bg-slate-900 transition group select-none"
              title="Click and drag to move, click to expand"
            >
              <GripHorizontal className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-400" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFloatingCamMinimized(false);
                }}
                className="flex items-center space-x-2 cursor-pointer"
                title="Expand Watch Party Cam"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-bold text-white">Party Cam</span>
                <div className="flex -space-x-1">
                  <div className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center border border-slate-900">
                    {currentUser?.name?.charAt(0)?.toUpperCase() || 'Y'}
                  </div>
                  {partnerMember && (
                    <div className="w-5 h-5 rounded-full bg-violet-600 text-white text-[9px] font-bold flex items-center justify-center border border-slate-900">
                      {partnerMember.name?.charAt(0)?.toUpperCase() || 'P'}
                    </div>
                  )}
                </div>
                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Synchronized 3-2-1 Countdown Overlay */}
      {countdown !== null && (
        <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in zoom-in duration-200">
          <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-indigo-600 to-pink-600 flex items-center justify-center shadow-2xl animate-bounce">
            <span className="text-5xl font-black text-white">{countdown}</span>
          </div>
          <p className="text-sm font-bold text-slate-200 mt-4 tracking-wider uppercase">
            Synchronized Start Countdown
          </p>
        </div>
      )}

      {/* Autoplay unmuted banner */}
      {autoplayBlocked && (
        <div 
          onClick={handleTogglePlay}
          className="absolute top-16 z-40 bg-indigo-600/90 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-2 shadow-lg cursor-pointer backdrop-blur animate-pulse"
        >
          <VolumeX className="w-4 h-4" />
          <span>Click anywhere to unmute audio</span>
        </div>
      )}

      {/* Permission Restriction Toast Alert */}
      {permissionNotice && (
        <div className="absolute top-6 z-40 bg-amber-500/90 text-black px-4 py-2 rounded-xl text-sm font-semibold flex items-center space-x-2 shadow-lg backdrop-blur animate-bounce">
          <ShieldAlert className="w-4 h-4" />
          <span>{permissionNotice}</span>
        </div>
      )}

      {/* Quality Change Toast Alert (Displays 4K UHD status) */}
      {qualityNotice && (
        <div className="absolute top-16 z-40 bg-slate-900/95 border border-amber-500/50 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-2 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top duration-300">
          <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
          <span>{qualityNotice}</span>
        </div>
      )}

      {/* Audio Language Change Toast Alert */}
      {audioNotice && (
        <div className="absolute top-16 z-40 bg-slate-900/95 border border-indigo-500/50 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-2 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top duration-300">
          <Languages className="w-4 h-4 text-indigo-400" />
          <span>{audioNotice}</span>
        </div>
      )}

      {/* Buffering Spinner with Instant Resume Helper */}
      {isLoadingMedia && (
        <div className="absolute z-20 flex flex-col items-center justify-center space-y-2.5 pointer-events-auto">
          <div className="relative flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-300 font-semibold bg-black/75 px-3 py-1 rounded-full border border-white/10 shadow-lg">
              Buffering stream...
            </span>
            <button
              onClick={() => {
                setIsLoadingMedia(false);
                if (videoRef.current) {
                  videoRef.current.currentTime += 0.05;
                  safePlay();
                }
              }}
              className="text-[11px] font-bold text-indigo-300 bg-indigo-600/70 hover:bg-indigo-600 px-2.5 py-1 rounded-full border border-indigo-400/30 transition cursor-pointer active:scale-95 shadow"
              title="Force resume stream playback"
            >
              Resume
            </button>
          </div>
        </div>
      )}

      {/* Media Error State */}
      {mediaError && (
        <div className="absolute z-25 inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center space-y-3">
          <AlertTriangle className="w-12 h-12 text-amber-400" />
          <h4 className="text-base font-bold text-white">Stream Playback Error</h4>
          <p className="text-xs text-slate-400 max-w-md">{mediaError}</p>
          <div className="flex items-center space-x-3 pt-2">
            <button
              onClick={() => {
                setMediaError(null);
                if (videoRef.current) {
                  videoRef.current.load();
                  safePlay();
                }
              }}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer transition"
            >
              Retry Stream
            </button>
            <span className="text-xs text-slate-500">or pick another movie in Search tab</span>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MEDIA TYPE 1: INCOMING/LOCAL LIVE SCREEN STREAM */}
      {/* ============================================================== */}
      {activeScreenStream ? (
        <div className="w-full h-full relative flex items-center justify-center bg-black">
          <video
            ref={screenVideoRef}
            autoPlay
            playsInline
            className="w-full h-full max-h-[78vh] object-contain"
          />
          <div className="absolute top-4 left-4 z-20 flex items-center space-x-2 bg-red-600/90 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg animate-pulse">
            <Radio className="w-3.5 h-3.5" />
            <span>Live Tab Stream ({isScreenSharing ? 'You are Broadcasting' : 'Partner is Broadcasting'})</span>
          </div>
        </div>
      ) : isNativeVideo ? (
        /* ============================================================== */
        /* MEDIA TYPE 2: NATIVE HTML5 & HLS SYNCHRONIZED STREAM           */
        /* ============================================================== */
        <div className="w-full h-full flex items-center justify-center relative bg-black overflow-hidden">
          <video
            ref={videoRef}
            key={media?.id || 'native-player'}
            src={!isHtmlPageUrl && media?.type !== 'hls' && !media?.url?.includes('.m3u8') && !resolvedHlsUrl ? media.url : undefined}
            className="w-full h-full max-h-[78vh] object-contain cursor-pointer transition-all duration-300"
            style={{
              imageRendering: 'auto',
              filter: 'none'
            }}
            onClick={handleTogglePlay}
            onDoubleClick={toggleFullscreen}
            playsInline
            preload="auto"
          />

          {(!resolvedHlsUrl && hasTmdbStream && !media?.url?.includes('.m3u8')) && (
            <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-8 text-center text-white space-y-4 z-10">
              <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <div className="font-bold text-base text-indigo-300">Synchronizing Cinema Stream...</div>
              <p className="text-xs text-slate-400 max-w-sm">Connecting lockstep video stream across all room members.</p>
            </div>
          )}
        </div>
      ) : media?.type === 'youtube' ? (
        /* ============================================================== */
        /* MEDIA TYPE 3: YOUTUBE SYNCHRONIZED PLAYER                      */
        /* ============================================================== */
        <div className="w-full h-full flex items-center justify-center relative">
          <div id="youtube-player-container" className="w-full h-full aspect-video max-h-[78vh]" />
          <div 
            onClick={handleTogglePlay}
            className="absolute inset-0 z-10 cursor-pointer"
          />
        </div>
      ) : isPortalType ? (
        /* ============================================================== */
        /* MEDIA TYPE 4: IN-WEBSITE STREAMING WINDOW                      */
        /* (Netflix, Disney+ Hotstar, Amazon Prime Video, 1Fmovies)        */
        /* ============================================================== */
        <div className="w-full h-full flex flex-col bg-slate-950 relative">
          {/* Dedicated Non-Overlapping Header with Platform Branding */}
          <div className="p-2.5 sm:p-3 bg-slate-900 border-b border-white/10 flex items-center justify-between text-xs z-20 gap-2 flex-wrap">
            <div className="flex items-center space-x-2 flex-1 max-w-xl min-w-0">
              <span className={`px-2.5 py-1 rounded-md font-bold text-xs flex items-center space-x-1.5 flex-shrink-0 ${brand.colorBadge}`}>
                <span className={`w-2 h-2 rounded-full ${brand.pingDot} animate-ping`} />
                <span>{brand.shortTag}</span>
              </span>

              <div className="relative flex-1 min-w-0">
                <input
                  type="text"
                  value={portalUrl || custom1fmoviesUrl || media.url}
                  onChange={(e) => {
                    setPortalUrl(e.target.value);
                    setCustom1fmoviesUrl(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleMirrorPortalUrl();
                  }}
                  disabled={!canControl}
                  placeholder="Paste or enter show / movie URL..."
                  className={`w-full bg-slate-950 border border-white/10 rounded-lg pl-3 pr-20 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none ${brand.focusBorder} ${!canControl ? 'opacity-80' : ''}`}
                />
                {canControl && (
                  <button
                    onClick={handleMirrorPortalUrl}
                    className={`absolute right-1 top-1 bottom-1 px-2.5 rounded ${brand.btnColor} text-white font-bold text-[10px] cursor-pointer transition active:scale-95 shadow flex items-center space-x-1`}
                    title="Force Mirror this URL to partner"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Mirror</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quick Actions & Sync Indicators */}
            <div className="flex items-center space-x-2 flex-shrink-0">
              {/* Play / Pause Room Toggle Button */}
              {canControl && (
                <button
                  onClick={handleTogglePlay}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center space-x-1.5 transition cursor-pointer border ${
                    isPlaying ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  }`}
                  title={isPlaying ? "Pause for Everyone in Room" : "Play for Everyone in Room"}
                >
                  {isPlaying ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                  <span>{isPlaying ? 'Pause Room' : 'Play Room'}</span>
                </button>
              )}

              {/* Instant Resync Button */}
              <button
                onClick={handleRequestSync}
                className="px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center space-x-1.5 transition cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10"
                title="Resync video with Host"
              >
                <RefreshCw className="w-3 h-3 text-emerald-400" />
                <span>Resync</span>
              </button>

              {/* Quality Selector with Source Original Quality */}
              <div className="relative">
                <button
                  onClick={() => setShowQualityMenu(prev => !prev)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center space-x-1.5 transition cursor-pointer border ${
                    selectedQuality === '2160p'
                      ? 'bg-amber-500/25 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-500/20'
                      : selectedQuality === '1080p'
                        ? 'bg-indigo-500/25 text-indigo-300 border-indigo-500/40 shadow-sm'
                        : 'bg-slate-800 text-slate-200 border-white/10 hover:bg-slate-700'
                  }`}
                  title="Source Original Quality"
                >
                  <span>Quality: {selectedQuality || 'Highest'}</span>
                  <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
                </button>

                {showQualityMenu && (
                  <div className="absolute top-full mt-2 right-0 bg-slate-900/95 backdrop-blur-2xl border border-white/15 rounded-2xl p-2 shadow-2xl z-50 min-w-[220px] space-y-1 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-2 py-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center justify-between border-b border-white/10 pb-1.5 mb-1">
                      <span>{media?.source || 'Original'} Quality</span>
                      <span className="text-[9px] font-bold text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-500/30">
                        Highest Available (Up to 4K)
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      {availableQualityOptions.map((opt) => {
                        const isCurrent = selectedQuality === opt.id;
                        return (
                          <button
                            key={opt.id}
                            onClick={() => handleSelectQuality(opt.id)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                              isCurrent 
                                ? 'bg-indigo-600 text-white shadow-md' 
                                : 'text-slate-200 hover:bg-white/10'
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${opt.badgeClass}`}>
                                {opt.badge}
                              </span>
                              <span>{opt.label}</span>
                            </div>
                            {isCurrent && <Check className="w-3.5 h-3.5 text-white flex-shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-1 px-2 py-1 rounded-md bg-indigo-500/20 text-indigo-300 font-semibold text-[11px] border border-indigo-500/30">
                <Zap className="w-3 h-3 text-indigo-400 fill-current" />
                <span>Video Sync ON</span>
              </div>

              <button
                onClick={handleRequestSync}
                className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/10 text-[11px] font-semibold cursor-pointer transition flex items-center space-x-1"
                title="Resync Video State"
              >
                <RefreshCw className="w-3 h-3" />
                <span className="hidden sm:inline">Sync</span>
              </button>

              <a
                href={portalUrl || media.url}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/10 transition cursor-pointer"
                title="Popout window in external tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <button
                onClick={toggleFullscreen}
                className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/10 transition cursor-pointer"
                title="Fullscreen (shows floating video chat)"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Playback Mirror Notice Bar */}
          <div className="px-3 py-1 bg-slate-950/90 border-b border-white/5 flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center space-x-1.5 truncate">
              <Sparkles className="w-3 h-3 text-emerald-400 flex-shrink-0" />
              <span className="text-slate-300 font-medium truncate">
                {holdsRemote
                  ? "🎮 You hold the Virtual Remote: You control video playback & navigation for the room."
                  : `🎮 Synced Live with ${remoteControllerName}: Playback & navigation mirror in lockstep.`}
              </span>
            </div>
          </div>

          {/* Embedded In-Website Frame */}
          <div className="flex-1 w-full h-full relative bg-slate-900 overflow-hidden">
            <iframe
              ref={iframeRef}
              key={`${media?.id || brand.shortTag}-${embedPortalSrc}`}
              src={embedPortalSrc}
              title={`${brand.name} Portal`}
              className="w-full h-full border-0"
              allow="autoplay *; encrypted-media *; fullscreen *; picture-in-picture *; clipboard-read; clipboard-write; credentials"
            />
          </div>
        </div>
      ) : media?.type === 'stream' ? (
        /* ============================================================== */
        /* MEDIA TYPE 5: FALLBACK STREAM EMBED (Only if cannot be native) */
        /* ============================================================== */
        <div className="w-full h-full flex flex-col bg-slate-950 relative">
          {/* Dedicated Non-Overlapping Header with Platform Branding */}
          <div className="p-2.5 sm:p-3 bg-slate-900 border-b border-white/10 flex items-center justify-between text-xs z-20 gap-2 flex-wrap">
            <div className="flex items-center space-x-2 flex-1 min-w-0">
              <span className="px-2.5 py-1 rounded-md font-bold text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center space-x-1.5 flex-shrink-0">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Synced Movie Stream</span>
              </span>

              <h3 className="font-bold text-white text-sm truncate max-w-sm sm:max-w-md">
                {media.title}
              </h3>
              {media.year && <span className="text-xs text-slate-400 hidden sm:inline">• {media.year}</span>}
              <span className="text-[10px] text-emerald-300 font-semibold bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30 hidden md:inline">
                Synced Live to Room
              </span>
            </div>

            {/* Quick Actions & Sync Indicators */}
            <div className="flex items-center space-x-2 flex-shrink-0">
              {media.backupUrl && (
                <div className="flex items-center space-x-1 bg-slate-950 px-2 py-1 rounded-lg border border-white/10 text-[11px]">
                  <span className="text-slate-400 text-[10px]">Server:</span>
                  <button
                    onClick={() => setStreamServer('primary')}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                      streamServer === 'primary' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Server 1
                  </button>
                  <button
                    onClick={() => setStreamServer('backup')}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                      streamServer === 'backup' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Server 2
                  </button>
                </div>
              )}

              <div className="flex items-center space-x-1 px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-300 font-semibold text-[11px] border border-emerald-500/30">
                <Zap className="w-3 h-3 text-emerald-400 fill-current" />
                <span>Lockstep Sync</span>
              </div>

              <button
                onClick={handleRequestSync}
                className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/10 text-[11px] font-semibold cursor-pointer transition flex items-center space-x-1"
                title="Resync Video State"
              >
                <RefreshCw className="w-3 h-3" />
                <span className="hidden sm:inline">Sync</span>
              </button>

              <button
                onClick={() => setShowFloatingCam(prev => !prev)}
                className={`p-1.5 rounded-md border text-xs transition cursor-pointer flex items-center space-x-1 ${
                  showFloatingCam ? 'bg-indigo-600 text-white border-indigo-400' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-white/10'
                }`}
                title="Toggle Floating Video Chat over movie"
              >
                <Camera className="w-3.5 h-3.5" />
                <span className="hidden md:inline text-[10px]">Party Cam</span>
              </button>

              <button
                onClick={toggleFullscreen}
                className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/10 transition cursor-pointer"
                title="Fullscreen (shows floating video chat)"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Direct Stream Player Frame */}
          <div className="flex-1 w-full h-full relative bg-black overflow-hidden">
            <iframe
              ref={iframeRef}
              key={`${media.id}-${streamServer}`}
              src={streamServer === 'backup' && media.backupUrl ? media.backupUrl : media.url}
              title={media.title}
              className="w-full h-full border-0"
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-popups allow-modals allow-downloads"
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-12 text-slate-400 space-y-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/15 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-xl">
            <Film className="w-8 h-8 animate-pulse" />
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-black text-white tracking-wide">Theater Ready</h3>
            <p className="text-xs max-w-sm text-slate-400">
              No movie is currently playing. Search and select any movie or series to stream together in synchronized lockstep.
            </p>
          </div>
          {onOpenCatalog && (
            <button
              onClick={onOpenCatalog}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center space-x-2 transition cursor-pointer active:scale-95"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Browse Catalog & Search</span>
            </button>
          )}
        </div>
      )}

      {/* Center Big Play Button (Shown ONLY when PAUSED so it never blocks the movie during playback) */}
      {!isPlaying && !isLoadingMedia && (isNativeVideo || media?.type === 'youtube') && !activeScreenStream && (
        <div 
          onClick={handleTogglePlay}
          className="absolute z-20 w-20 h-20 rounded-full bg-indigo-600/90 hover:bg-indigo-500 backdrop-blur-md border border-white/30 flex items-center justify-center cursor-pointer hover:scale-110 active:scale-95 transition-all text-white shadow-2xl shadow-indigo-500/40"
          title="Click to Play"
        >
          <Play className="w-9 h-9 fill-current translate-x-0.5" />
        </div>
      )}

      {/* Floating Top Header Badge (Shown for native video and youtube) */}
      {(isNativeVideo || media?.type === 'youtube') && !activeScreenStream && (
        <div className={`absolute top-0 inset-x-0 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent z-20 flex items-center justify-between transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        } ${(isFullscreen || showFloatingCam) && !isFloatingCamMinimized ? 'pr-80 sm:pr-96' : ''}`}>
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-indigo-600/30 border border-indigo-500/40 text-indigo-400">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white tracking-wide truncate max-w-xs sm:max-w-md">
                  {media?.title || 'Watch Party Stream'}
                </h2>
                {(media?.isTv || media?.season) && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/25 text-indigo-300 border border-indigo-500/40 flex-shrink-0">
                    S{media.season || 1}:E{media.episode || 1}{media.episodeTitle ? ` • ${media.episodeTitle}` : ''}
                  </span>
                )}
                {media?.source && (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider border flex-shrink-0 ${
                    media.source === '7REELS' || media.platform === '7reels'
                      ? 'bg-rose-500/25 text-rose-300 border-rose-500/40'
                      : media.source === '1Fmovies' || media.platform === '1fmovies'
                        ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
                        : 'bg-indigo-500/25 text-indigo-300 border-indigo-500/40'
                  }`}>
                    {media.source}
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2 text-xs text-slate-400">
                <span className="font-medium text-slate-300">
                  {media?.sourceDomain ? `Source: ${media.sourceDomain}` : (media?.source ? `Source: ${media.source}` : (media?.platform || media?.type || 'Stream'))}
                </span>
                <span>•</span>
                <span>{holdsRemote ? '🎮 You Hold Remote' : `🎮 ${remoteControllerName} Controls`}</span>
              </div>
            </div>
          </div>

          {/* Auto-Sync Live Badge & Party Cam Action */}
          <div className="flex items-center space-x-2.5">
            {audioTracks && audioTracks.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowAudioMenu(prev => !prev)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 transition cursor-pointer shadow-sm"
                  title="Select Audio Language"
                >
                  <Languages className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-[11px] font-bold">
                    {formatLanguageName(audioTracks[currentAudioTrack] || audioTracks[0])}
                  </span>
                  <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
                </button>

                {showAudioMenu && (
                  <div className="absolute top-full mt-2 right-0 bg-slate-900/95 backdrop-blur-2xl border border-white/15 rounded-2xl p-2 shadow-2xl z-50 min-w-[200px] max-h-72 overflow-y-auto space-y-1 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-2 py-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center justify-between border-b border-white/10 pb-1.5 mb-1">
                      <span className="flex items-center space-x-1">
                        <Languages className="w-3 h-3 text-indigo-400" />
                        <span>Select Audio Language</span>
                      </span>
                      <span className="text-[9px] text-indigo-300 font-bold bg-indigo-500/20 px-1.5 py-0.5 rounded border border-indigo-500/30">
                        {audioTracks.length} Available
                      </span>
                    </div>

                    <div className="space-y-0.5 custom-scrollbar">
                      {audioTracks.map((track, idx) => {
                        const trackId = track.id !== undefined ? track.id : idx;
                        const isCurrent = currentAudioTrack === trackId || (currentAudioTrack === -1 && idx === 0);
                        const langLabel = formatLanguageName(track);
                        return (
                          <button
                            key={`top-audio-${trackId}-${idx}`}
                            onClick={() => handleSelectAudioTrack(trackId)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                              isCurrent ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-200 hover:bg-white/10'
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              <span className={`w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-white' : 'bg-indigo-400'}`} />
                              <span className="truncate">{langLabel}</span>
                            </div>
                            {isCurrent && <Check className="w-3.5 h-3.5 text-white flex-shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setShowFloatingCam(prev => !prev)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow transition cursor-pointer border ${
                showFloatingCam || isFullscreen
                  ? 'bg-indigo-600 text-white border-indigo-400/50'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-white/10'
              }`}
              title="Toggle Watch Party Floating Video Chat"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Party Cam</span>
            </button>

            <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Auto-Sync ON</span>
            </div>

            <button
              onClick={handleRequestSync}
              title="Force Instant Resync with Host"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/80 hover:bg-indigo-600 text-white text-xs font-semibold shadow-lg hover:shadow-indigo-500/20 active:scale-95 transition-all cursor-pointer border border-indigo-400/30"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
              <span>Resync</span>
            </button>
          </div>
        </div>
      )}

      {/* Custom Bottom Control Bar: Rendered ONLY for native video, HLS, YouTube and Screen Share */}
      {(isNativeVideo || media?.type === 'youtube' || activeScreenStream) && (
        <div className={`absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/90 via-black/60 to-transparent z-20 flex flex-col space-y-2 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="relative w-full group/slider flex items-center">
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.1"
              value={currentTime}
              onChange={handleScrub}
              disabled={!canControl || Boolean(activeScreenStream)}
              className={`w-full h-1.5 bg-slate-700/80 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:h-2 transition-all ${(!canControl || activeScreenStream) ? 'opacity-80 cursor-not-allowed' : ''}`}
            />
          </div>

          <div className="flex items-center justify-between text-white text-sm pt-1">
            <div className="flex items-center space-x-4">
              <button
                onClick={handleTogglePlay}
                className="p-1.5 rounded-lg hover:bg-white/10 active:scale-90 transition-all cursor-pointer"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              </button>

              <div className="text-xs font-mono text-slate-300">
                <span>{formatTime(currentTime)}</span>
                <span className="text-slate-500 mx-1">/</span>
                <span className="text-slate-400">{formatTime(duration)}</span>
              </div>

              <div className="flex items-center space-x-2 group/vol">
                <button 
                  onClick={handleToggleMute}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-5 h-5 text-red-400" />
                  ) : (
                    <Volume2 className="w-5 h-5 text-slate-300" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-400"
                />
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {/* Audio Language Switcher (e.g. Hindi, English, Spanish) */}
              {audioTracks && audioTracks.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setShowAudioMenu(prev => !prev)}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer shadow-sm"
                    title="Change Audio Language"
                  >
                    <Languages className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-[11px] font-bold truncate max-w-[100px]">
                      {formatLanguageName(audioTracks[currentAudioTrack] || audioTracks[0])}
                    </span>
                    <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
                  </button>

                  {showAudioMenu && (
                    <div className="absolute bottom-full mb-2 right-0 bg-slate-900/95 backdrop-blur-2xl border border-white/15 rounded-2xl p-2 shadow-2xl z-50 min-w-[190px] space-y-1 animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-2 py-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center justify-between border-b border-white/10 pb-1.5 mb-1">
                        <span className="flex items-center space-x-1">
                          <Languages className="w-3 h-3 text-indigo-400" />
                          <span>Audio Language</span>
                        </span>
                        <span className="text-[9px] font-mono text-indigo-300 bg-indigo-500/20 px-1.5 py-0.5 rounded border border-indigo-500/30">
                          {audioTracks.length} Available
                        </span>
                      </div>
                      <div className="max-h-56 overflow-y-auto space-y-0.5 custom-scrollbar">
                        {audioTracks.map((track, idx) => {
                          const isSelected = currentAudioTrack === track.id || (currentAudioTrack === -1 && idx === 0);
                          const formatted = formatLanguageName(track);
                          return (
                            <button
                              key={track.id !== undefined ? track.id : idx}
                              onClick={() => handleSelectAudioTrack(track.id !== undefined ? track.id : idx)}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition cursor-pointer ${
                                isSelected
                                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-bold shadow-md shadow-indigo-600/20'
                                  : 'text-slate-300 hover:bg-white/10'
                              }`}
                            >
                              <div className="flex items-center space-x-2 truncate">
                                <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-indigo-400'}`} />
                                <span className="truncate">{formatted}</span>
                              </div>
                              {isSelected && <Check className="w-3.5 h-3.5 text-white flex-shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TV Series Episode & Season Quick Selector */}
              {(media?.isTv || media?.season || media?.genre?.includes('Series') || media?.duration === 'Series') && (
                <div className="flex items-center space-x-1">
                  <button
                    onClick={handleToggleEpisodesDrawer}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer border bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border-indigo-500/40 shadow-sm"
                    title="Select Season & Episode"
                  >
                    <List className="w-3.5 h-3.5 text-indigo-300" />
                    <span className="text-[11px] font-bold">
                      S{media.season || 1}:E{media.episode || 1}
                    </span>
                    <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
                  </button>

                  <button
                    onClick={handlePlayerNextEpisode}
                    disabled={!canControl}
                    className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1 transition cursor-pointer border ${
                      canControl
                        ? 'bg-white/10 hover:bg-white/20 text-slate-200 border-white/10 active:scale-95'
                        : 'bg-white/5 text-slate-500 border-white/5 cursor-not-allowed'
                    }`}
                    title="Play Next Episode"
                  >
                    <span className="text-[10px] font-bold">Next</span>
                    <SkipForward className="w-3 h-3 text-indigo-300" />
                  </button>
                </div>
              )}

              {/* Stream Quality Selector (Highest Quality Available) */}
              <div className="relative">
                <button
                  onClick={() => setShowQualityMenu(prev => !prev)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer border ${
                    selectedQuality === '2160p'
                      ? 'bg-gradient-to-r from-amber-500/25 to-yellow-500/25 text-amber-300 border-amber-500/50 shadow-lg shadow-amber-500/20'
                      : selectedQuality === '1080p'
                        ? 'bg-gradient-to-r from-emerald-500/25 to-teal-500/25 text-emerald-300 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                        : 'bg-white/10 hover:bg-white/20 text-slate-300 border-white/5'
                  }`}
                  title="Select Stream Quality (Highest Available)"
                >
                  {(selectedQuality === '2160p' || selectedQuality === '1080p') && <Sparkles className="w-3 h-3 text-amber-400 animate-pulse" />}
                  <span className="text-[11px] font-bold">
                    {selectedQuality === 'auto'
                      ? (availableQualityOptions.find(q => q.id === 'auto')?.shortLabel || 'Auto')
                      : (availableQualityOptions.find(q => q.id === selectedQuality)?.shortLabel || selectedQuality)}
                  </span>
                  <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
                </button>

                {showQualityMenu && (
                  <div className="absolute bottom-full mb-2 right-0 bg-slate-900/95 backdrop-blur-2xl border border-white/15 rounded-2xl p-2 shadow-2xl z-50 min-w-[220px] space-y-1 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-2 py-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center justify-between border-b border-white/10 pb-1.5 mb-1">
                      <span>Stream Quality</span>
                      <span className="text-[9px] text-amber-400 font-bold bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-500/30">Highest Quality (4K UHD)</span>
                    </div>

                    <div className="space-y-0.5">
                      {availableQualityOptions.map((opt) => {
                        const isCurrent = selectedQuality === opt.id;
                        return (
                          <button
                            key={opt.id}
                            onClick={() => handleSelectQuality(opt.id)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                              isCurrent 
                                ? 'bg-indigo-600 text-white shadow-md' 
                                : 'text-slate-200 hover:bg-white/10'
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${opt.badgeClass}`}>
                                {opt.badge}
                              </span>
                              <span>{opt.label}</span>
                            </div>
                            {isCurrent && <Check className="w-3.5 h-3.5 text-white flex-shrink-0" />}
                          </button>
                        );
                      })}

                      {(media?.source === '7REELS' || media?.platform === '7reels' || media?.backupUrl?.includes('7reels')) && (
                        <div className="pt-2 mt-1.5 border-t border-white/10 space-y-1.5">
                          <div className="text-[10px] font-extrabold text-rose-400 px-1 flex items-center justify-between">
                            <span>7REELS Servers</span>
                            <span className="text-[8px] font-mono bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded border border-rose-500/30">Miami • Boise • 4K UHD</span>
                          </div>
                          <button
                            onClick={() => {
                              setShowQualityMenu(false);
                              const targetUrl = media?.backupUrl || (media?.tmdbId ? `https://7reels.cc/movie/${media.tmdbId}/watch` : 'https://7reels.cc/');
                              window.open(targetUrl, '_blank');
                            }}
                            className="w-full text-left px-2 py-1.5 rounded-lg text-[11px] font-bold text-rose-300 hover:bg-rose-500/20 bg-rose-500/10 border border-rose-500/30 flex items-center justify-between transition cursor-pointer"
                            title="Open native 7REELS watch page with Miami/Boise servers"
                          >
                            <span>Open 7REELS Full HD</span>
                            <ExternalLink className="w-3 h-3 text-rose-400" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowFloatingCam(prev => !prev)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer border ${
                  showFloatingCam || isFullscreen 
                    ? 'bg-indigo-600 text-white border-indigo-400/50 shadow' 
                    : 'bg-white/10 hover:bg-white/20 text-slate-300 border-white/5'
                }`}
                title="Toggle Floating Video Chat"
              >
                <Camera className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px]">Party Cam</span>
              </button>

              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-md font-semibold border border-emerald-500/30 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Auto-Sync Active</span>
              </span>

              <button
                onClick={toggleFullscreen}
                className="p-1.5 rounded-lg hover:bg-white/10 active:scale-90 transition cursor-pointer"
                title="Fullscreen"
              >
                {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* IN-PLAYER TV SERIES SEASONS & EPISODES SELECTION DRAWER         */}
      {/* ============================================================== */}
      {showEpisodesDrawer && (
        <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md z-40 flex flex-col animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="p-3 sm:p-4 bg-slate-900 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center space-x-2.5 min-w-0">
              <Tv className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <div className="min-w-0">
                <h3 className="font-bold text-white text-sm truncate">
                  {media?.title} — Seasons & Episodes
                </h3>
                <span className="text-[11px] text-slate-400">
                  {holdsRemote ? '🎮 Select episode to play for room' : `🎮 Viewing episodes (Host: ${remoteControllerName})`}
                </span>
              </div>
            </div>

            <button
              onClick={() => setShowEpisodesDrawer(false)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Season Selector Tabs */}
          <div className="p-2.5 bg-slate-900/60 border-b border-white/5 flex items-center space-x-2 overflow-x-auto scrollbar-none">
            {(playerTvDetails?.seasons || [{ seasonNumber: 1, name: 'Season 1' }]).map((s) => {
              const isSelected = Number(playerActiveSeason) === Number(s.seasonNumber);
              return (
                <button
                  key={s.seasonNumber}
                  onClick={() => handlePlayerSelectSeason(s.seasonNumber)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer border flex items-center space-x-1.5 ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30'
                      : 'bg-slate-800 text-slate-300 border-white/10 hover:bg-slate-700'
                  }`}
                >
                  <span>{s.name || `Season ${s.seasonNumber}`}</span>
                  {s.episodeCount > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isSelected ? 'bg-indigo-950/60 text-indigo-200' : 'bg-slate-900 text-slate-400'
                    }`}>
                      {s.episodeCount} eps
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Episode Cards List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {playerLoadingEpisodes ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-2">
                <Loader2 className="w-7 h-7 text-indigo-400 animate-spin" />
                <span className="text-xs text-slate-400">Loading Season {playerActiveSeason} episodes...</span>
              </div>
            ) : playerSeasonEpisodes.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                No episodes found for this season.
              </div>
            ) : (
              playerSeasonEpisodes.map((ep) => {
                const isPlayingThisEp = 
                  Number(media?.season || 1) === Number(playerActiveSeason) &&
                  Number(media?.episode || 1) === Number(ep.episodeNumber);

                return (
                  <div
                    key={ep.episodeNumber}
                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                      isPlayingThisEp
                        ? 'bg-indigo-950/40 border-indigo-500/60 ring-1 ring-indigo-500/30'
                        : 'bg-slate-800/40 hover:bg-slate-800/80 border-white/5'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      {ep.still ? (
                        <div className="w-16 h-11 rounded-lg overflow-hidden bg-slate-900 flex-shrink-0 relative">
                          <img
                            src={ep.still}
                            alt={ep.name}
                            className="w-full h-full object-cover"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                          <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-[9px] font-mono px-1 rounded text-white">
                            E{ep.episodeNumber}
                          </span>
                        </div>
                      ) : (
                        <span className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          E{ep.episodeNumber}
                        </span>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-white truncate">
                          {ep.episodeNumber}. {ep.name}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center space-x-2 mt-0.5">
                          {ep.runtime && <span>{ep.runtime}</span>}
                          {ep.airDate && <span>• {ep.airDate}</span>}
                        </div>
                        {ep.overview && (
                          <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                            {ep.overview}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      {isPlayingThisEp ? (
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center space-x-1">
                          <Check className="w-3.5 h-3.5" />
                          <span>Playing</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => handlePlayerSelectEpisode(playerActiveSeason, ep.episodeNumber, ep.name)}
                          disabled={!canControl}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1 transition cursor-pointer shadow ${
                            canControl
                              ? 'bg-indigo-600 hover:bg-indigo-500 text-white active:scale-95 shadow-indigo-600/30'
                              : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Play</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
