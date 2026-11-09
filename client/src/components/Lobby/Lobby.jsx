import React, { useState, useEffect } from 'react';
import socket from '../../services/socket';
import { 
  Tv, Sparkles, Users, Video, Mic, Search, Shield, 
  ArrowRight, Film, Play, Compass, RefreshCw, AlertCircle, User
} from 'lucide-react';

export default function Lobby({ onRoomJoined, accountUser, onOpenAuthModal }) {
  const [mode, setMode] = useState('create'); // 'create' | 'join'
  const [name, setName] = useState(accountUser?.username || '');
  const [roomTitle, setRoomTitle] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [controlMode, setControlMode] = useState('host-only');
  const [allowChat, setAllowChat] = useState(true);
  const [allowVideoAudio, setAllowVideoAudio] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-fill username if accountUser changes
  useEffect(() => {
    if (accountUser?.username && !name) {
      setName(accountUser.username);
    }
  }, [accountUser]);

  // Check URL parameters for ?room=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get('room');
    if (urlRoom) {
      setRoomCode(urlRoom.toUpperCase());
      setMode('join');
    }
  }, []);

  const handleCreateRoom = (e) => {
    e.preventDefault();
    setError('');

    const hostName = name.trim() || accountUser?.username || 'Host';
    setLoading(true);

    socket.emit('create_room', {
      hostName,
      roomTitle: roomTitle.trim() || `${hostName}'s Watch Party`,
      settings: {
        controlMode,
        allowChat,
        allowVideoAudio
      }
    }, (res) => {
      setLoading(false);
      if (res?.success) {
        onRoomJoined(res.room, res.user);
      } else {
        setError(res?.error || 'Failed to create room. Please try again.');
      }
    });
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    setError('');

    const participantName = name.trim() || 'Viewer';
    const code = roomCode.trim().toUpperCase();

    if (!code) {
      setError('Please enter a valid room code.');
      return;
    }

    setLoading(true);

    socket.emit('join_room', {
      roomId: code,
      name: participantName,
      hasAudio: false,
      hasVideo: false
    }, (res) => {
      setLoading(false);
      if (res?.success) {
        onRoomJoined(res.room, res.user);
      } else {
        setError(res?.error || 'Could not find or join room. Please check code.');
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#090b11] text-slate-100 flex flex-col justify-between relative overflow-hidden">
      {/* Background ambient glow circles */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-600/15 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full bg-purple-600/15 blur-[140px] pointer-events-none" />

      {/* Navigation Header */}
      <header className="w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-600/30">
            <Tv className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-wider flex items-center space-x-1.5">
              <span>CINE</span>
              <span className="text-indigo-400">SYNC</span>
            </h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
              Live Synced Theater
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400 hidden sm:flex">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Sync Engine Active</span>
          </div>

          {accountUser ? (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 hover:border-indigo-500/50 text-xs font-semibold text-white transition cursor-pointer shadow"
            >
              <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold">
                {accountUser.username?.[0]?.toUpperCase()}
              </div>
              <span>@{accountUser.username}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 text-xs font-semibold transition cursor-pointer active:scale-95 shadow"
            >
              <User className="w-3.5 h-3.5" />
              <span>Sign In / Sign Up</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content Hub */}
      <main className="w-full max-w-6xl mx-auto px-6 py-6 flex-1 flex flex-col lg:flex-row items-center gap-10 z-10">
        {/* Left Column: Hero & Key Features */}
        <div className="flex-1 space-y-6 text-left">
          <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Dual-Device Real-Time Movie Synchronization</span>
          </div>

          <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-tight">
            Watch Movies Together, <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400">
              Perfect Live Sync.
            </span>
          </h2>

          <p className="text-base text-slate-300 max-w-lg leading-relaxed">
            Experience cinema distance-free. Play, pause, seek, voice chat, and search movies seamlessly mirrored on both devices in real time.
          </p>

          {/* Highlights checklist */}
          <div className="grid grid-cols-2 gap-3 pt-2 text-xs text-slate-300">
            <div className="flex items-center space-x-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-white/5">
              <RefreshCw className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Real-Time Playback Mirroring</span>
            </div>
            <div className="flex items-center space-x-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-white/5">
              <Video className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <span>Live Video & Voice Calling</span>
            </div>
            <div className="flex items-center space-x-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-white/5">
              <Search className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <span>Integrated Movie Search Engine</span>
            </div>
            <div className="flex items-center space-x-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-white/5">
              <Shield className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>Host Controls & 1-Click Sync</span>
            </div>
          </div>
        </div>

        {/* Right Column: Room Creation / Join Card */}
        <div className="w-full max-w-md bg-slate-900/80 border border-white/10 rounded-3xl p-6 sm:p-7 shadow-2xl glass-panel relative">
          {/* Mode Switcher Tabs */}
          <div className="flex bg-slate-950 p-1 rounded-2xl mb-6">
            <button
              onClick={() => { setMode('create'); setError(''); }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                mode === 'create'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Create Party (Host)
            </button>
            <button
              onClick={() => { setMode('join'); setError(''); }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                mode === 'join'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Join Room
            </button>
          </div>

          {error && (
            <div className="mb-4 text-xs text-red-400 bg-red-950/40 p-3 rounded-xl border border-red-800/40 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'create' ? (
            /* Mode 1: Create Watch Party */
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Your Host Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Abhi"
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Room Title
                </label>
                <input
                  type="text"
                  value={roomTitle}
                  onChange={(e) => setRoomTitle(e.target.value)}
                  placeholder="e.g. Movie Marathon with Friend"
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Host Options */}
              <div className="space-y-2 pt-1">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Host Permissions
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setControlMode('host-only')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition ${
                      controlMode === 'host-only'
                        ? 'border-indigo-500 bg-indigo-950/40 text-white font-bold'
                        : 'border-white/5 bg-slate-950 text-slate-400'
                    }`}
                  >
                    <span>🛡️ Host Only</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">Only you control movie</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setControlMode('open')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition ${
                      controlMode === 'open'
                        ? 'border-indigo-500 bg-indigo-950/40 text-white font-bold'
                        : 'border-white/5 bg-slate-950 text-slate-400'
                    }`}
                  >
                    <span>👥 Collaborative</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">All viewers can pause/play</p>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-4 py-3 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 flex items-center justify-center space-x-2 cursor-pointer active:scale-95 transition-all"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Create Room & Enter Theater</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Mode 2: Join Watch Party */
            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Your Display Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Friend"
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Room Code
                </label>
                <input
                  type="text"
                  required
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="e.g. ROOM-7K9A"
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono tracking-wider text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 uppercase"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-2 text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Participant Options:</span>
                <p className="text-[11px] leading-relaxed">
                  Upon entering, you will have live video, voice, and text chat. You can also press <strong>Request Sync</strong> anytime to snap your video directly to the host's timestamp.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-4 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 flex items-center justify-center space-x-2 cursor-pointer active:scale-95 transition-all"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Join Room & Sync Live</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-6xl mx-auto px-6 py-4 text-center text-xs text-slate-500 border-t border-white/5">
        CineSync • Dual-Device Synchronized Watch Party with Video, Voice & Integrated Search
      </footer>
    </div>
  );
}

