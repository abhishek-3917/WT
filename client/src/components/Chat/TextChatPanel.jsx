import React, { useState, useEffect, useRef } from 'react';
import socket from '../../services/socket';
import { 
  Send, MessageSquare, Crown, Sparkles, Smile, 
  Info, BellRing, AlertCircle, Gamepad2
} from 'lucide-react';

export default function TextChatPanel({ 
  room, 
  currentUser, 
  messages = [], 
  onSendReaction 
}) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);

  const isChatAllowed = room?.settings?.allowChat !== false;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    if (!isChatAllowed) return;

    socket.emit('send_chat_message', {
      roomId: room.id,
      text: inputText
    });

    setInputText('');
  };

  // Scener signature reaction emojis (Popcorn #1)
  const scenerReactions = [
    { emoji: '🍿', label: 'Popcorn' },
    { emoji: '❤️', label: 'Love' },
    { emoji: '🔥', label: 'Fire' },
    { emoji: '😂', label: 'Laugh' },
    { emoji: '😭', label: 'Cry' },
    { emoji: '👏', label: 'Clap' },
    { emoji: '😮', label: 'Shock' },
    { emoji: '💯', label: '100' }
  ];

  const remoteControllerId = room?.remoteControllerId || room?.hostId;

  return (
    <div className="flex flex-col h-full bg-slate-900/95 border-l border-white/10 text-slate-100 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-slate-950/60">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white tracking-wide">Theater Chat & Activity</h3>
            <p className="text-[10px] text-slate-400">{room?.members?.length || 1} watching now</p>
          </div>
        </div>

        {/* Quick Popcorn burst trigger */}
        <button
          onClick={() => onSendReaction && onSendReaction('🍿')}
          className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 text-xs font-bold transition active:scale-95 cursor-pointer"
          title="Send Popcorn Burst to Theater"
        >
          <span>🍿</span>
          <span className="text-[10px]">Popcorn</span>
        </button>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
            <span className="text-3xl animate-bounce">🍿</span>
            <p className="text-xs font-semibold text-slate-300">Welcome to the Theater!</p>
            <p className="text-[11px] text-slate-500">React with popcorn 🍿 or chat while watching together in sync.</p>
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.isSystem) {
              const isRemoteTransfer = msg.type === 'remote_transfer' || msg.text?.includes('Remote');
              return (
                <div key={msg.id} className="flex items-center justify-center my-2 text-[11px]">
                  <span className={`px-3 py-1 rounded-full flex items-center space-x-1.5 shadow-sm text-center ${
                    isRemoteTransfer 
                      ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-500/40 font-bold animate-pulse'
                      : 'bg-slate-800/80 text-slate-300 border border-white/5 font-medium'
                  }`}>
                    {isRemoteTransfer ? <Gamepad2 className="w-3 h-3 text-indigo-400" /> : <Info className="w-3 h-3 text-slate-400" />}
                    <span>{msg.text}</span>
                  </span>
                </div>
              );
            }

            const isMe = msg.senderId === socket.id;
            const isSenderRemote = msg.senderId === remoteControllerId;

            return (
              <div 
                key={msg.id} 
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1`}
              >
                <div className="flex items-center space-x-1.5 text-[10px] text-slate-400 px-1">
                  {msg.isHost && <Crown className="w-2.5 h-2.5 text-amber-400" />}
                  {isSenderRemote && <Gamepad2 className="w-2.5 h-2.5 text-indigo-400" />}
                  <span className="font-semibold text-slate-300">{msg.senderName}</span>
                  <span>•</span>
                  <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                <div 
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed break-words shadow-sm ${
                    isMe 
                      ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-tr-none' 
                      : 'bg-slate-800 text-slate-200 border border-white/5 rounded-tl-none'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Scener Popcorn & Floating Emoji Dock */}
      <div className="px-3 py-1.5 border-t border-white/5 bg-slate-950/60 flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-wider font-bold text-slate-500 flex items-center space-x-1">
          <Sparkles className="w-2.5 h-2.5 text-amber-400" />
          <span>Theater Reactions</span>
        </span>
        <div className="flex items-center space-x-1">
          {scenerReactions.map((item) => (
            <button
              key={item.emoji}
              onClick={() => onSendReaction && onSendReaction(item.emoji)}
              className="text-base p-1 rounded-lg hover:bg-slate-800 hover:scale-125 active:scale-95 transition-transform cursor-pointer"
              title={`Send ${item.label} (${item.emoji})`}
            >
              {item.emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Message Input Form */}
      <div className="p-3 border-t border-white/10 bg-slate-950/90">
        {!isChatAllowed ? (
          <div className="text-xs text-amber-400/80 bg-amber-950/30 p-2.5 rounded-xl border border-amber-800/30 text-center flex items-center justify-center space-x-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Chat is currently disabled by the host.</span>
          </div>
        ) : (
          <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Chat with your watch party..."
              className="flex-1 bg-slate-800/90 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                inputText.trim() 
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg active:scale-90' 
                  : 'bg-slate-800 text-slate-600 cursor-not-allowed'
              }`}
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

