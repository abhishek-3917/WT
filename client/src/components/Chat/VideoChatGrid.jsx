import React, { useEffect, useRef, useState } from 'react';
import { 
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, 
  User, Crown, PhoneCall, Volume2, ChevronDown, ChevronUp,
  Sliders, Sparkles, Gamepad2
} from 'lucide-react';

function RemoteVideoTile({ peerSocketId, streamData, volume = 1, isRemoteHolder = false, onPassRemote = null, canPass = false }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && streamData?.stream) {
      videoRef.current.srcObject = streamData.stream;
      videoRef.current.volume = volume;
    }
  }, [streamData?.stream, volume]);

  const hasVideo = streamData?.stream?.getVideoTracks?.().some(t => t.enabled) ?? true;
  const hasAudio = streamData?.stream?.getAudioTracks?.().some(t => t.enabled) ?? true;

  return (
    <div className={`relative aspect-video bg-slate-950 rounded-xl overflow-hidden border shadow-lg group transition-all duration-300 ${
      hasAudio ? 'ring-2 ring-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.25)] border-emerald-500/40' : 'border-white/10'
    }`}>
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400">
          <div className="w-10 h-10 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-base font-bold text-indigo-400">
            {streamData?.user?.name?.charAt(0)?.toUpperCase() || 'P'}
          </div>
          <span className="text-[10px] mt-1 text-slate-400 font-medium">Camera Off</span>
        </div>
      )}

      {/* User overlay badge */}
      <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between pointer-events-none">
        <span className="bg-black/75 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-semibold text-white truncate max-w-[110px] flex items-center space-x-1">
          {streamData?.user?.isHost && <Crown className="w-2.5 h-2.5 text-amber-400" />}
          {isRemoteHolder && <Gamepad2 className="w-2.5 h-2.5 text-indigo-400" />}
          <span>{streamData?.user?.name || 'Friend'}</span>
        </span>

        <span className={`p-1 rounded text-[10px] backdrop-blur-md ${hasAudio ? 'bg-black/60 text-emerald-400' : 'bg-red-500/80 text-white'}`}>
          {hasAudio ? <Mic className="w-2.5 h-2.5" /> : <MicOff className="w-2.5 h-2.5" />}
        </span>
      </div>

      {/* Pass Remote Hover Action */}
      {canPass && !isRemoteHolder && onPassRemote && (
        <button
          onClick={() => onPassRemote(peerSocketId)}
          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 bg-indigo-600/90 hover:bg-indigo-600 text-white text-[9px] font-bold px-2 py-0.5 rounded shadow cursor-pointer transition flex items-center space-x-1"
          title="Pass the Virtual Remote to this friend"
        >
          <Gamepad2 className="w-2.5 h-2.5" />
          <span>Pass Remote</span>
        </button>
      )}
    </div>
  );
}

export default function VideoChatGrid({
  currentUser,
  room,
  members = [],
  localStream,
  remoteStreams = {},
  isAudioMuted,
  isVideoMuted,
  isScreenSharing,
  mediaPermissionGranted,
  onInitMedia,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onPassRemote,
  layout = "sidebar" // "sidebar" | "bottom"
}) {
  const localVideoRef = useRef(null);
  const [voiceVolume, setVoiceVolume] = useState(1);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Consolidate member list from props and room
  const memberList = (members && members.length > 0)
    ? members
    : (room?.members && room.members.length > 0)
      ? room.members
      : (currentUser ? [currentUser] : []);

  const otherMembers = memberList.filter(m => m.socketId !== currentUser?.socketId);
  const remoteStreamEntries = Object.entries(remoteStreams);
  const onlineCount = Math.max(memberList.length, remoteStreamEntries.length + 1, 1);

  const remoteControllerId = room?.remoteControllerId || room?.hostId;
  const iHoldRemote = currentUser?.socketId === remoteControllerId || room?.settings?.controlMode === 'open';

  return (
    <div className="flex flex-col bg-slate-900/95 border-b border-white/10 p-3 space-y-2.5">
      {/* Header / Status Bar */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-bold text-white text-xs tracking-wide">Scener Party Lounge</span>
          <span className="text-emerald-400 font-mono text-[10px] font-bold">({onlineCount} online)</span>
        </div>

        <div className="flex items-center space-x-2">
          {/* Voice Chat Volume Balance */}
          <div className="flex items-center space-x-1 bg-slate-950 px-1.5 py-0.5 rounded border border-white/5">
            <Volume2 className="w-3 h-3 text-indigo-400" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={voiceVolume}
              onChange={(e) => setVoiceVolume(parseFloat(e.target.value))}
              className="w-12 h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-indigo-400"
              title="Voice Chat Volume"
            />
          </div>

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            title={isCollapsed ? "Expand Video Tiles" : "Collapse Video Tiles"}
          >
            {isCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Video Tiles Grid (Collapsible) */}
      {!isCollapsed && (
        <div className="grid grid-cols-2 gap-2">
          {/* Local User Preview Tile */}
          <div className={`relative aspect-video bg-slate-950 rounded-xl overflow-hidden border shadow-lg transition-all duration-300 ${
            !isAudioMuted && localStream ? 'ring-2 ring-emerald-500/50 border-emerald-500/40' : 'border-indigo-500/30'
          }`}>
            {localStream && !isVideoMuted ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted // Always mute local preview to avoid feedback loop
                className="w-full h-full object-cover transform -scale-x-100"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900/90 text-slate-400">
                <div className="w-9 h-9 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-sm font-bold text-indigo-300">
                  {currentUser?.name?.charAt(0)?.toUpperCase() || 'Y'}
                </div>
                <span className="text-[9px] mt-1 text-slate-400 font-medium">
                  {isVideoMuted ? 'Camera Off' : 'No Camera'}
                </span>
              </div>
            )}

            <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between pointer-events-none">
              <span className="bg-black/75 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-semibold text-white truncate max-w-[100px] flex items-center space-x-1">
                {currentUser?.isHost && <Crown className="w-2.5 h-2.5 text-amber-400" />}
                {iHoldRemote && <Gamepad2 className="w-2.5 h-2.5 text-indigo-400" />}
                <span>You</span>
              </span>

              <span className={`p-1 rounded text-[9px] backdrop-blur-md ${isAudioMuted ? 'bg-red-500/80 text-white' : 'bg-black/60 text-emerald-400'}`}>
                {isAudioMuted ? <MicOff className="w-2.5 h-2.5" /> : <Mic className="w-2.5 h-2.5" />}
              </span>
            </div>
          </div>

          {/* Render All Other Members in Room */}
          {otherMembers.length > 0 ? (
            otherMembers.map((m) => {
              const streamData = remoteStreams[m.socketId];
              const isMemberRemoteHolder = m.socketId === remoteControllerId;

              if (streamData) {
                return (
                  <RemoteVideoTile
                    key={m.socketId}
                    peerSocketId={m.socketId}
                    streamData={streamData}
                    volume={voiceVolume}
                    isRemoteHolder={isMemberRemoteHolder}
                    onPassRemote={onPassRemote}
                    canPass={iHoldRemote}
                  />
                );
              }

              // Connected participant tile when camera/stream isn't started yet
              return (
                <div 
                  key={m.socketId || m.name}
                  className="relative aspect-video bg-slate-950 rounded-xl overflow-hidden border border-white/10 shadow-lg flex flex-col items-center justify-center p-2 text-center group"
                >
                  <div className="w-9 h-9 rounded-full bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-sm font-bold text-indigo-300 shadow-inner">
                    {m.name?.charAt(0)?.toUpperCase() || 'P'}
                  </div>
                  <span className="text-[10px] font-semibold text-slate-200 mt-1 flex items-center space-x-1 truncate max-w-[100px]">
                    {m.isHost && <Crown className="w-2.5 h-2.5 text-amber-400" />}
                    {isMemberRemoteHolder && <Gamepad2 className="w-2.5 h-2.5 text-indigo-400" />}
                    <span>{m.name || 'Friend'}</span>
                  </span>
                  <span className="text-[8px] text-emerald-400 font-medium">
                    Connected
                  </span>

                  {iHoldRemote && !isMemberRemoteHolder && onPassRemote && (
                    <button
                      onClick={() => onPassRemote(m.socketId)}
                      className="absolute inset-0 bg-indigo-950/90 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 flex items-center justify-center space-x-1 transition cursor-pointer"
                    >
                      <Gamepad2 className="w-3 h-3 text-indigo-400" />
                      <span>Pass Remote</span>
                    </button>
                  )}
                </div>
              );
            })
          ) : remoteStreamEntries.length > 0 ? (
            remoteStreamEntries.map(([socketId, streamData]) => (
              <RemoteVideoTile
                key={socketId}
                peerSocketId={socketId}
                streamData={streamData}
                volume={voiceVolume}
                isRemoteHolder={socketId === remoteControllerId}
                onPassRemote={onPassRemote}
                canPass={iHoldRemote}
              />
            ))
          ) : (
            /* Waiting for partner tile if alone in the room */
            <div className="aspect-video bg-slate-950/60 border border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center text-center p-2 text-slate-500">
              <User className="w-5 h-5 mb-1 opacity-40 text-indigo-400" />
              <span className="text-[10px] font-medium text-slate-400">Waiting for friend</span>
              <span className="text-[8px] text-slate-500">Share room code</span>
            </div>
          )}
        </div>
      )}

      {/* In-Call Controls Toolbar */}
      <div className="flex items-center justify-between pt-1 border-t border-white/5">
        <div className="flex items-center space-x-1.5">
          <button
            onClick={onToggleAudio}
            className={`p-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1 ${
              isAudioMuted
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-white/10'
            }`}
            title={isAudioMuted ? "Unmute Mic" : "Mute Mic"}
          >
            {isAudioMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-emerald-400" />}
            <span className="text-[10px]">{isAudioMuted ? 'Muted' : 'Mic'}</span>
          </button>

          <button
            onClick={onToggleVideo}
            className={`p-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1 ${
              isVideoMuted
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-white/10'
            }`}
            title={isVideoMuted ? "Turn Video On" : "Turn Video Off"}
          >
            {isVideoMuted ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5 text-indigo-400" />}
            <span className="text-[10px]">{isVideoMuted ? 'Cam Off' : 'Cam'}</span>
          </button>
        </div>

        {!mediaPermissionGranted && (
          <button
            onClick={onInitMedia}
            className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold cursor-pointer shadow transition"
          >
            <PhoneCall className="w-2.5 h-2.5" />
            <span>Join Cam</span>
          </button>
        )}

        <button
          onClick={onToggleScreenShare}
          className={`p-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1 ${
            isScreenSharing
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-white/10'
          }`}
          title={isScreenSharing ? "Stop Screen Share" : "Share Tab with Audio"}
        >
          {isScreenSharing ? <MonitorOff className="w-3.5 h-3.5 text-red-400" /> : <Monitor className="w-3.5 h-3.5 text-cyan-400" />}
          <span className="text-[10px]">{isScreenSharing ? 'Sharing' : 'Share Tab'}</span>
        </button>
      </div>
    </div>
  );
}
