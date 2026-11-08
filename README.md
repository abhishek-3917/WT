# 🎬 CineSync — Watch Together Hub

A real-time, synchronized web application designed for watching movies, series, trailers, and YouTube streams together on two (or more) distant devices with live WebRTC video & voice calling, real-time text chat, host permissions, and an integrated media search engine.

---

## 🌟 Key Features

1. **Dual-Device Synchronized Playback Engine**:
   - **Play & Pause Mirroring**: Instant broadcast across connected viewers.
   - **Seek & Scrubbing Synchronization**: Debounced timeline scrubbing keeps devices aligned without loop glitches.
   - **Smart Drift Correction**: Detects timing offsets (>1.2s) and smoothly re-aligns without stutter.
   - **"Request Sync" Button**: Participants can snap their playback directly to the host's exact position at any moment with one click.
   - **Dual Media Engine**: Supports both HTML5 direct streams (MP4, WebM, HLS) and YouTube videos with unified controls.

2. **WebRTC Video & Voice Calling (P2P Mesh)**:
   - Live peer-to-peer audio and video calling between viewers.
   - Individual controls: Mic mute/unmute, Camera on/off, and Screen sharing.
   - Participant status badges, active speaker indicators, and device error fallbacks.

3. **Interactive Text Chat & Live Reactions**:
   - Real-time text messaging with user avatars and host badges.
   - Floating live emoji reactions (🍿, ❤️, 😂, 🔥, 😱, 👏) that bubble up across the theater screen.
   - System activity logs: notifies participants when someone joins, leaves, pauses, seeks, or changes the movie.

4. **Integrated Media Search Engine Tab**:
   - **Curated Movie Library**: High-definition open movies, animated shorts, sci-fi thrillers, and classics (*Big Buck Bunny*, *Tears of Steel*, *Sintel*, *Night of the Living Dead*, *Charade*, etc.).
   - **Search & Filter**: Search by title, keyword, year, or filter by category (Animation, Sci-Fi, Horror, YouTube, Vintage Classics).
   - **Stream Any URL**: Paste any YouTube link (e.g. `https://youtube.com/watch?v=...`) or direct MP4/WebM/HLS URL.
   - **Live Mirroring**: When the host picks a movie from the search engine, it immediately updates and mirrors on all participant screens live.

5. **Host Room Controls & Permissions**:
   - **Room Code & Share Link**: Instant 1-click invite link generation (e.g., `http://localhost:3000/?room=ROOM-ABCD`).
   - **Control Modes**:
     - *Host Only*: Only the room creator can play, pause, seek, and change movies.
     - *Collaborative*: Any participant can pause/play and choose movies.
   - **Sync Calibration**: Select between Strict, Smart, or Loose tolerance.
   - **Feature Toggles**: Enable/disable text chat or video/voice per room.

---

## 🚀 Quick Start Guide

### 1. Install Dependencies
```bash
# If not already installed:
npm install
cd server && npm install
cd ../client && npm install
```

### 2. Run the Application
From the root folder:
```bash
npm run dev
```
- **Frontend**: `http://localhost:3000`
- **Backend API & WebSockets**: `http://localhost:5000`

*(Alternatively, to run the production build on a single port: `npm run build && npm start`, then visit `http://localhost:5000`)*

---

## 👥 How to Test Synchronized Playback (2 Distant Devices or 2 Tabs)

1. Open **Browser 1** (e.g. Chrome) and visit `http://localhost:3000`.
2. Under **"Create Party (Host)"**, enter your name (e.g. `Host`) and click **"Create Room & Enter Theater"**.
3. Click the **"Invite Partner"** button in the top navigation bar to copy the room code or link.
4. Open **Browser 2** (e.g. Chrome Incognito or Edge) and visit the copied link (or visit `http://localhost:3000`, select **"Join Room"**, and enter the Room Code).
5. Enter a participant name (e.g. `Partner`) and click **"Join Room & Sync Live"**.
6. **Watch in live sync!**
   - Click Play or Pause on the Host screen -> observe it immediately pause/play on the Partner screen.
   - Scrub the timeline -> observe both screens seek together.
   - In the sidebar, switch to the **Search Engine Tab**, type a search query (or select *Tears of Steel* / *Sintel* / paste a YouTube link), and click **"Play in Room"** -> notice the new movie starts on both screens live!
   - Send chat messages or click the popcorn 🍿 reaction button to see floating animations over the video!

