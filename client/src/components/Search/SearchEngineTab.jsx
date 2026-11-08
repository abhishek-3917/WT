import React, { useState, useEffect } from 'react';
import socket from '../../services/socket';
import { 
  Search, Film, Globe, Play, CheckCircle, 
  Sparkles, ExternalLink, SlidersHorizontal, AlertCircle,
  Tv, Monitor, Radio, Compass, RefreshCw, X
} from 'lucide-react';

const YoutubeIcon = ({ className = "w-3 h-3" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

export default function SearchEngineTab({ 
  room, 
  currentUser, 
  onClose,
  onStartTabBroadcast 
}) {
  const [activeSubTab, setActiveSubTab] = useState('browse'); // 'browse' | 'platforms' | 'custom-link'
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // Platform specific inputs
  const [oneFmoviesUrl, setOneFmoviesUrl] = useState('https://1fmovies.live/');
  const [netflixUrl, setNetflixUrl] = useState('');
  const [hotstarUrl, setHotstarUrl] = useState('');
  const [primeUrl, setPrimeUrl] = useState('');

  // Custom link inputs
  const [customUrl, setCustomUrl] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customError, setCustomError] = useState('');

  const isHost = currentUser?.isHost;
  const holdsRemote = (currentUser?.socketId === (room?.remoteControllerId || room?.hostId)) || (!room?.remoteControllerId && isHost);
  const canControl = holdsRemote || isHost || room?.settings?.controlMode === 'open';
  const currentMediaId = room?.media?.id;

  const categories = [
    { id: 'all', label: 'All Titles & Trending' },
    { id: 'movies', label: 'Feature Films' },
    { id: 'animation', label: 'Animation' },
    { id: 'sci-fi', label: 'Sci-Fi' },
    { id: 'horror', label: 'Horror' },
    { id: 'youtube', label: 'YouTube' }
  ];

  // Fetch search results from backend API
  const fetchSearchResults = async (searchQuery = '', selectedCategory = 'all') => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('q', searchQuery);
      if (selectedCategory && selectedCategory !== 'all') params.append('category', selectedCategory);

      const res = await fetch(`/api/search?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
      }
    } catch (err) {
      console.error('[Search Error]', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSearchResults(query, category);
    }, 200);
    return () => clearTimeout(timer);
  }, [query, category, activeSubTab]);

  // Handle playing selected movie or platform in room
  const handleSelectMedia = async (mediaItem) => {
    if (!canControl) {
      alert('Only the Virtual Remote holder has permission to change the video. Request or grab the remote to choose movies!');
      return;
    }

    let finalItem = { ...mediaItem };

    // If it is a TMDB movie or has tmdbId, resolve direct HLS stream so it plays in our SINGLE synced player!
    const tmdbId = mediaItem.tmdbId || 
      (mediaItem.id && mediaItem.id.startsWith('tmdb-') ? mediaItem.id.replace('tmdb-', '') : null) ||
      (mediaItem.url?.match(/tmdb_id=(\d+)/)?.[1]);
    if (tmdbId) {
      try {
        const res = await fetch(`/api/resolve-stream?tmdbId=${tmdbId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.streamUrl) {
            finalItem.url = data.streamUrl;
            finalItem.type = 'hls';
            finalItem.backupUrl = mediaItem.url;
          }
        }
      } catch (err) {
        console.warn('[Direct Stream Resolve]', err);
      }
    }

    socket.emit('media_change', {
      roomId: room.id,
      media: {
        id: finalItem.id || `media-${Date.now()}`,
        tmdbId: tmdbId || null,
        title: finalItem.title,
        url: finalItem.url,
        backupUrl: finalItem.backupUrl || null,
        type: finalItem.type || (finalItem.url?.includes('.m3u8') ? 'hls' : finalItem.url?.includes('embed') || finalItem.url?.includes('silverlinehub') ? 'stream' : 'video'),
        thumbnail: finalItem.thumbnail || finalItem.backdrop,
        platform: finalItem.platform || null,
        color: finalItem.color || null,
        year: finalItem.year || null,
        genre: finalItem.genre || null
      }
    });

    if (onClose) onClose();
  };

  // Launch 1Fmovies Player in Room
  const handleLaunch1Fmovies = (customPath = '') => {
    const finalUrl = customPath.trim() || oneFmoviesUrl.trim() || 'https://1fmovies.live/';
    handleSelectMedia({
      id: `1fmovies-${Date.now()}`,
      title: "1Fmovies — Free HD Movies & Series",
      url: finalUrl,
      type: "1fmovies",
      platform: "1fmovies",
      thumbnail: "https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?auto=format&fit=crop&w=800&q=80",
      color: "#10b981"
    });
  };

  // Launch Netflix Co-Watch Deck
  const handleLaunchNetflix = () => {
    const finalUrl = netflixUrl.trim() || 'https://www.netflix.com';
    handleSelectMedia({
      id: `netflix-${Date.now()}`,
      title: "Netflix Watch Together",
      url: finalUrl,
      type: "platform",
      platform: "netflix",
      thumbnail: "https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?auto=format&fit=crop&w=800&q=80",
      color: "#e50914"
    });
  };

  // Launch Disney+ Hotstar Co-Watch Deck
  const handleLaunchHotstar = () => {
    const finalUrl = hotstarUrl.trim() || 'https://www.hotstar.com';
    handleSelectMedia({
      id: `hotstar-${Date.now()}`,
      title: "Disney+ Hotstar Watch Together",
      url: finalUrl,
      type: "platform",
      platform: "hotstar",
      thumbnail: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=800&q=80",
      color: "#1d4ed8"
    });
  };

  // Launch Amazon Prime Video Co-Watch Deck
  const handleLaunchPrime = () => {
    const finalUrl = primeUrl.trim() || 'https://www.primevideo.com';
    handleSelectMedia({
      id: `prime-${Date.now()}`,
      title: "Amazon Prime Video Watch Together",
      url: finalUrl,
      type: "platform",
      platform: "prime",
      thumbnail: "https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=800&q=80",
      color: "#00a8e1"
    });
  };

  // Submit custom link
  const handleCustomSubmit = (e) => {
    e.preventDefault();
    setCustomError('');

    const trimmed = customUrl.trim();
    if (!trimmed) {
      setCustomError('Please enter a valid URL.');
      return;
    }

    if (trimmed.includes('1fmovies.live')) {
      handleLaunch1Fmovies(trimmed);
      return;
    }

    let detectedType = 'video';
    let finalUrl = trimmed;

    const ytMatch = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (ytMatch) {
      detectedType = 'youtube';
      finalUrl = ytMatch[1];
    } else if (trimmed.includes('netflix.com')) {
      handleSelectMedia({
        id: `netflix-${Date.now()}`,
        title: "Netflix Stream",
        url: trimmed,
        type: "platform",
        platform: "netflix",
        color: "#e50914"
      });
      return;
    } else if (trimmed.includes('hotstar.com')) {
      handleSelectMedia({
        id: `hotstar-${Date.now()}`,
        title: "Hotstar Stream",
        url: trimmed,
        type: "platform",
        platform: "hotstar",
        color: "#1d4ed8"
      });
      return;
    } else if (trimmed.includes('primevideo.com') || trimmed.includes('amazon.')) {
      handleSelectMedia({
        id: `prime-${Date.now()}`,
        title: "Amazon Prime Stream",
        url: trimmed,
        type: "platform",
        platform: "prime",
        color: "#00a8e1"
      });
      return;
    }

    const title = customTitle.trim() || (detectedType === 'youtube' ? `YouTube Video (${finalUrl})` : 'Custom Video Stream');

    handleSelectMedia({
      id: `custom-${Date.now()}`,
      title,
      url: finalUrl,
      type: detectedType,
      thumbnail: detectedType === 'youtube' ? `https://img.youtube.com/vi/${finalUrl}/hqdefault.jpg` : ''
    });
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/95 border-l border-white/10 text-slate-100 w-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex flex-col space-y-3 bg-slate-950/70">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">Streaming & Search Hub</h2>
              <p className="text-xs text-slate-400">Direct Video Sync • Movies • Series • Platforms</p>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center space-x-1 bg-slate-800/80 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setActiveSubTab('browse')}
              className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeSubTab === 'browse' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Movies
            </button>
            <button
              onClick={() => setActiveSubTab('platforms')}
              className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeSubTab === 'platforms' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Platforms
            </button>
            <button
              onClick={() => setActiveSubTab('custom-link')}
              className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeSubTab === 'custom-link' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              URL
            </button>
          </div>
        </div>

        {/* Universal Movie & Series Search Input */}
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (activeSubTab !== 'browse') setActiveSubTab('browse');
            }}
            placeholder="Search any movie or show (e.g. Batman, MobLand, Odyssey)..."
            className="w-full bg-slate-900 border border-white/10 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* SUBTAB 1: STREAMING PLATFORMS (1Fmovies, Netflix, Hotstar, Prime Video) */}
      {activeSubTab === 'platforms' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="text-xs text-slate-400 leading-relaxed bg-slate-950/50 p-3 rounded-xl border border-white/5">
            Select any streaming service below. You can either stream via the in-app portal or broadcast your browser tab with full audio!
          </div>

          {/* 1. 1FMOVIES.LIVE INTEGRATION */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center font-black text-sm">
                  1F
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-1.5">
                    <span>1Fmovies</span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono">1fmovies.live</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">Free HD Movies & Series In-App Portal</p>
                </div>
              </div>

              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-semibold">
                Direct Embed
              </span>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="block text-[11px] font-semibold text-slate-300">
                1Fmovies URL or Movie Page
              </label>
              <input
                type="text"
                value={oneFmoviesUrl}
                onChange={(e) => setOneFmoviesUrl(e.target.value)}
                placeholder="https://1fmovies.live/ or specific movie URL"
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              onClick={() => handleLaunch1Fmovies()}
              disabled={!canControl}
              className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition cursor-pointer shadow-md ${
                canControl
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white active:scale-95'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Launch 1Fmovies Player in Room</span>
            </button>
          </div>

          {/* 2. NETFLIX INTEGRATION */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-red-950/40 via-slate-900 to-slate-900 border border-red-600/30 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-600/20 text-red-500 border border-red-600/40 flex items-center justify-center font-black text-sm">
                  N
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-1.5">
                    <span>Netflix</span>
                    <span className="text-[10px] bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded font-mono">netflix.com</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">Open In-Website Window & Log In</p>
                </div>
              </div>

              <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full font-semibold">
                In-Website Window
              </span>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="block text-[11px] font-semibold text-slate-300">
                Netflix URL / Show Page
              </label>
              <input
                type="text"
                value={netflixUrl}
                onChange={(e) => setNetflixUrl(e.target.value)}
                placeholder="https://www.netflix.com/login or movie URL"
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
              />
            </div>

            <button
              onClick={handleLaunchNetflix}
              disabled={!canControl}
              className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition cursor-pointer shadow-md ${
                canControl
                  ? 'bg-red-600 hover:bg-red-500 text-white active:scale-95'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Open Netflix Window in Website</span>
            </button>
          </div>

          {/* 3. DISNEY+ HOTSTAR INTEGRATION */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-950/40 via-slate-900 to-slate-900 border border-blue-600/30 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-600/40 flex items-center justify-center font-black text-sm">
                  ★
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-1.5">
                    <span>Disney+ Hotstar</span>
                    <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-mono">hotstar.com</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">Open In-Website Window & Log In</p>
                </div>
              </div>

              <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-semibold">
                In-Website Window
              </span>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="block text-[11px] font-semibold text-slate-300">
                Hotstar URL / Show Page
              </label>
              <input
                type="text"
                value={hotstarUrl}
                onChange={(e) => setHotstarUrl(e.target.value)}
                placeholder="https://www.hotstar.com or specific show link"
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              onClick={handleLaunchHotstar}
              disabled={!canControl}
              className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition cursor-pointer shadow-md ${
                canControl
                  ? 'bg-blue-600 hover:bg-blue-500 text-white active:scale-95'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Open Hotstar Window in Website</span>
            </button>
          </div>

          {/* 4. AMAZON PRIME VIDEO INTEGRATION */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-cyan-950/40 via-slate-900 to-slate-900 border border-cyan-500/30 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center font-black text-sm">
                  P
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-1.5">
                    <span>Amazon Prime Video</span>
                    <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded font-mono">primevideo.com</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">Open In-Website Window & Log In</p>
                </div>
              </div>

              <span className="text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full font-semibold">
                In-Website Window
              </span>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="block text-[11px] font-semibold text-slate-300">
                Prime Video URL / Movie Page
              </label>
              <input
                type="text"
                value={primeUrl}
                onChange={(e) => setPrimeUrl(e.target.value)}
                placeholder="https://www.primevideo.com or detail link"
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <button
              onClick={handleLaunchPrime}
              disabled={!canControl}
              className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition cursor-pointer shadow-md ${
                canControl
                  ? 'bg-cyan-600 hover:bg-cyan-500 text-white active:scale-95'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Open Prime Video Window in Website</span>
            </button>
          </div>
        </div>
      )}

      {/* SUBTAB 2: CATALOG & SEARCH */}
      {activeSubTab === 'browse' && (
        <div className="flex flex-col flex-1 overflow-hidden p-4 space-y-3">
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition cursor-pointer ${
                  category === cat.id ? 'bg-indigo-600 text-white shadow' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 space-y-2 text-slate-400">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Searching catalog & public movies...</span>
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center text-slate-400 p-4">
                <Film className="w-10 h-10 mb-2 text-slate-500" />
                <p className="text-sm font-semibold text-slate-300">No movies found for "{query}"</p>
                <p className="text-xs mt-1 text-slate-500">Check the Platforms tab for 1Fmovies, Netflix, Hotstar, and Prime.</p>
              </div>
            ) : (
              results.map((movie) => {
                const isCurrent = currentMediaId === movie.id;
                return (
                  <div
                    key={movie.id}
                    className={`group relative flex bg-slate-800/60 hover:bg-slate-800 border rounded-xl overflow-hidden transition-all duration-200 ${
                      isCurrent ? 'border-indigo-500/80 bg-indigo-950/20 shadow-lg ring-1 ring-indigo-500/50' : 'border-white/5 hover:border-white/15'
                    }`}
                  >
                    <div className="relative w-28 h-24 sm:w-32 sm:h-26 flex-shrink-0 bg-slate-950 overflow-hidden">
                      <img
                        src={movie.thumbnail}
                        alt={movie.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          e.target.src = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=400&q=80';
                        }}
                      />
                      <span className="absolute bottom-1 right-1 bg-black/80 text-[10px] font-mono px-1.5 py-0.5 rounded text-white">
                        {movie.duration}
                      </span>
                    </div>

                    <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
                      <div>
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-white truncate max-w-[170px] group-hover:text-indigo-300 transition-colors">
                            {movie.title}
                          </h4>
                          <span className="text-[11px] font-mono text-amber-400 font-bold ml-1">
                            ★ {movie.rating}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                          {movie.year} • {movie.genre}
                        </p>
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        {isCurrent ? (
                          <span className="text-[11px] font-semibold text-emerald-400 flex items-center space-x-1">
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Now Playing</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSelectMedia(movie)}
                            disabled={!canControl}
                            className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                              canControl
                                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow active:scale-95'
                                : 'bg-slate-700/60 text-slate-500 cursor-not-allowed'
                            }`}
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Play in Room</span>
                          </button>
                        )}
                        <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          {movie.type === 'stream' ? 'Direct Video Sync' : 'Synced'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 3: CUSTOM LINK */}
      {activeSubTab === 'custom-link' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="p-4 rounded-xl bg-slate-800/60 border border-white/5 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Globe className="w-4 h-4 text-indigo-400" />
              <span>Stream Any Web Link</span>
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Paste any link from YouTube, 1Fmovies, Netflix, Hotstar, Prime Video, or direct video streams.
            </p>

            <form onSubmit={handleCustomSubmit} className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Video / Platform URL
                </label>
                <input
                  type="text"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://1fmovies.live/watch/... or youtube.com or netflix.com"
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Custom Title (Optional)
                </label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g. Inception / Stranger Things"
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {customError && (
                <div className="text-xs text-red-400 flex items-center space-x-1.5 bg-red-950/40 p-2 rounded-lg border border-red-800/40">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{customError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={!canControl}
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white flex items-center justify-center space-x-2 cursor-pointer shadow-lg active:scale-95 transition"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Load & Mirror in Room</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
