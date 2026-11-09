const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Ensure files exist
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2), 'utf8');
}

if (!fs.existsSync(CHATS_FILE)) {
  fs.writeFileSync(CHATS_FILE, JSON.stringify({}, null, 2), 'utf8');
}

// Helper for safe JSON reading
function readJson(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content || 'null') || defaultValue;
  } catch (err) {
    console.error(`[Storage Read Error] ${filePath}:`, err.message);
    return defaultValue;
  }
}

// Helper for safe JSON writing
function writeJson(filePath, data) {
  try {
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (err) {
    console.error(`[Storage Write Error] ${filePath}:`, err.message);
    return false;
  }
}

// ==========================================
// USER ACCOUNTS & AUTHENTICATION
// ==========================================

function getAllUsers() {
  return readJson(USERS_FILE, []);
}

function findUserByUsername(username) {
  if (!username) return null;
  const users = getAllUsers();
  return users.find(u => u.username.toLowerCase() === username.trim().toLowerCase()) || null;
}

function findUserById(id) {
  if (!id) return null;
  const users = getAllUsers();
  return users.find(u => u.id === id) || null;
}

// Password validation: alphanumeric + "@" allowed only, min length 4
const PASSWORD_REGEX = /^[a-zA-Z0-9@]+$/;

function validateCredentials(username, password) {
  const cleanUsername = (username || '').trim();
  if (!cleanUsername || cleanUsername.length < 3 || cleanUsername.length > 30) {
    return { valid: false, error: 'Username must be between 3 and 30 characters.' };
  }

  // Check username format (alphanumeric, underscore, dash)
  if (!/^[a-zA-Z0-9_.-]+$/.test(cleanUsername)) {
    return { valid: false, error: 'Username can only contain letters, numbers, underscores, and dashes.' };
  }

  if (!password || password.length < 4) {
    return { valid: false, error: 'Password must be at least 4 characters long.' };
  }

  if (!PASSWORD_REGEX.test(password)) {
    return { valid: false, error: 'Password can only contain letters, numbers, and the "@" symbol.' };
  }

  return { valid: true, cleanUsername };
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

function createUser(username, password) {
  const validation = validateCredentials(username, password);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const users = getAllUsers();
  const existing = users.find(u => u.username.toLowerCase() === validation.cleanUsername.toLowerCase());
  if (existing) {
    throw new Error('Username is already taken. Please choose a different one.');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  const userId = `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  const newUser = {
    id: userId,
    username: validation.cleanUsername,
    salt,
    hash,
    createdAt: new Date().toISOString(),
    watchHistory: []
  };

  users.push(newUser);
  writeJson(USERS_FILE, users);

  return sanitizeUser(newUser);
}

function authenticateUser(username, password) {
  const cleanUsername = (username || '').trim();
  if (!cleanUsername || !password) {
    throw new Error('Username and password are required.');
  }

  const user = findUserByUsername(cleanUsername);
  if (!user) {
    throw new Error('Invalid username or password.');
  }

  const computedHash = hashPassword(password, user.salt);
  if (computedHash !== user.hash) {
    throw new Error('Invalid username or password.');
  }

  return sanitizeUser(user);
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
    watchHistory: user.watchHistory || []
  };
}

// Lightweight session tokens
const SESSIONS = new Map();

function createSessionToken(user) {
  const token = `tok_${crypto.randomBytes(24).toString('hex')}`;
  SESSIONS.set(token, {
    userId: user.id,
    username: user.username,
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
  });
  return token;
}

function getUserFromToken(token) {
  if (!token) return null;
  const session = SESSIONS.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    SESSIONS.delete(token);
    return null;
  }
  const user = findUserById(session.userId);
  return sanitizeUser(user);
}

// ==========================================
// WATCH HISTORY
// ==========================================

function addWatchHistory(userIdOrUsername, item) {
  if (!item || !item.title) return [];
  const users = getAllUsers();
  const user = users.find(u => 
    u.id === userIdOrUsername || 
    u.username.toLowerCase() === String(userIdOrUsername).toLowerCase()
  );

  if (!user) return [];

  if (!Array.isArray(user.watchHistory)) {
    user.watchHistory = [];
  }

  // Deduplicate: If same movie or same TV episode exists, remove previous entry
  user.watchHistory = user.watchHistory.filter(h => {
    if (item.isTv) {
      return !(h.tmdbId === item.tmdbId && h.season === item.season && h.episode === item.episode);
    }
    return !(h.tmdbId && item.tmdbId ? h.tmdbId === item.tmdbId : h.title.toLowerCase() === item.title.toLowerCase());
  });

  const historyEntry = {
    id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    title: item.title,
    tmdbId: item.tmdbId || null,
    isTv: Boolean(item.isTv),
    season: item.season || null,
    episode: item.episode || null,
    episodeTitle: item.episodeTitle || null,
    thumbnail: item.thumbnail || item.backdrop || null,
    url: item.url || '',
    source: item.source || 'CineSync',
    type: item.type || 'hls',
    watchedAt: Date.now()
  };

  // Prepend to top of history
  user.watchHistory.unshift(historyEntry);

  // Keep top 60 recent items
  if (user.watchHistory.length > 60) {
    user.watchHistory = user.watchHistory.slice(0, 60);
  }

  writeJson(USERS_FILE, users);
  return user.watchHistory;
}

function getWatchHistory(userIdOrUsername) {
  const user = findUserById(userIdOrUsername) || findUserByUsername(userIdOrUsername);
  return user?.watchHistory || [];
}

function removeWatchHistoryItem(userIdOrUsername, historyId) {
  const users = getAllUsers();
  const user = users.find(u => 
    u.id === userIdOrUsername || 
    u.username.toLowerCase() === String(userIdOrUsername).toLowerCase()
  );

  if (!user) return [];

  if (historyId) {
    user.watchHistory = (user.watchHistory || []).filter(h => h.id !== historyId);
  } else {
    user.watchHistory = [];
  }

  writeJson(USERS_FILE, users);
  return user.watchHistory;
}

// ==========================================
// CHAT HISTORY
// ==========================================

function getRoomChat(roomId) {
  if (!roomId) return [];
  const chats = readJson(CHATS_FILE, {});
  return chats[roomId.toUpperCase()] || [];
}

function saveRoomMessage(roomId, message) {
  if (!roomId || !message) return [];
  const normalizedId = roomId.toUpperCase();
  const chats = readJson(CHATS_FILE, {});
  
  if (!Array.isArray(chats[normalizedId])) {
    chats[normalizedId] = [];
  }

  chats[normalizedId].push(message);

  // Keep up to 300 messages per room to prevent unbounded file growth
  if (chats[normalizedId].length > 300) {
    chats[normalizedId] = chats[normalizedId].slice(-300);
  }

  writeJson(CHATS_FILE, chats);
  return chats[normalizedId];
}

module.exports = {
  createUser,
  authenticateUser,
  sanitizeUser,
  createSessionToken,
  getUserFromToken,
  findUserByUsername,
  findUserById,
  addWatchHistory,
  getWatchHistory,
  removeWatchHistoryItem,
  getRoomChat,
  saveRoomMessage
};

