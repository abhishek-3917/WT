import React, { useState } from 'react';
import socket from '../../services/socket';
import { 
  Sliders, Shield, Users, MessageSquare, Video, 
  Check, X, Crown, Sparkles 
} from 'lucide-react';

export default function HostSettingsModal({ room, onClose }) {
  const [controlMode, setControlMode] = useState(room?.settings?.controlMode || 'host-only');
  const [syncStrictness, setSyncStrictness] = useState(room?.settings?.syncStrictness || 'smart');
  const [allowChat, setAllowChat] = useState(room?.settings?.allowChat !== false);
  const [allowVideoAudio, setAllowVideoAudio] = useState(room?.settings?.allowVideoAudio !== false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = () => {
    socket.emit('update_room_settings', {
      roomId: room.id,
      settings: {
        controlMode,
        syncStrictness,
        allowChat,
        allowVideoAudio
      }
    }, (res) => {
      if (res?.success) {
        setSavedSuccess(true);
        setTimeout(() => {
          setSavedSuccess(false);
          onClose();
        }, 800);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Host Room Options</h3>
              <p className="text-xs text-slate-400">Configure playback sync and permissions</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Settings Body */}
        <div className="p-5 space-y-5 text-sm text-slate-200">
          {/* Playback Control Permission */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
              Playback Control Mode
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setControlMode('host-only')}
                className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                  controlMode === 'host-only'
                    ? 'border-indigo-500 bg-indigo-950/40 text-white ring-1 ring-indigo-500/50'
                    : 'border-white/5 bg-slate-800/60 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center space-x-2 font-bold text-xs mb-1">
                  <Shield className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Host Only</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  Only host can play, pause, seek, and change movie.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setControlMode('open')}
                className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                  controlMode === 'open'
                    ? 'border-indigo-500 bg-indigo-950/40 text-white ring-1 ring-indigo-500/50'
                    : 'border-white/5 bg-slate-800/60 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center space-x-2 font-bold text-xs mb-1">
                  <Users className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Collaborative</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  All participants can control player and choose movies.
                </p>
              </button>
            </div>
          </div>

          {/* Sync Strictness */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
              Sync Calibration Tolerance
            </label>
            <div className="flex items-center space-x-2">
              {[
                { id: 'strict', label: 'Strict (0.8s)', desc: 'High accuracy' },
                { id: 'smart', label: 'Smart (1.5s)', desc: 'Balanced' },
                { id: 'loose', label: 'Relaxed (3.0s)', desc: 'Low bandwidth' }
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSyncStrictness(opt.id)}
                  className={`flex-1 p-2 rounded-xl border text-center transition cursor-pointer ${
                    syncStrictness === opt.id
                      ? 'border-indigo-500 bg-indigo-600/30 text-white font-bold'
                      : 'border-white/5 bg-slate-800/60 text-slate-400 hover:bg-slate-800 text-xs'
                  }`}
                >
                  <div className="text-xs">{opt.label}</div>
                  <div className="text-[9px] text-slate-400">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Feature Toggles */}
          <div className="space-y-3 pt-2 border-t border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <MessageSquare className="w-4 h-4 text-slate-400" />
                <div>
                  <div className="text-xs font-bold text-slate-200">Enable Text Chat</div>
                  <div className="text-[11px] text-slate-500">Allow participants to send messages</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={allowChat}
                onChange={(e) => setAllowChat(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-800 border-white/10"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Video className="w-4 h-4 text-slate-400" />
                <div>
                  <div className="text-xs font-bold text-slate-200">Enable Video & Voice Chat</div>
                  <div className="text-[11px] text-slate-500">Allow WebRTC live cams and microphones</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={allowVideoAudio}
                onChange={(e) => setAllowVideoAudio(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-800 border-white/10"
              />
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-white/10 bg-slate-950 flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 flex items-center space-x-1.5 active:scale-95 transition cursor-pointer"
          >
            {savedSuccess ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Saved!</span>
              </>
            ) : (
              <span>Apply Changes</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

