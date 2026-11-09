import React, { useState } from 'react';
import { 
  X, User, Lock, Eye, EyeOff, LogIn, UserPlus, 
  Check, AlertCircle, Sparkles, LogOut, Film, Trash2, Clock 
} from 'lucide-react';

export default function AuthModal({ 
  isOpen, 
  onClose, 
  currentUser, 
  onAuthSuccess, 
  onSignOut,
  watchHistory = [],
  onPlayHistoryItem
}) {
  const [mode, setMode] = useState(currentUser ? 'profile' : 'signin'); // 'signin' | 'signup' | 'profile'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  // Password constraint check: alphanumeric with @ allowed only
  const PASSWORD_REGEX = /^[a-zA-Z0-9@]+$/;

  const validateInputs = () => {
    const cleanUsername = username.trim();
    if (!cleanUsername || cleanUsername.length < 3) {
      setError('Username must be at least 3 characters.');
      return false;
    }
    if (!password || password.length < 4) {
      setError('Password must be at least 4 characters long.');
      return false;
    }
    if (!PASSWORD_REGEX.test(password)) {
      setError('Password can only contain letters, numbers, and the "@" symbol.');
      return false;
    }
    return true;
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to sign in. Please check your credentials.');
      }

      localStorage.setItem('cinesync_token', data.token);
      localStorage.setItem('cinesync_user', JSON.stringify(data.user));

      setSuccessMsg(`Welcome back, ${data.user.username}!`);
      setTimeout(() => {
        onAuthSuccess(data.user);
        onClose();
      }, 700);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!validateInputs()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create account. Username may be taken.');
      }

      localStorage.setItem('cinesync_token', data.token);
      localStorage.setItem('cinesync_user', JSON.stringify(data.user));

      setSuccessMsg(`Account created! Welcome, ${data.user.username}!`);
      setTimeout(() => {
        onAuthSuccess(data.user);
        onClose();
      }, 700);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('cinesync_token');
    localStorage.removeItem('cinesync_user');
    onSignOut();
    setMode('signin');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div 
        className="w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                {currentUser ? 'User Account' : mode === 'signup' ? 'Create New Account' : 'Sign In to CineSync'}
              </h3>
              <p className="text-[10px] text-slate-400">
                {currentUser ? `Signed in as @${currentUser.username}` : 'Sync watch history and keep your chat identity'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/40 text-red-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800/40 text-emerald-300 text-xs flex items-center space-x-2">
              <Check className="w-4 h-4 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Profile View (When Signed In) */}
          {currentUser ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950/80 border border-white/5 space-y-2 text-center">
                <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl font-black shadow-lg">
                  {currentUser.username?.[0]?.toUpperCase() || 'U'}
                </div>
                <div className="font-bold text-base text-white">@{currentUser.username}</div>
                <div className="text-xs text-slate-400">
                  Member since {new Date(currentUser.createdAt || Date.now()).toLocaleDateString()}
                </div>
              </div>

              {/* Watch History Quick Summary */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span className="flex items-center space-x-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Recent Watch History</span>
                  </span>
                  <span className="text-[10px] text-slate-500">{watchHistory.length} items</span>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {watchHistory.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-950/40 text-center text-xs text-slate-500">
                      No movies watched yet. Watch a movie or series to see it here!
                    </div>
                  ) : (
                    watchHistory.slice(0, 5).map((item) => (
                      <div 
                        key={item.id}
                        className="p-2 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between text-xs hover:border-white/20 transition"
                      >
                        <div className="flex items-center space-x-2 truncate min-w-0">
                          {item.thumbnail ? (
                            <img src={item.thumbnail} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                          ) : (
                            <Film className="w-6 h-6 text-indigo-400 flex-shrink-0" />
                          )}
                          <div className="truncate">
                            <div className="font-semibold text-white truncate">{item.title}</div>
                            {item.isTv && item.season && item.episode && (
                              <div className="text-[10px] text-indigo-300">S{item.season}:E{item.episode}</div>
                            )}
                          </div>
                        </div>

                        {onPlayHistoryItem && (
                          <button
                            onClick={() => {
                              onPlayHistoryItem(item);
                              onClose();
                            }}
                            className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold cursor-pointer transition active:scale-95 flex-shrink-0"
                          >
                            Play
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-red-950/40 text-slate-300 hover:text-red-400 border border-white/10 hover:border-red-800/40 text-xs font-semibold flex items-center justify-center space-x-2 transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            /* Sign In / Sign Up Forms */
            <div className="space-y-4">
              {/* Tab Switcher */}
              <div className="flex bg-slate-950 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => { setMode('signin'); setError(''); }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    mode === 'signin' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('signup'); setError(''); }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    mode === 'signup' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Create Account
                </button>
              </div>

              <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp} className="space-y-3.5">
                {/* Username */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Username {mode === 'signup' && <span className="text-indigo-400 text-[10px] lowercase font-normal">(unique)</span>}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. Abhi"
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 pl-9"
                    />
                    <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Password
                    </label>
                    {mode === 'signup' && (
                      <span className="text-[10px] text-slate-400">Letters, numbers & '@' only</span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="e.g. Secret123@"
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 pl-9 pr-9"
                    />
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <button
                      type="button"
                      onClick={() => setShowPassword(p => !p)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {mode === 'signup' && (
                  <div className="p-2.5 rounded-xl bg-indigo-950/30 border border-indigo-500/20 text-[11px] text-indigo-300 space-y-1">
                    <div className="font-semibold flex items-center space-x-1">
                      <Sparkles className="w-3 h-3 text-indigo-400" />
                      <span>Account Requirements:</span>
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-slate-400 text-[10px]">
                      <li>Unique username (case-insensitive)</li>
                      <li>Password: Alphanumeric characters with '@' allowed</li>
                    </ul>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-2 cursor-pointer active:scale-95 transition"
                >
                  {mode === 'signin' ? (
                    <>
                      <LogIn className="w-3.5 h-3.5" />
                      <span>{loading ? 'Signing in...' : 'Sign In'}</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{loading ? 'Creating account...' : 'Create Account'}</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
