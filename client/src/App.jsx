import React, { useState, useEffect, useCallback } from 'react';
import socket from './services/socket';
import { useWebRTC } from './hooks/useWebRTC';

import Lobby from './components/Lobby/Lobby';
import SyncedPlayer from './components/Player/SyncedPlayer';
import SearchEngineTab from './components/Search/SearchEngineTab';
import VideoChatGrid from './components/Chat/VideoChatGrid';
import TextChatPanel from './components/Chat/TextChatPanel';
import HostSettingsModal from './components/Room/HostSettingsModal';
import InviteModal from './components/Room/InviteModal';

import { 
  Tv, Search, MessageSquare, Video, Settings, Share2, 
  LogOut, Users, Sparkles, ChevronRight, ChevronLeft, 
  Shield, RefreshCw, Gamepad2, Film, Play, Compass, ExternalLink
} from 'lucide-react';

export default function App() {
  const [room, setRoom] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeSideTab, setActiveSideTab] = useState('chat'); // Scener defaults to Chat & Lounge
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showPassRemoteDropdown, setShowPassRemoteDropdown] = useState(false);
  const [remoteNotice, setRemoteNotice] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);

  // WebRTC hook for peer-to-peer audio and video
  const {
    localStream,
    remoteStreams,
    isAudioMuted,
    isVideoMuted,
    isScreenSharing,
    mediaPermissionGranted,
    initLocalStream,
    toggleAudio,
    toggleVideo,
    toggleScreenShare
  } = useWebRTC(room?.id, currentUser);

  // Handle room joined from Lobby
  const handleRoomJoined = (roomData, userData) => {
    setRoom(roomData);
    setCurrentUser(userData);

    // Initial system greeting in Scener style
    setMessages([
      {
        id: `sys-welcome-${Date.now()}`,
        text: `Welcome to "${roomData.title}"! Scener Virtual Theater is live. Room Code: ${roomData.id}`,
        timestamp: Date.now(),
        isSystem: true
      }
    ]);

    // Automatically prompt media stream if enabled
    if (roomData.settings.allowVideoAudio) {
      initLocalStream(true, true);
    }
  };

  // Socket event listeners for Room state
  useEffect(() => {
    if (!room?.id) return;

    // Room settings updated by host
    const handleSettingsUpdated = ({ settings }) => {
      setRoom((prev) => (prev ? { ...prev, settings } : prev));
    };

    // Media changed (Host or Remote holder switched movie/platform)
    const handleMediaChanged = ({ media, triggeredBy }) => {
      setRoom((prev) => (prev ? { ...prev, media } : prev));
    };

    // Chat messages
    const handleNewChatMessage = (msg) => {
      setMessages((prev) => [...prev, msg]);
    };

    // System messages
    const handleSystemMessage = (sysMsg) => {
      setMessages((prev) => [...prev, { ...sysMsg, isSystem: true }]);
    };

    // Floating reaction burst (Popcorn, Love, Fire, etc.)
    const handleFloatingReaction = ({ id, emoji, senderName }) => {
      const rx = {
        id,
        emoji,
        senderName,
        x: 20 + Math.random() * 60
      };
      setReactions((prev) => [...prev, rx]);

      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== id));
      }, 2500);
    };

    // User joined/left updates member list
    const handleUserJoined = ({ user, membersCount }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        const updatedMembers = [...(prev.members || [])];
        if (!updatedMembers.some((m) => m.socketId === user.socketId)) {
          updatedMembers.push(user);
        }
        return { ...prev, members: updatedMembers };
      });
    };

    const handleUserLeft = ({ socketId, membersCount }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        const updatedMembers = (prev.members || []).filter((m) => m.socketId !== socketId);
        return { ...prev, members: updatedMembers };
      });
    };

    // Host transferred
    const handleHostChanged = ({ newHostId, newHostName }) => {
      setRoom((prev) => (prev ? { ...prev, hostId: newHostId, hostName: newHostName } : prev));
      if (currentUser && currentUser.socketId === newHostId) {
        setCurrentUser((prev) => ({ ...prev, isHost: true }));
      }
    };

    // Scener Virtual Remote transferred
    const handleRemoteTransferred = ({ controllerId, controllerName, passedBy }) => {
      setRoom((prev) => (prev ? { ...prev, remoteControllerId: controllerId, remoteControllerName: controllerName } : prev));
      setRemoteNotice(`🎮 Remote transferred to ${controllerName}!`);
      setTimeout(() => setRemoteNotice(null), 4000);
    };

    // Scener Virtual Remote requested by a participant
    const handleRemoteRequested = ({ requesterId, requesterName }) => {
      setRemoteNotice(`🙋 ${requesterName} requested the Virtual Remote!`);
      setTimeout(() => setRemoteNotice(null), 5000);
    };

    // Members list updated from server
    const handleMembersUpdated = ({ members }) => {
      setRoom((prev) => (prev ? { ...prev, members } : prev));
    };

    socket.on('room_settings_updated', handleSettingsUpdated);
    socket.on('media_changed', handleMediaChanged);
    socket.on('new_chat_message', handleNewChatMessage);
    socket.on('system_message', handleSystemMessage);
    socket.on('floating_reaction', handleFloatingReaction);
    socket.on('user_joined', handleUserJoined);
    socket.on('user_left', handleUserLeft);
    socket.on('members_updated', handleMembersUpdated);
    socket.on('host_changed', handleHostChanged);
    socket.on('remote_transferred', handleRemoteTransferred);
    socket.on('remote_requested', handleRemoteRequested);

    return () => {
      socket.off('room_settings_updated', handleSettingsUpdated);
      socket.off('media_changed', handleMediaChanged);
      socket.off('new_chat_message', handleNewChatMessage);
      socket.off('system_message', handleSystemMessage);
      socket.off('floating_reaction', handleFloatingReaction);
      socket.off('user_joined', handleUserJoined);
      socket.off('user_left', handleUserLeft);
      socket.off('members_updated', handleMembersUpdated);
      socket.off('host_changed', handleHostChanged);
      socket.off('remote_transferred', handleRemoteTransferred);
      socket.off('remote_requested', handleRemoteRequested);
    };
  }, [room?.id, currentUser]);

  // Send emoji reaction
  const handleSendReaction = (emoji) => {
    if (!room?.id) return;
    socket.emit('send_reaction', {
      roomId: room.id,
      emoji
    });
  };

  // Scener Virtual Remote: Pass remote to peer
  const handlePassRemote = (targetSocketId) => {
    if (!room?.id) return;
    socket.emit('pass_remote', {
      roomId: room.id,
      targetSocketId
    });
    setShowPassRemoteDropdown(false);
  };

  // Scener Virtual Remote: Request remote from controller
  const handleRequestRemote = () => {
    if (!room?.id) return;
    socket.emit('request_remote', { roomId: room.id });
  };

  // Request sync handler
  const handleRequestSync = () => {
    if (!room?.id) return;
    socket.emit('request_sync', { roomId: room.id });
  };

  // Quick Service Launcher in Theater dock
  const handleQuickLaunchPlatform = (serviceKey) => {
    const remoteControllerId = room?.remoteControllerId || room?.hostId;
    const holdsRemote = currentUser?.socketId === remoteControllerId || room?.settings?.controlMode === 'open';

    if (!holdsRemote) {
      alert(`Only the Virtual Remote holder can switch movies or services. Click "Request Remote" in the header to take control!`);
      return;
    }

    if (serviceKey === 'catalog') {
      setActiveSideTab('search');
      return;
    }

    if (serviceKey === '7reels') {
      socket.emit('media_change', {
        roomId: room.id,
        media: {
          id: '7reels-live',
          title: '7REELS — Free Movies, TV Shows & Anime',
          url: 'https://7reels.cc/',
          type: 'portal',
          platform: '7reels'
        }
      });
      return;
    }

    if (serviceKey === '1fmovies') {
      socket.emit('media_change', {
        roomId: room.id,
        media: {
          id: '1fmovies-live',
          title: '1Fmovies — Free HD Movies & Series',
          url: 'https://1fmovies.live/',
          type: 'portal',
          platform: '1fmovies'
        }
      });
      return;
    }

    if (serviceKey === 'netflix') {
      socket.emit('media_change', {
        roomId: room.id,
        media: {
          id: 'netflix-portal',
          title: 'Netflix Watch Together',
          url: 'https://www.netflix.com',
          type: 'portal',
          platform: 'netflix'
        }
      });
      return;
    }

    if (serviceKey === 'hotstar') {
      socket.emit('media_change', {
        roomId: room.id,
        media: {
          id: 'hotstar-portal',
          title: 'Disney+ Hotstar Watch Together',
          url: 'https://www.hotstar.com',
          type: 'portal',
          platform: 'hotstar'
        }
      });
      return;
    }

    if (serviceKey === 'prime') {
      socket.emit('media_change', {
        roomId: room.id,
        media: {
          id: 'prime-portal',
          title: 'Amazon Prime Video Watch Together',
          url: 'https://www.primevideo.com',
          type: 'portal',
          platform: 'prime'
        }
      });
      return;
    }

    if (serviceKey === 'youtube') {
      socket.emit('media_change', {
        roomId: room.id,
        media: {
          id: 'yt-cosmic',
          title: 'Space & Cosmos HD Cinematic',
          url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
          type: 'youtube',
          platform: 'youtube'
        }
      });
      return;
    }

    if (serviceKey === 'url') {
      setActiveSideTab('search');
    }
  };

  // Leave room
  const handleLeaveRoom = () => {
    if (window.confirm('Are you sure you want to leave this Scener watch party?')) {
      window.location.href = '/';
    }
  };

  // If not yet in a room, render Lobby
  if (!room) {
    return <Lobby onRoomJoined={handleRoomJoined} />;
  }

  const isHost = currentUser?.isHost;
  const remoteControllerId = room.remoteControllerId || room.hostId;
  const remoteControllerName = room.remoteControllerName || room.hostName || 'Host';
  const userHoldsRemote = currentUser?.socketId === remoteControllerId;

  const memberList = (room.members && room.members.length > 0)
    ? room.members
    : (currentUser ? [currentUser] : []);
  const otherMembers = memberList.filter((m) => m.socketId !== currentUser?.socketId);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#07090e] text-slate-100 overflow-hidden select-none font-sans">
      {/* Top Scener Navigation & Virtual Remote Bar */}
      <header className="h-14 bg-slate-950/95 border-b border-white/10 px-3 sm:px-6 flex items-center justify-between z-30 flex-shrink-0 shadow-lg">
        {/* Left: Scener Branding & Room Info */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 via-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Tv className="w-4 h-4 text-white" />
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="font-black text-sm tracking-widest text-white">
                SCENER
              </span>
              <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hidden sm:inline">
                THEATER
              </span>
            </div>
          </div>

          <div className="h-4 w-px bg-white/10 hidden sm:block" />

          {/* Room Title & Code */}
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-slate-200 truncate max-w-[110px] sm:max-w-xs">
              {room.title}
            </span>
            <button
              onClick={() => setShowInviteModal(true)}
              className="px-2 py-0.5 rounded-md bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-500/40 text-indigo-300 font-mono text-[10px] sm:text-[11px] font-bold tracking-wider cursor-pointer transition shadow"
              title="Click to view Room Code & Invite Link"
            >
              {room.id}
            </button>
          </div>
        </div>

        {/* Center: Scener Hallmark "The Virtual Remote" */}
        <div className="flex items-center space-x-2 relative">
          {userHoldsRemote ? (
            <div className="relative">
              <button
                onClick={() => setShowPassRemoteDropdown((prev) => !prev)}
                className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-emerald-600/30 via-indigo-600/30 to-purple-600/30 border border-emerald-500/50 hover:border-emerald-400 text-emerald-300 font-bold text-xs shadow-[0_0_15px_rgba(16,185,129,0.25)] transition active:scale-95 cursor-pointer"
                title="You control the theater! Click to pass the remote to a friend"
              >
                <Gamepad2 className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span className="hidden sm:inline">You Hold Remote</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 flex items-center space-x-1">
                  <span>Pass Remote ▾</span>
                </span>
              </button>

              {/* Pass Remote Dropdown Menu */}
              {showPassRemoteDropdown && (
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-52 bg-slate-900 border border-white/10 rounded-xl shadow-2xl py-1 z-50 backdrop-blur-xl animate-in fade-in zoom-in-95">
                  <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-slate-400 border-b border-white/5 flex items-center justify-between">
                    <span>Pass Remote To:</span>
                    <Gamepad2 className="w-3 h-3 text-indigo-400" />
                  </div>
                  {otherMembers.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-500 italic">No other friends in room</div>
                  ) : (
                    otherMembers.map((m) => (
                      <button
                        key={m.socketId}
                        onClick={() => handlePassRemote(m.socketId)}
                        className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-indigo-600 hover:text-white flex items-center justify-between transition cursor-pointer"
                      >
                        <div className="flex items-center space-x-2 min-w-0">
                          <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-indigo-300">
                            {m.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-semibold truncate">{m.name}</span>
                        </div>
                        <span className="text-[10px] text-indigo-300 group-hover:text-white font-bold">Pass 🎮</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-slate-900/90 border border-indigo-500/30 text-xs">
                <Gamepad2 className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-slate-300 text-xs truncate max-w-[120px] sm:max-w-none">
                  <strong className="text-white">{remoteControllerName}</strong> Holds Remote
                </span>
              </div>
              <button
                onClick={handleRequestRemote}
                className="px-2.5 py-1 rounded-full bg-indigo-600/30 hover:bg-indigo-600 border border-indigo-500/40 text-indigo-200 text-xs font-semibold flex items-center space-x-1 transition cursor-pointer active:scale-95 shadow"
                title="Ask the controller to pass you the remote"
              >
                <span>🙋 Request Remote</span>
              </button>
            </div>
          )}

          {/* Remote Notification Banner */}
          {remoteNotice && (
            <div className="absolute top-12 left-1/2 -translate-x-1/2 whitespace-nowrap bg-indigo-950/95 border border-indigo-500/50 text-indigo-200 text-xs font-bold px-3 py-1.5 rounded-full shadow-2xl z-50 animate-bounce">
              {remoteNotice}
            </div>
          )}
        </div>

        {/* Right: Actions & Tools */}
        <div className="flex items-center space-x-2">
          {/* Scener Popcorn Burst Button */}
          <button
            onClick={() => handleSendReaction('🍿')}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition cursor-pointer active:scale-95 shadow"
            title="Throw Popcorn across the theater screen!"
          >
            <span className="text-sm">🍿</span>
            <span className="hidden md:inline text-[11px]">Popcorn!</span>
          </button>

          {/* Invite Friend Button */}
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md cursor-pointer active:scale-95 transition"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Invite</span>
          </button>

          {/* Host Settings (Host only) */}
          {isHost && (
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/10 transition cursor-pointer"
              title="Room Settings (Host)"
            >
              <Settings className="w-4 h-4 text-amber-400" />
            </button>
          )}

          {/* Leave Room Button */}
          <button
            onClick={handleLeaveRoom}
            className="p-2 rounded-xl bg-slate-800 hover:bg-red-950/60 text-slate-400 hover:text-red-400 border border-white/10 transition cursor-pointer"
            title="Leave Watch Party"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Scener Virtual Theater Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Stage: Dominant Cinema Screen + Scener Quick Service Dock */}
        <div className="flex-1 flex flex-col p-3 sm:p-4 overflow-y-auto space-y-3 min-w-0">
          {/* Dominant Cinema Stage with Ambient Neon Glow */}
          <div className="flex-1 min-h-[380px] sm:min-h-[480px] w-full flex items-center justify-center rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(99,102,241,0.12)] border border-white/10 bg-black">
            <SyncedPlayer
              room={room}
              currentUser={currentUser}
              members={memberList}
              onRequestSync={handleRequestSync}
              reactions={reactions}
              isScreenSharing={isScreenSharing}
              localStream={localStream}
              remoteStreams={remoteStreams}
              isAudioMuted={isAudioMuted}
              isVideoMuted={isVideoMuted}
              onToggleAudio={toggleAudio}
              onToggleVideo={toggleVideo}
              onToggleScreenShare={toggleScreenShare}
            />
          </div>

          {/* Scener Quick Service Dock (1-Click Platform Switcher) */}
          <div className="flex items-center justify-between p-2 sm:p-2.5 bg-slate-950/90 rounded-2xl border border-white/10 backdrop-blur-md shadow-md gap-2 flex-wrap flex-shrink-0">
            <div className="flex items-center space-x-1.5 sm:space-x-2 overflow-x-auto py-0.5">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider pl-1 pr-1 hidden sm:inline">
                Services:
              </span>

              {/* 1. Search Catalog */}
              <button
                onClick={() => handleQuickLaunchPlatform('catalog')}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/40 text-xs font-semibold transition cursor-pointer active:scale-95 shadow"
                title="Search movies and series"
              >
                <Search className="w-3.5 h-3.5 text-indigo-400 group-hover:text-white" />
                <span>Catalog</span>
              </button>

              {/* 2. 1Fmovies */}
              <button
                onClick={() => handleQuickLaunchPlatform('7reels')}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 text-xs font-semibold transition cursor-pointer active:scale-95 shadow"
                title="Launch 7REELS Live Portal (Movies, Shows, Anime)"
              >
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                <span className="font-bold">7REELS</span>
              </button>

              <button
                onClick={() => handleQuickLaunchPlatform('1fmovies')}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 text-xs font-semibold transition cursor-pointer active:scale-95 shadow"
                title="Launch 1Fmovies Live Stream Portal"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-bold">1Fmovies</span>
              </button>

              {/* 3. Netflix */}
              <button
                onClick={() => handleQuickLaunchPlatform('netflix')}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 text-xs font-semibold transition cursor-pointer active:scale-95 shadow"
                title="Launch Netflix Watch Together"
              >
                <span className="font-black text-red-500">N</span>
                <span>Netflix</span>
              </button>

              {/* 4. Disney+ Hotstar */}
              <button
                onClick={() => handleQuickLaunchPlatform('hotstar')}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/40 text-xs font-semibold transition cursor-pointer active:scale-95 shadow"
                title="Launch Disney+ Hotstar Watch Together"
              >
                <span className="font-black text-blue-400">★</span>
                <span>Hotstar</span>
              </button>

              {/* 5. Amazon Prime */}
              <button
                onClick={() => handleQuickLaunchPlatform('prime')}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-sky-600/20 hover:bg-sky-600 text-sky-300 hover:text-white border border-sky-500/40 text-xs font-semibold transition cursor-pointer active:scale-95 shadow"
                title="Launch Amazon Prime Video Watch Together"
              >
                <span className="font-black text-sky-400">P</span>
                <span>Prime</span>
              </button>

              {/* 6. YouTube */}
              <button
                onClick={() => handleQuickLaunchPlatform('youtube')}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 text-xs font-semibold transition cursor-pointer active:scale-95 shadow"
                title="Launch YouTube Sync Player"
              >
                <Play className="w-3 h-3 text-rose-400 fill-current" />
                <span>YouTube</span>
              </button>
            </div>

            {/* Right side: Remote Status Badge in Dock */}
            <div className="flex items-center space-x-1.5 text-[11px] text-slate-400 pr-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>
                {userHoldsRemote ? '🎮 Remote in Hand' : `🎮 Controlled by ${remoteControllerName}`}
              </span>
            </div>
          </div>
        </div>

        {/* Sidebar Toggle Button (Collapse/Expand) */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 z-20 w-5 h-12 bg-slate-800 border-l border-y border-white/10 rounded-l-md items-center justify-center text-slate-400 hover:text-white cursor-pointer transition shadow-xl"
          style={{ right: isSidebarOpen ? '380px' : '0px' }}
          title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
        >
          {isSidebarOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        {/* Right Sidebar: Scener Virtual Lounge (Top) + Tabbed Chat/Search (Bottom) */}
        <aside
          className={`flex-shrink-0 bg-slate-900 border-l border-white/10 flex flex-col transition-all duration-300 z-20 ${
            isSidebarOpen ? 'w-full sm:w-[380px] lg:w-[400px]' : 'w-0 hidden'
          }`}
        >
          {/* Top Section: Scener Virtual Lounge (Webcams & Voice) */}
          {room.settings.allowVideoAudio && (
            <div className="flex-shrink-0">
              <VideoChatGrid
                currentUser={currentUser}
                room={room}
                members={memberList}
                localStream={localStream}
                remoteStreams={remoteStreams}
                isAudioMuted={isAudioMuted}
                isVideoMuted={isVideoMuted}
                isScreenSharing={isScreenSharing}
                mediaPermissionGranted={mediaPermissionGranted}
                onInitMedia={() => initLocalStream(true, true)}
                onToggleAudio={toggleAudio}
                onToggleVideo={toggleVideo}
                onToggleScreenShare={toggleScreenShare}
                onPassRemote={handlePassRemote}
                layout="sidebar"
              />
            </div>
          )}

          {/* Sidebar Tab Switcher: Chat & Popcorn vs Search & Catalog */}
          <div className="flex items-center border-b border-white/10 bg-slate-950 p-2">
            <button
              onClick={() => setActiveSideTab('chat')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition cursor-pointer ${
                activeSideTab === 'chat'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Chat & Popcorn</span>
            </button>

            <button
              onClick={() => setActiveSideTab('search')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition cursor-pointer ${
                activeSideTab === 'search'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search & Catalog</span>
            </button>
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-hidden">
            {activeSideTab === 'chat' ? (
              <TextChatPanel
                room={room}
                currentUser={currentUser}
                messages={messages}
                onSendReaction={handleSendReaction}
              />
            ) : (
              <SearchEngineTab
                room={room}
                currentUser={currentUser}
                onClose={() => setActiveSideTab('chat')}
                onStartTabBroadcast={(platformName) => toggleScreenShare()}
              />
            )}
          </div>
        </aside>
      </div>

      {/* Modals */}
      {showSettingsModal && (
        <HostSettingsModal
          room={room}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {showInviteModal && (
        <InviteModal
          room={room}
          onClose={() => setShowInviteModal(false)}
        />
      )}
    </div>
  );
}
