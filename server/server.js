const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const { CURATED_MOVIES } = require('./moviesData');
const storage = require('./storage');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Serve static frontend build if available
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 5000;

// In-memory room store
// rooms[roomId] = { id, title, hostId, hostName, settings, media, members: {} }
const rooms = new Map();

// Helper to generate a room code (e.g., CINEMA-4821)
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `ROOM-${code}`;
}

// Asset proxy route to prevent CORS and MIME issues for embedded apps like 1Fmovies
app.all('/assets/*', async (req, res) => {
  let domain = 'https://1fmovies.live';
  if (req.headers.referer) {
    try {
      const u = new URL(req.headers.referer);
      const paramUrl = u.searchParams.get('url');
      if (paramUrl) domain = new URL(paramUrl).origin;
      else if (req.headers.referer.includes('7reels.cc')) domain = 'https://7reels.cc';
    } catch(e) {}
  }
  const target = domain + req.originalUrl;
  try {
    const r = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*'
      }
    });
    const urlPath = req.path || '';
    if (urlPath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    } else if (urlPath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    } else {
      res.setHeader('Content-Type', r.headers.get('content-type') || 'application/javascript');
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    const buf = await r.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch(e) {
    res.status(404).send(e.message);
  }
});

// Dynamic API forwarder for embedded web apps like 7reels when they call relative /api/*
app.use('/api', async (req, res, next) => {
  const knownPrefixes = ['/health', '/search', '/resolve-stream', '/rooms', '/stream-proxy', '/tv-details', '/tv-season', '/auth', '/user'];
  if (knownPrefixes.some(p => req.path.startsWith(p))) {
    return next();
  }

  let targetDomain = null;
  if (req.headers.referer) {
    try {
      const u = new URL(req.headers.referer);
      const paramUrl = u.searchParams.get('url');
      if (paramUrl && paramUrl.includes('7reels.cc')) targetDomain = 'https://7reels.cc';
      else if (req.headers.referer.includes('7reels.cc')) targetDomain = 'https://7reels.cc';
      else if (paramUrl && paramUrl.includes('1fmovies.live')) targetDomain = 'https://1fmovies.live';
    } catch(e) {}
  }

  if (!targetDomain) return next();

  try {
    const upstreamUrl = targetDomain + req.originalUrl;
    const r = await fetch(upstreamUrl, {
      method: req.method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    });
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const buf = await r.arrayBuffer();
    return res.status(r.status).send(Buffer.from(buf));
  } catch(err) {
    return next();
  }
});

// Stream & Webview Proxy Endpoint with Auto-Sync Injection
app.all('/api/stream-proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing url parameter');

  try {
    const fetchOptions = {
      method: req.method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    };
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && Object.keys(req.body).length > 0) {
      fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);

    let contentType = response.headers.get('content-type') || 'text/html';
    if (targetUrl.endsWith('.js')) contentType = 'application/javascript; charset=utf-8';
    if (targetUrl.endsWith('.css')) contentType = 'text/css; charset=utf-8';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('x-frame-options');
    res.removeHeader('content-security-policy');
    res.removeHeader('content-security-policy-report-only');

    if (contentType.includes('text/html')) {
      let html = await response.text();
      const finalTargetUrl = response.url || targetUrl;
      const baseUrlObj = new URL(finalTargetUrl);
      const origin = baseUrlObj.origin;

      // Rewrite relative /assets/... so they are requested through the proxy directly
      html = html.replace(/(src|href)=["']\/assets\/([^"']+)["']/gi, (match, attr, path) => {
        const fullAssetUrl = `${origin}/assets/${path}`;
        return `${attr}="/api/stream-proxy?url=${encodeURIComponent(fullAssetUrl)}"`;
      });

      // Remove restrictive crossorigin attributes that cause CORS blocking on module scripts
      html = html.replace(/\scrossorigin(?:=["'][^"']*["'])?/gi, '');

      // Do not inject baseTag for 1fmovies to avoid hijacking /api/stream-proxy asset URLs
      const baseTag = (finalTargetUrl.includes('1fmovies') || finalTargetUrl.includes('7reels')) ? '' : `<base href="${finalTargetUrl}">`;

      // Auto-Sync Injection Script for 1Fmovies and Web Portals
      const syncScript = `
        <script>
        (function() {
          console.log('[CineSync Bridge] Injected auto-sync engine active');
          window.__CINESYNC_TARGET_URL = "${finalTargetUrl}";
          window.__CINESYNC_TARGET_ORIGIN = "${origin}";

          // Only reset pathname if target was an SPA root (avoid breaking deep video/series routes)
          if (window.location.pathname.includes('/api/stream-proxy') && !window.__CINESYNC_TARGET_URL.includes('/movie') && !window.__CINESYNC_TARGET_URL.includes('/tv') && !window.__CINESYNC_TARGET_URL.includes('vidy') && !window.__CINESYNC_TARGET_URL.includes('7reels') && !window.__CINESYNC_TARGET_URL.includes('silverlinehub')) {
            try {
              history.replaceState(null, '', '/');
            } catch(e) {}
          }

          function notifyNavigation(url) {
            if (!url) return;
            try {
              if (typeof url === 'string' && (url.includes('/api/stream-proxy') || url.startsWith('javascript:'))) return;
              var base = window.__CINESYNC_TARGET_URL || "${finalTargetUrl}";
              var full = new URL(url, base).href;
              if (full.includes('/api/stream-proxy') || full.includes('localhost:')) return;
              window.parent.postMessage({ type: 'CINESYNC_AUTO_NAV', url: full }, '*');
            } catch(e) {}
          }

          // Monitor SPA URL Navigation (pushState / replaceState)
          var origPush = history.pushState;
          history.pushState = function(state, title, url) {
            origPush.apply(this, arguments);
            notifyNavigation(url);
          };

          var origReplace = history.replaceState;
          history.replaceState = function(state, title, url) {
            origReplace.apply(this, arguments);
            notifyNavigation(url);
          };

          window.addEventListener('popstate', function() {
            notifyNavigation(window.location.href);
          });

          // Intercept user clicks on links / movie cards
          document.addEventListener('click', function(e) {
            var el = e.target.closest('a, [data-url], [data-href]');
            if (el) {
              var href = el.getAttribute('href') || el.getAttribute('data-url') || el.getAttribute('data-href');
              if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
                notifyNavigation(href);
              }
            }
          }, true);

          // Mirror Scroll Position between host and participant
          var scrollDebounce = null;
          window.addEventListener('scroll', function() {
            if (window.__cinesync_remote_acting) return;
            if (scrollDebounce) clearTimeout(scrollDebounce);
            scrollDebounce = setTimeout(function() {
              window.parent.postMessage({
                type: 'CINESYNC_AUTO_SCROLL',
                scrollX: window.scrollX || window.pageXOffset || 0,
                scrollY: window.scrollY || window.pageYOffset || 0
              }, '*');
            }, 50);
          }, { passive: true });

          // Hook HTML5 Video Players inside iframe
          function hookVideo(v) {
            if (v.__cinesync_hooked) return;
            v.__cinesync_hooked = true;
            console.log('[CineSync Bridge] Hooked video element');

            v.addEventListener('play', function() {
              if (window.__cinesync_remote_acting) return;
              window.parent.postMessage({ type: 'CINESYNC_AUTO_PLAY', currentTime: v.currentTime }, '*');
            });

            v.addEventListener('pause', function() {
              if (window.__cinesync_remote_acting) return;
              window.parent.postMessage({ type: 'CINESYNC_AUTO_PAUSE', currentTime: v.currentTime }, '*');
            });

            v.addEventListener('seeked', function() {
              if (window.__cinesync_remote_acting) return;
              window.parent.postMessage({ type: 'CINESYNC_AUTO_SEEK', currentTime: v.currentTime }, '*');
            });
          }

          var observer = new MutationObserver(function() {
            document.querySelectorAll('video').forEach(hookVideo);
          });
          observer.observe(document.documentElement, { childList: true, subtree: true });
          document.querySelectorAll('video').forEach(hookVideo);

          // Listen for commands from parent CineSync window
          window.addEventListener('message', function(event) {
            var data = event.data;
            if (!data || !data.type) return;

            window.__cinesync_remote_acting = true;

            if (data.type === 'CINESYNC_EXEC_SCROLL') {
              window.scrollTo({
                left: data.scrollX || 0,
                top: data.scrollY || 0,
                behavior: 'smooth'
              });
              setTimeout(function() {
                window.__cinesync_remote_acting = false;
              }, 150);
              return;
            }

            var video = document.querySelector('video');
            if (!video) {
              window.__cinesync_remote_acting = false;
              return;
            }

            if (data.type === 'CINESYNC_EXEC_PLAY') {
              if (typeof data.currentTime === 'number' && Math.abs(video.currentTime - data.currentTime) > 1.2) {
                video.currentTime = data.currentTime;
              }
              video.play().catch(function() {});
            } else if (data.type === 'CINESYNC_EXEC_PAUSE') {
              if (typeof data.currentTime === 'number' && Math.abs(video.currentTime - data.currentTime) > 1.0) {
                video.currentTime = data.currentTime;
              }
              video.pause();
            } else if (data.type === 'CINESYNC_EXEC_SEEK') {
              if (typeof data.currentTime === 'number') {
                video.currentTime = data.currentTime;
              }
            }

            setTimeout(function() {
              window.__cinesync_remote_acting = false;
            }, 400);
          });
        })();
        </script>
      `;

      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>${baseTag}${syncScript}`);
      } else {
        html = baseTag + syncScript + html;
      }
      return res.send(html);
    }

    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).send(`Proxy error: ${err.message}`);
  }
});

// TV Details: Get all seasons and series metadata for TV Shows
app.get('/api/tv-details', async (req, res) => {
  const tmdbId = req.query.tmdbId;
  if (!tmdbId) return res.status(400).json({ error: 'tmdbId required' });

  try {
    const r = await fetch(`https://gove.co.in/cinemax/tv/${tmdbId}`, {
      signal: AbortSignal.timeout(5000)
    });
    if (r.ok) {
      const data = await r.json();
      const validSeasons = (data.seasons || [])
        .filter(s => s.season_number > 0)
        .map(s => ({
          seasonNumber: s.season_number,
          name: s.name || `Season ${s.season_number}`,
          episodeCount: s.episode_count || 0,
          airDate: s.air_date || '',
          overview: s.overview || '',
          poster: s.poster_path ? `https://image.tmdb.org/t/p/w342${s.poster_path}` : null
        }));

      return res.json({
        success: true,
        id: data.id,
        title: data.name || data.title,
        overview: data.overview,
        numberOfSeasons: data.number_of_seasons || validSeasons.length || 1,
        numberOfEpisodes: data.number_of_episodes || 0,
        backdrop: data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : null,
        poster: data.poster_path ? `https://image.tmdb.org/t/p/w342${data.poster_path}` : null,
        seasons: validSeasons.length > 0 ? validSeasons : [{
          seasonNumber: 1,
          name: 'Season 1',
          episodeCount: data.number_of_episodes || 10,
          airDate: '',
          overview: '',
          poster: null
        }]
      });
    }
  } catch (err) {
    console.warn('[TV Details Error]', err.message);
  }

  // Fallback
  return res.json({
    success: true,
    id: tmdbId,
    title: 'Series',
    numberOfSeasons: 1,
    numberOfEpisodes: 10,
    seasons: [{ seasonNumber: 1, name: 'Season 1', episodeCount: 10, poster: null }]
  });
});

// TV Season: Get individual episodes for a specific Season of a TV Show
app.get('/api/tv-season', async (req, res) => {
  const tmdbId = req.query.tmdbId;
  const season = req.query.season || 1;
  if (!tmdbId) return res.status(400).json({ error: 'tmdbId required' });

  try {
    const r = await fetch(`https://gove.co.in/cinemax/tv/${tmdbId}/season/${season}`, {
      signal: AbortSignal.timeout(5000)
    });
    if (r.ok) {
      const data = await r.json();
      const episodes = (data.episodes || []).map(ep => ({
        episodeNumber: ep.episode_number,
        name: ep.name || `Episode ${ep.episode_number}`,
        overview: ep.overview || '',
        runtime: ep.runtime ? `${ep.runtime}m` : null,
        airDate: ep.air_date || '',
        still: ep.still_path ? `https://image.tmdb.org/t/p/w342${ep.still_path}` : null
      }));

      return res.json({
        success: true,
        seasonNumber: Number(season),
        name: data.name || `Season ${season}`,
        episodes
      });
    }
  } catch (err) {
    console.warn('[TV Season Error]', err.message);
  }

  // Fallback: synthesize episodes 1..10 or requested count
  const count = Number(req.query.episodeCount) || 10;
  const fallbackEpisodes = Array.from({ length: count }, (_, i) => ({
    episodeNumber: i + 1,
    name: `Episode ${i + 1}`,
    overview: `Season ${season} Episode ${i + 1}`,
    runtime: '45m',
    airDate: '',
    still: null
  }));

  return res.json({
    success: true,
    seasonNumber: Number(season),
    name: `Season ${season}`,
    episodes: fallbackEpisodes
  });
});

// Stream resolver endpoint: extracts direct master.m3u8 from TMDB ID & Season/Episode
app.get('/api/resolve-stream', async (req, res) => {
  const tmdbId = req.query.tmdbId;
  if (!tmdbId) {
    return res.status(400).json({ error: 'tmdbId required' });
  }

  const isTv = req.query.type === 'series' || req.query.isTv === 'true';
  const season = Number(req.query.season) || 1;
  const episode = Number(req.query.episode) || 1;

  const targetUrl = isTv
    ? `https://player.silverlinehub.org/?tmdb_id=${tmdbId}&type=series&season=${season}&episode=${episode}`
    : `https://player.silverlinehub.org/?tmdb_id=${tmdbId}`;

  try {
    const streamRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(5000)
    });

    if (streamRes.ok) {
      const html = await streamRes.text();
      let match = null;

      if (isTv) {
        // Target exact season & episode (e.g. /s01/e02/master.m3u8)
        const sStr = String(season).padStart(2, '0');
        const eStr = String(episode).padStart(2, '0');
        const targetedRegex = new RegExp(`https:\/\/[^"'<>\\s]+s${sStr}\/e${eStr}\/master\\.m3u8[^"'<>\\s]*`);
        match = html.match(targetedRegex);
        if (!match) {
          // Alternative regex for json playback in Next.js script tags
          const epJsonMatch = html.match(new RegExp(`"episode_number":\\s*${episode}[^}]*"playback":\\s*\\{[^}]*"hls":\\s*"([^"]+)"`));
          if (epJsonMatch) {
            match = [epJsonMatch[1]];
          }
        }
      }

      if (!match) {
        match = html.match(/https:\/\/[^"'<>\s]+master\.m3u8[^"'<>\s]*/);
      }

      if (match) {
        let masterUrl = match[0]
          .replace(/\\u0026/g, '&')
          .replace(/&amp;/g, '&')
          .replace(/\\+$/, '')
          .replace(/"$/, '');

        // Extract subtitles if present
        const subMatch = html.match(/https:\/\/[^"'<>\s]+subtitles\/[^"'<>\s]+\.vtt[^"'<>\s]*/);
        const subUrl = subMatch 
          ? subMatch[0].replace(/\\u0026/g, '&').replace(/&amp;/g, '&').replace(/\\+$/, '').replace(/"$/, '') 
          : null;

        // Fetch master.m3u8 header to discover all available Audio Languages
        let audioTracks = [];
        try {
          const m3u8Res = await fetch(masterUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            signal: AbortSignal.timeout(2500)
          });
          if (m3u8Res.ok) {
            const m3u8Text = await m3u8Res.text();
            const audioLines = m3u8Text.split('\n').filter(l => l.includes('TYPE=AUDIO'));
            audioTracks = audioLines.map((line, idx) => {
              const lang = line.match(/LANGUAGE="([^"]+)"/)?.[1] || 'und';
              const name = line.match(/NAME="([^"]+)"/)?.[1] || `Audio ${idx + 1}`;
              const isDefault = line.includes('DEFAULT=YES');
              return { id: idx, lang, name, isDefault };
            });
          }
        } catch (e) {
          console.warn('[Audio Tracks Parse Error]', e.message);
        }

        console.log(`[Stream Resolver] Resolved TMDB ${tmdbId} (TV: ${isTv}, S${season}:E${episode}) to direct HLS: ${masterUrl} with ${audioTracks.length} audio tracks`);
        return res.json({
          success: true,
          type: 'hls',
          season,
          episode,
          streamUrl: masterUrl,
          subtitleUrl: subUrl,
          audioTracks
        });
      }
    }
    return res.json({ success: false, fallback: targetUrl });
  } catch (err) {
    console.warn('[Resolve Stream Error]', err.message);
    return res.json({ success: false, fallback: targetUrl });
  }
});

// REST Endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', activeRooms: rooms.size, timestamp: Date.now() });
});

// Search Engine API with Curated + Live Cinemax / TMDB Multi-Search
app.get('/api/search', async (req, res) => {
  const query = (req.query.q || '').trim().toLowerCase();
  const category = (req.query.category || 'all').toLowerCase();

  let results = [...CURATED_MOVIES];

  // Category filter for curated
  if (category && category !== 'all') {
    results = results.filter(m => 
      m.genre.toLowerCase().includes(category) || 
      (category === 'movies' && m.type === 'video') ||
      (category === 'youtube' && m.type === 'youtube')
    );
  }

  // Text search
  if (query) {
    // Check if query is a direct YouTube link
    const ytMatch = query.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (ytMatch) {
      const ytId = ytMatch[1];
      return res.json([
        {
          id: `custom-yt-${ytId}`,
          title: `YouTube Video (${ytId})`,
          year: "Direct Link",
          genre: "YouTube Stream",
          duration: "Custom",
          rating: "N/A",
          description: "Streamed directly via YouTube link provided.",
          thumbnail: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
          backdrop: `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`,
          url: ytId,
          type: "youtube"
        }
      ]);
    }

    // Check if query is direct video URL (mp4, webm, m3u8, ogg)
    if (query.startsWith('http://') || query.startsWith('https://')) {
      const fileName = query.split('/').pop().split('?')[0] || "Custom Stream";
      return res.json([
        {
          id: `custom-stream-${Date.now()}`,
          title: decodeURIComponent(fileName),
          year: "Live / Direct",
          genre: "Web Stream",
          duration: "Custom",
          rating: "N/A",
          description: `Custom direct video stream from ${new URL(query).hostname}`,
          thumbnail: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=800&q=80",
          backdrop: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1600&q=80",
          url: query,
          type: "video"
        }
      ]);
    }

    // Filter curated list
    const matchedCurated = results.filter(m => 
      m.title.toLowerCase().includes(query) ||
      m.genre.toLowerCase().includes(query) ||
      m.description.toLowerCase().includes(query) ||
      m.year.includes(query)
    );

    // Live Multi-Search with BOTH 7REELS and 1Fmovies Stream Results
    let liveResults = [];
    try {
      const cinemaxRes = await fetch(`https://gove.co.in/cinemax/search/multi?query=${encodeURIComponent(query)}&language=en-US&page=1`, {
        signal: AbortSignal.timeout(4500)
      });
      if (cinemaxRes.ok) {
        const cinemaxData = await cinemaxRes.json();
        const items = cinemaxData?.results || [];
        liveResults = items
          .filter(item => (item.title || item.name) && (item.media_type === 'movie' || item.media_type === 'tv'))
          .slice(0, 12)
          .flatMap(item => {
            const isTv = item.media_type === 'tv';
            const tmdbId = item.id;
            const title = item.title || item.name;
            const year = (item.release_date || item.first_air_date || '').split('-')[0] || '2024';
            const rating = item.vote_average ? item.vote_average.toFixed(1) : '8.0';
            const desc = item.overview || 'Watch in room with synchronized live playback and peer video chat.';
            const thumb = item.poster_path 
              ? `https://image.tmdb.org/t/p/w342${item.poster_path}` 
              : 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=800&q=80';
            const back = item.backdrop_path 
              ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` 
              : 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1600&q=80';

            return [
              // 1. Result from 7REELS (Original 1080p FHD Stream)
              {
                id: `7reels-${tmdbId}`,
                tmdbId: tmdbId,
                title: title,
                year: year,
                genre: isTv ? 'TV Series' : 'Feature Film',
                duration: isTv ? 'Series' : 'Feature',
                rating: rating,
                description: desc,
                thumbnail: thumb,
                backdrop: back,
                url: isTv 
                  ? `https://vidy.st/tv/${tmdbId}/1/1?autoplay=true&nextEpisode=true&autoplayNextEpisode=true&episodeSelector=true&overlay=true&color=16A085&quality=2160p` 
                  : `https://vidy.st/movie/${tmdbId}?autoplay=true&overlay=true&color=16A085&quality=2160p`,
                backupUrl: isTv 
                  ? `https://7reels.cc/tv/${tmdbId}/watch?s=1&e=1` 
                  : `https://7reels.cc/movie/${tmdbId}/watch`,
                type: "7reels",
                platform: '7reels',
                isTv: isTv,
                mediaType: isTv ? 'tv' : 'movie',
                season: isTv ? 1 : null,
                episode: isTv ? 1 : null,
                source: '7REELS',
                sourceBadge: '7REELS',
                sourceDomain: '7reels.cc',
                sourceColor: '#e11d48',
                originalQuality: '2160p',
                availableQualities: ['2160p', '1080p', '720p', '480p', 'auto']
              },
              // 2. Result from 1Fmovies (Original 1080p FHD Stream)
              {
                id: `1fmovies-${tmdbId}`,
                tmdbId: tmdbId,
                title: title,
                year: year,
                genre: isTv ? 'TV Series' : 'Feature Film',
                duration: isTv ? 'Series' : 'Feature',
                rating: rating,
                description: desc,
                thumbnail: thumb,
                backdrop: back,
                url: isTv 
                  ? `https://player.silverlinehub.org/?tmdb_id=${tmdbId}&type=series&season=1&episode=1` 
                  : `https://player.silverlinehub.org/?tmdb_id=${tmdbId}`,
                backupUrl: `https://1fmovies.live/`,
                type: "1fmovies",
                platform: '1fmovies',
                isTv: isTv,
                mediaType: isTv ? 'tv' : 'movie',
                season: isTv ? 1 : null,
                episode: isTv ? 1 : null,
                source: '1Fmovies',
                sourceBadge: '1Fmovies',
                sourceDomain: '1fmovies.live',
                sourceColor: '#10b981',
                originalQuality: '1080p',
                availableQualities: ['1080p', '720p', '480p', '360p', 'auto']
              }
            ];
          });
      }
    } catch (err) {
      console.warn('[Search Engine] Cinemax API search error:', err.message);
    }

    if (category && category !== 'all') {
      if (category === '7reels') {
        liveResults = liveResults.filter(m => m.source === '7REELS');
      } else if (category === '1fmovies') {
        liveResults = liveResults.filter(m => m.source === '1Fmovies');
      }
    }

    return res.json([...liveResults, ...matchedCurated]);
  } else {
    // When query is empty, fetch top Trending movies from both 7REELS and 1Fmovies
    try {
      const trendRes = await fetch('https://gove.co.in/cinemax/trending/movie/day', {
        signal: AbortSignal.timeout(3000)
      });
      if (trendRes.ok) {
        const trendData = await trendRes.json();
        const trendItems = (trendData?.results || []).slice(0, 10).flatMap(item => {
          const title = item.title || item.name;
          const year = (item.release_date || item.first_air_date || '').split('-')[0] || '2024';
          const rating = item.vote_average ? item.vote_average.toFixed(1) : '8.2';
          const desc = item.overview || 'Trending worldwide. Watch live with synchronized playback.';
          const thumb = item.poster_path 
            ? `https://image.tmdb.org/t/p/w342${item.poster_path}` 
            : 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=800&q=80';
          const back = item.backdrop_path 
            ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` 
            : 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1600&q=80';

          return [
            // 7REELS Result (Original 1080p FHD Stream)
            {
              id: `7reels-${item.id}`,
              tmdbId: item.id,
              title: title,
              year: year,
              genre: 'Trending Movie',
              duration: 'Feature',
              rating: rating,
              description: desc,
              thumbnail: thumb,
              backdrop: back,
              url: `https://vidy.st/movie/${item.id}?autoplay=true&overlay=true&color=16A085&quality=2160p`,
              backupUrl: `https://7reels.cc/movie/${item.id}/watch`,
              type: "7reels",
              platform: '7reels',
              source: '7REELS',
              sourceBadge: '7REELS',
              sourceDomain: '7reels.cc',
              sourceColor: '#e11d48',
              originalQuality: '2160p',
              availableQualities: ['2160p', '1080p', '720p', '480p', 'auto']
            },
            // 1Fmovies Result (Original 1080p FHD Stream)
            {
              id: `1fmovies-${item.id}`,
              tmdbId: item.id,
              title: title,
              year: year,
              genre: 'Trending Movie',
              duration: 'Feature',
              rating: rating,
              description: desc,
              thumbnail: thumb,
              backdrop: back,
              url: `https://player.silverlinehub.org/?tmdb_id=${item.id}`,
              backupUrl: `https://1fmovies.live/`,
              type: "1fmovies",
              platform: '1fmovies',
              source: '1Fmovies',
              sourceBadge: '1Fmovies',
              sourceDomain: '1fmovies.live',
              sourceColor: '#10b981',
              originalQuality: '1080p',
              availableQualities: ['1080p', '720p', '480p', '360p', 'auto']
            }
          ];
        });

        let finalTrend = trendItems;
        if (category && category !== 'all') {
          if (category === '7reels') finalTrend = finalTrend.filter(m => m.source === '7REELS');
          else if (category === '1fmovies') finalTrend = finalTrend.filter(m => m.source === '1Fmovies');
        }

        return res.json([...finalTrend, ...results]);
      }
    } catch (err) {
      console.warn('[Search Engine] Trending fetch error:', err.message);
    }
  }

  res.json(results);
});

// Helper to broadcast and persist system messages in room chat history
function broadcastSystemMessage(roomId, text, type = 'system') {
  const room = rooms.get(roomId);
  const sysMsg = {
    id: `sys-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    text,
    timestamp: Date.now(),
    type,
    isSystem: true
  };
  if (room) {
    if (!room.messages) room.messages = [];
    room.messages.push(sysMsg);
    storage.saveRoomMessage(roomId, sysMsg);
  }
  io.to(roomId).emit('system_message', sysMsg);
  return sysMsg;
}

// ==========================================
// AUTHENTICATION ENDPOINTS (SIGNUP / SIGNIN)
// ==========================================

// Sign Up: Unique username & alphanumeric with @ password
app.post('/api/auth/signup', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    const user = storage.createUser(username, password);
    const token = storage.createSessionToken(user);
    console.log(`[Auth] New user signed up: ${user.username} (${user.id})`);
    res.json({ success: true, user, token });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Sign In
app.post('/api/auth/signin', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    const user = storage.authenticateUser(username, password);
    const token = storage.createSessionToken(user);
    console.log(`[Auth] User signed in: ${user.username}`);
    res.json({ success: true, user, token });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// Current User Session verification
app.get('/api/auth/me', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : (req.query.token || req.headers['x-auth-token']);
    const user = storage.getUserFromToken(token);
    if (!user) {
      return res.status(401).json({ error: 'Session expired or invalid.' });
    }
    res.json({ success: true, user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// WATCH HISTORY ENDPOINTS
// ==========================================

// Get Watch History
app.get('/api/user/history', (req, res) => {
  try {
    const identifier = req.query.userId || req.query.username;
    if (!identifier) {
      return res.status(400).json({ error: 'Missing userId or username parameter.' });
    }
    const history = storage.getWatchHistory(identifier);
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add Item to Watch History
app.post('/api/user/history', (req, res) => {
  try {
    const { userId, username, item } = req.body;
    const identifier = userId || username;
    if (!identifier || !item) {
      return res.status(400).json({ error: 'Missing user identifier or media item.' });
    }
    const history = storage.addWatchHistory(identifier, item);
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Item from Watch History
app.delete('/api/user/history', (req, res) => {
  try {
    const identifier = req.body.userId || req.body.username || req.query.userId || req.query.username;
    const historyId = req.body.historyId || req.query.historyId;
    if (!identifier) {
      return res.status(400).json({ error: 'Missing user identifier.' });
    }
    const history = storage.removeWatchHistoryItem(identifier, historyId);
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Room Chat History Endpoint
app.get('/api/rooms/:roomId/messages', (req, res) => {
  try {
    const roomId = req.params.roomId.toUpperCase();
    const room = rooms.get(roomId);
    const messages = room?.messages || storage.getRoomChat(roomId) || [];
    res.json({ success: true, messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Room details endpoint
app.get('/api/rooms/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId.toUpperCase());
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  res.json({
    id: room.id,
    title: room.title,
    hostName: room.hostName,
    memberCount: room.members.size,
    media: room.media,
    settings: room.settings
  });
});

// Socket.io Real-Time Signaling & Playback Sync
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Create Room
  socket.on('create_room', ({ hostName, roomTitle, settings, initialMedia }, callback) => {
    try {
      const roomId = generateRoomCode();
      const defaultMedia = initialMedia || null;

      const room = {
        id: roomId,
        title: roomTitle || `${hostName}'s Watch Party`,
        hostId: socket.id,
        hostName: hostName || 'Host',
        remoteControllerId: socket.id,
        remoteControllerName: hostName || 'Host',
        createdAt: Date.now(),
        settings: {
          controlMode: settings?.controlMode || 'host-only', // 'host-only' or 'open'
          syncStrictness: settings?.syncStrictness || 'smart', // 'strict' (0.5s), 'smart' (1.5s), 'loose' (3s)
          allowChat: settings?.allowChat !== false,
          allowVideoAudio: settings?.allowVideoAudio !== false,
          requireSyncApproval: false
        },
        media: defaultMedia ? {
          id: defaultMedia.id,
          title: defaultMedia.title,
          url: defaultMedia.url,
          type: defaultMedia.type,
          thumbnail: defaultMedia.thumbnail,
          currentTime: 0,
          isPlaying: false,
          playbackRate: 1.0,
          lastUpdated: Date.now()
        } : null,
        messages: storage.getRoomChat(roomId) || [],
        members: new Map()
      };

      const hostMember = {
        socketId: socket.id,
        name: hostName || 'Host',
        isHost: true,
        hasAudio: false,
        hasVideo: false,
        joinedAt: Date.now()
      };

      room.members.set(socket.id, hostMember);
      rooms.set(roomId, room);

      socket.join(roomId);
      socket.currentRoomId = roomId;

      console.log(`[Room Created] ${roomId} by ${hostName} (${socket.id}) - Media: ${defaultMedia ? defaultMedia.title : 'None (Host will pick from Catalog)'}`);

      if (typeof callback === 'function') {
        callback({
          success: true,
          roomId,
          room: serializeRoom(room),
          messages: room.messages,
          user: hostMember
        });
      }
    } catch (err) {
      console.error('[Error create_room]', err);
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // Join Room
  socket.on('join_room', ({ roomId, name, hasAudio, hasVideo }, callback) => {
    try {
      const normalizedRoomId = (roomId || '').trim().toUpperCase();
      const room = rooms.get(normalizedRoomId);

      if (!room) {
        if (typeof callback === 'function') {
          return callback({ success: false, error: 'Room does not exist or has closed.' });
        }
        return;
      }

      const isHost = (socket.id === room.hostId);
      const member = {
        socketId: socket.id,
        name: name || `Participant-${socket.id.substring(0, 4)}`,
        isHost,
        hasAudio: Boolean(hasAudio),
        hasVideo: Boolean(hasVideo),
        joinedAt: Date.now()
      };

      room.members.set(socket.id, member);
      socket.join(normalizedRoomId);
      socket.currentRoomId = normalizedRoomId;

      console.log(`[User Joined] ${member.name} (${socket.id}) joined ${normalizedRoomId}`);

      if (!room.messages) {
        room.messages = storage.getRoomChat(normalizedRoomId) || [];
      }

      // Calculate current approximate timestamp if playing
      let currentPosition = room.media ? room.media.currentTime : 0;
      if (room.media && room.media.isPlaying) {
        const elapsedSec = (Date.now() - room.media.lastUpdated) / 1000;
        currentPosition += elapsedSec * (room.media.playbackRate || 1);
      }

      // Notify other room members about the new participant
      socket.to(normalizedRoomId).emit('user_joined', {
        user: member,
        membersCount: room.members.size
      });

      // Broadcast authoritative full members list to ALL members in room
      io.to(normalizedRoomId).emit('members_updated', {
        members: Array.from(room.members.values()),
        count: room.members.size
      });

      // System notification in chat with persistence
      broadcastSystemMessage(normalizedRoomId, `${member.name} joined the room.`, 'join');

      // Send existing chat history to the newly connected participant
      socket.emit('chat_history', room.messages);

      if (typeof callback === 'function') {
        callback({
          success: true,
          room: {
            ...serializeRoom(room),
            media: room.media ? {
              ...room.media,
              currentTime: currentPosition
            } : null
          },
          messages: room.messages,
          user: member
        });
      }
    } catch (err) {
      console.error('[Error join_room]', err);
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // Update Room Settings (Host only)
  socket.on('update_room_settings', ({ roomId, settings }, callback) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (socket.id !== room.hostId) {
      if (typeof callback === 'function') callback({ success: false, error: 'Only host can change room settings.' });
      return;
    }

    room.settings = { ...room.settings, ...settings };
    io.to(roomId).emit('room_settings_updated', { settings: room.settings });
    
    broadcastSystemMessage(roomId, `Host updated room settings (Control: ${room.settings.controlMode}).`, 'settings');

    if (typeof callback === 'function') callback({ success: true, settings: room.settings });
  });

  // Media Synchronization Events
  // Helper to check if a socket has playback control (Scener Virtual Remote model)
  function hasPlaybackControl(room, socketId) {
    if (!room) return false;
    if (room.settings?.controlMode === 'open') return true;
    return socketId === room.remoteControllerId || socketId === room.hostId;
  }

  // Pass the Remote (Scener Virtual Remote feature)
  socket.on('pass_remote', ({ roomId, targetSocketId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const isHolder = socket.id === room.remoteControllerId || socket.id === room.hostId;
    if (!isHolder) {
      return socket.emit('error_notification', 'You do not hold the Virtual Remote.');
    }
    const targetMember = room.members.get(targetSocketId);
    if (!targetMember) return;

    room.remoteControllerId = targetMember.socketId;
    room.remoteControllerName = targetMember.name;

    const senderMember = room.members.get(socket.id);
    const senderName = senderMember?.name || 'Host';

    console.log(`[Pass Remote] in ${roomId} to ${targetMember.name} by ${senderName}`);

    io.to(roomId).emit('remote_transferred', {
      controllerId: targetMember.socketId,
      controllerName: targetMember.name,
      passedBy: senderName
    });

    broadcastSystemMessage(roomId, `🎮 ${senderName} passed the Remote to ${targetMember.name}!`, 'remote_transfer');
  });

  // Request the Remote
  socket.on('request_remote', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const member = room.members.get(socket.id);
    const senderName = member?.name || 'Friend';

    console.log(`[Request Remote] in ${roomId} by ${senderName}`);

    io.to(roomId).emit('remote_requested', {
      requesterId: socket.id,
      requesterName: senderName
    });

    broadcastSystemMessage(roomId, `🙋 ${senderName} requested the Virtual Remote!`, 'remote_request');
  });

  // Media Play
  socket.on('media_play', ({ roomId, currentTime }) => {
    const room = rooms.get(roomId);
    if (!room || !room.media) return;

    // Check control permissions via Virtual Remote
    if (!hasPlaybackControl(room, socket.id)) {
      return socket.emit('error_notification', 'You need the Virtual Remote to control playback.');
    }

    const member = room.members.get(socket.id);
    room.media.isPlaying = true;
    room.media.currentTime = currentTime;
    room.media.lastUpdated = Date.now();

    console.log(`[Media Play] in ${roomId} at ${currentTime.toFixed(2)}s by ${member?.name || socket.id}`);

    // Broadcast to everyone else
    socket.to(roomId).emit('media_play', {
      currentTime,
      timestamp: Date.now(),
      triggeredBy: member?.name || 'Someone'
    });
  });

  // Media Pause
  socket.on('media_pause', ({ roomId, currentTime }) => {
    const room = rooms.get(roomId);
    if (!room || !room.media) return;

    if (!hasPlaybackControl(room, socket.id)) {
      return socket.emit('error_notification', 'You need the Virtual Remote to pause playback.');
    }

    const member = room.members.get(socket.id);
    room.media.isPlaying = false;
    room.media.currentTime = currentTime;
    room.media.lastUpdated = Date.now();

    console.log(`[Media Pause] in ${roomId} at ${currentTime.toFixed(2)}s by ${member?.name || socket.id}`);

    socket.to(roomId).emit('media_pause', {
      currentTime,
      timestamp: Date.now(),
      triggeredBy: member?.name || 'Someone'
    });
  });

  // Media Seek
  socket.on('media_seek', ({ roomId, currentTime }) => {
    const room = rooms.get(roomId);
    if (!room || !room.media) return;

    if (!hasPlaybackControl(room, socket.id)) {
      return socket.emit('error_notification', 'You need the Virtual Remote to seek playback.');
    }

    const member = room.members.get(socket.id);
    room.media.currentTime = currentTime;
    room.media.lastUpdated = Date.now();

    console.log(`[Media Seek] in ${roomId} to ${currentTime.toFixed(2)}s by ${member?.name || socket.id}`);

    socket.to(roomId).emit('media_seek', {
      currentTime,
      timestamp: Date.now(),
      isPlaying: room.media.isPlaying,
      triggeredBy: member?.name || 'Someone'
    });
  });

  // Media Playback Rate / Speed Change
  socket.on('media_rate_change', ({ roomId, playbackRate }) => {
    const room = rooms.get(roomId);
    if (!room || !room.media) return;

    if (!hasPlaybackControl(room, socket.id)) {
      return socket.emit('error_notification', 'You need the Virtual Remote to change playback speed.');
    }

    const member = room.members.get(socket.id);
    room.media.playbackRate = playbackRate;
    room.media.lastUpdated = Date.now();

    console.log(`[Media Rate] in ${roomId} to ${playbackRate}x by ${member?.name || socket.id}`);

    socket.to(roomId).emit('media_rate_changed', {
      playbackRate,
      timestamp: Date.now(),
      triggeredBy: member?.name || 'Someone'
    });
  });

  // Synchronized Page Scroll for In-Website Windows (Host mirrors scroll to participants)
  socket.on('media_scroll', ({ roomId, scrollX, scrollY }) => {
    socket.to(roomId).emit('media_scroll', { scrollX, scrollY });
  });

  // Media Change (Change movie / video)
  socket.on('media_change', ({ roomId, media }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    if (!hasPlaybackControl(room, socket.id)) {
      return socket.emit('error_notification', 'You need the Virtual Remote to select a movie.');
    }

    const member = room.members.get(socket.id);
    const isTv = Boolean(
      media.isTv || 
      media.platform === 'tv' || 
      media.genre?.includes('Series') || 
      media.duration === 'Series' || 
      media.url?.includes('type=series') || 
      media.season
    );
    const season = isTv ? (Number(media.season) || 1) : null;
    const episode = isTv ? (Number(media.episode) || 1) : null;

    room.media = {
      id: media.id || `custom-${Date.now()}`,
      tmdbId: media.tmdbId || null,
      title: media.title,
      url: media.url,
      backupUrl: media.backupUrl || null,
      type: media.type || 'video',
      thumbnail: media.thumbnail || '',
      currentTime: 0,
      isPlaying: true, // Auto play on new movie selection
      playbackRate: 1.0,
      lastUpdated: Date.now(),
      source: media.source || null,
      platform: media.platform || null,
      isTv,
      season,
      episode,
      episodeTitle: media.episodeTitle || null,
      numberOfSeasons: media.numberOfSeasons || null,
      originalQuality: media.originalQuality || (media.source === '7REELS' ? '2160p' : '1080p'),
      availableQualities: media.availableQualities || (media.source === '7REELS' ? ['2160p', '1080p', '720p', '480p', 'auto'] : ['1080p', '720p', '480p', 'auto'])
    };

    console.log(`[Media Changed] in ${roomId} to "${media.title}" (TV: ${isTv}, S${season}:E${episode}) by ${member?.name}`);

    // If media is a TMDB movie/series and not yet direct HLS, attempt server-side resolution
    const rawTmdbId = media.tmdbId || 
      (media.id && media.id.match(/(?:tmdb|7reels|1fmovies)-(\d+)/)?.[1]) ||
      (media.url?.match(/tmdb_id=(\d+)/)?.[1]) ||
      (media.url?.match(/(?:movie|tv)\/(\d+)/)?.[1]) ||
      (media.backupUrl?.match(/(?:movie|tv)\/(\d+)/)?.[1]);

    if (rawTmdbId && room.media.type !== 'hls' && media.type !== 'platform') {
      const seriesQuery = isTv ? `&type=series&season=${season || 1}&episode=${episode || 1}` : '';
      const targetUrl = `https://player.silverlinehub.org/?tmdb_id=${rawTmdbId}${seriesQuery}`;

      fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(3500)
      }).then(r => r.text()).then(html => {
        let match = null;
        if (isTv) {
          const sStr = String(season || 1).padStart(2, '0');
          const eStr = String(episode || 1).padStart(2, '0');
          const targetedRegex = new RegExp(`https:\/\/[^"'<>\\s]+s${sStr}\/e${eStr}\/master\\.m3u8[^"'<>\\s]*`);
          match = html.match(targetedRegex);
        }
        if (!match) {
          match = html.match(/https:\/\/[^"'<>\s]+master\.m3u8[^"'<>\s]*/);
        }
        if (match) {
          let masterUrl = match[0].replace(/\\u0026/g, '&').replace(/&amp;/g, '&').replace(/\\+$/, '').replace(/"$/, '');
          console.log(`[Server Auto-Resolve] Converted "${room.media.title}" to direct HLS stream: ${masterUrl}`);
          room.media.url = masterUrl;
          room.media.type = 'hls';
          room.media.backupUrl = media.url;
          io.to(roomId).emit('media_changed', {
            media: room.media,
            triggeredBy: member?.name || 'Remote Controller'
          });
        }
      }).catch(err => console.warn('[Auto-Resolve stream error]', err.message));
    }

    // Broadcast change to ALL members in room (including initiator for guaranteed state consistency)
    io.to(roomId).emit('media_changed', {
      media: room.media,
      triggeredBy: member?.name || 'Host'
    });

    const epDisplay = isTv && season && episode ? ` (S${season}:E${episode}${media.episodeTitle ? ` - ${media.episodeTitle}` : ''})` : '';
    broadcastSystemMessage(roomId, `${member?.name || 'Host'} started playing "${media.title}"${epDisplay}.`, 'media_change');
  });

  // Request Sync (Participant requests current exact timestamp & status from host/server)
  socket.on('request_sync', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const member = room.members.get(socket.id);

    // Compute live timestamp safely
    let liveCurrentTime = room.media ? room.media.currentTime : 0;
    if (room.media && room.media.isPlaying) {
      const elapsedSec = (Date.now() - room.media.lastUpdated) / 1000;
      liveCurrentTime += elapsedSec * (room.media.playbackRate || 1);
    }

    console.log(`[Sync Requested] by ${member?.name || socket.id} in ${roomId}. Calculated time: ${liveCurrentTime.toFixed(2)}s`);

    // Reply directly to requesting socket
    socket.emit('sync_state', {
      currentTime: liveCurrentTime,
      isPlaying: room.media ? room.media.isPlaying : false,
      media: room.media ? room.media : null,
      serverTime: Date.now()
    });

    // Notify room of sync event
    socket.to(roomId).emit('user_resynced', {
      name: member?.name || 'A participant'
    });
  });

  // Host or Remote Holder heartbeat (Periodically updates accurate playback status)
  socket.on('host_heartbeat', ({ roomId, currentTime, isPlaying }) => {
    const room = rooms.get(roomId);
    if (!room || !room.media || !hasPlaybackControl(room, socket.id)) return;

    room.media.currentTime = currentTime;
    room.media.isPlaying = isPlaying;
    room.media.lastUpdated = Date.now();
  });

  // Audio Language track change
  socket.on('media_audio_track', ({ roomId, trackId, trackLang, trackName }) => {
    const room = rooms.get(roomId);
    if (!room || !room.media) return;
    room.media.selectedAudioTrack = trackId;
    room.media.selectedAudioLang = trackLang;
    const member = room.members.get(socket.id);
    console.log(`[Audio Track Changed] in ${roomId} to track ${trackId} (${trackName || trackLang}) by ${member?.name}`);
    socket.to(roomId).emit('media_audio_track_changed', {
      trackId,
      trackLang,
      trackName,
      changedBy: member?.name || 'Remote Controller'
    });
  });

  // WebRTC Mesh Signaling (Peer to Peer Video & Audio)
  socket.on('webrtc_offer', ({ targetSocketId, offer, callerInfo }) => {
    io.to(targetSocketId).emit('webrtc_offer', {
      fromSocketId: socket.id,
      offer,
      callerInfo
    });
  });

  socket.on('webrtc_answer', ({ targetSocketId, answer }) => {
    io.to(targetSocketId).emit('webrtc_answer', {
      fromSocketId: socket.id,
      answer
    });
  });

  socket.on('webrtc_ice_candidate', ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit('webrtc_ice_candidate', {
      fromSocketId: socket.id,
      candidate
    });
  });

  socket.on('toggle_media_state', ({ roomId, hasAudio, hasVideo }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const member = room.members.get(socket.id);
    if (member) {
      member.hasAudio = hasAudio;
      member.hasVideo = hasVideo;
      socket.to(roomId).emit('user_media_state_changed', {
        socketId: socket.id,
        hasAudio,
        hasVideo
      });
    }
  });

  // Chat message
  socket.on('send_chat_message', ({ roomId, text }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    if (!room.settings.allowChat) {
      return socket.emit('error_notification', 'Chat is disabled by the host.');
    }

    const member = room.members.get(socket.id);
    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      senderId: socket.id,
      senderName: member?.name || 'Anonymous',
      isHost: member?.isHost || false,
      text: text.trim(),
      timestamp: Date.now()
    };

    if (!room.messages) room.messages = [];
    room.messages.push(message);
    storage.saveRoomMessage(roomId, message);

    io.to(roomId).emit('new_chat_message', message);
  });

  // Floating live emoji reaction
  socket.on('send_reaction', ({ roomId, emoji }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const member = room.members.get(socket.id);
    io.to(roomId).emit('floating_reaction', {
      id: `rx-${Date.now()}-${Math.random()}`,
      emoji,
      senderName: member?.name || 'Viewer'
    });
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
    const roomId = socket.currentRoomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    const member = room.members.get(socket.id);
    const memberName = member?.name || 'A user';

    room.members.delete(socket.id);

    if (room.members.size === 0) {
      // Room empty, delete after a short grace period
      setTimeout(() => {
        const r = rooms.get(roomId);
        if (r && r.members.size === 0) {
          rooms.delete(roomId);
          console.log(`[Room Deleted] ${roomId} (no members remaining)`);
        }
      }, 30000);
    } else {
      // If host left, elect the next oldest member as host
      if (room.hostId === socket.id) {
        const nextHost = room.members.values().next().value;
        if (nextHost) {
          nextHost.isHost = true;
          room.hostId = nextHost.socketId;
          room.hostName = nextHost.name;

          io.to(roomId).emit('host_changed', {
            newHostId: nextHost.socketId,
            newHostName: nextHost.name
          });

          broadcastSystemMessage(roomId, `${nextHost.name} is now the host.`, 'host_transfer');
        }
      }

      // If remote controller left, elect next member as remote controller
      if (room.remoteControllerId === socket.id) {
        const nextController = room.members.values().next().value;
        if (nextController) {
          room.remoteControllerId = nextController.socketId;
          room.remoteControllerName = nextController.name;
          io.to(roomId).emit('remote_transferred', {
            controllerId: nextController.socketId,
            controllerName: nextController.name,
            passedBy: 'Auto-Elected'
          });
        }
      }

      // Notify others
      socket.to(roomId).emit('user_left', {
        socketId: socket.id,
        name: memberName,
        membersCount: room.members.size
      });

      // Broadcast updated member list to remaining participants
      io.to(roomId).emit('members_updated', {
        members: Array.from(room.members.values()),
        count: room.members.size
      });

      broadcastSystemMessage(roomId, `${memberName} left the room.`, 'leave');
    }
  });
});

// Helper to serialize room map for json delivery
function serializeRoom(room) {
  const membersList = [];
  room.members.forEach((m) => membersList.push(m));

  return {
    id: room.id,
    title: room.title,
    hostId: room.hostId,
    hostName: room.hostName,
    remoteControllerId: room.remoteControllerId || room.hostId,
    remoteControllerName: room.remoteControllerName || room.hostName,
    createdAt: room.createdAt,
    settings: room.settings,
    media: room.media ? { ...room.media } : null,
    messages: room.messages || [],
    members: membersList
  };
}

// Fallback to client SPA for any unknown routes
app.get('*', (req, res) => {
  const indexPath = path.join(clientDistPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(200).send('CineSync API server running. Vite client dev server is at http://localhost:3000');
    }
  });
});

// Continuous Automatic Background Sync Pulse (every 2.5s)
setInterval(() => {
  rooms.forEach((room, roomId) => {
    if (room.media && room.media.isPlaying) {
      const elapsedSec = (Date.now() - room.media.lastUpdated) / 1000;
      const currentCalculatedTime = room.media.currentTime + elapsedSec * (room.media.playbackRate || 1);
      io.to(roomId).emit('auto_sync_pulse', {
        currentTime: currentCalculatedTime,
        isPlaying: true,
        mediaId: room.media.id,
        timestamp: Date.now()
      });
    }
  });
}, 2500);

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 CineSync Server running on http://localhost:${PORT}`);
  console.log(`📡 Real-time Playback Sync & WebRTC Signaling active`);
  console.log(`🎬 Curated Catalog: ${CURATED_MOVIES.length} titles ready`);
  console.log(`====================================================`);
});
