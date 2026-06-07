const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const rateLimit = require('express-rate-limit');
const {
  createRoom, createRoomHttp,
  joinRoom, joinRoomHttp,
  attachPlayerWs, getRoom,
  getRoomByPlayer, getLeaderboard, getMultiplier, broadcast, startGame,
  nextQuestion, submitAnswer, setTimer, deleteRoom,
  joinAsSpectator, removeSpectator, getSpectatorCount,
  disconnectAllSpectators, broadcastToHost,
  validateTimerSeconds, getPublicRooms, setRoomPublic, setQuestionStartHook,
  setRoundEndHook, startNextRound,
  ROUNDS_MIN, ROUNDS_MAX, QPR_MIN, QPR_MAX,
} = require('./src/rooms');
const { getTopScores, recordScore, getLoadedCount } = require('./src/scoreHistory');
const { attachAiHost, generateGame, getScript, deleteScript, checkLLMHealth } = require('./src/aiHost');
const { generateBanter } = require('./src/aiBanter');
const { generateSpeech, hasKey: hasTtsKey, prewarmCache, getAudioCacheFile, getAudioCacheKey, VOICE_OPTIONS } = require('./src/tts');
const { QUESTIONS } = require('./src/questions');
const { version } = require('./package.json');

const app = express();
const server = http.createServer(app);

// Two WebSocket servers: game traffic + AI host agent
// noServer: true — we manually route upgrade events by URL path below.
const wss      = new WebSocket.Server({ noServer: true }); // /  (game)
const wssAI    = new WebSocket.Server({ noServer: true }); // /ai-agent

// Route WebSocket upgrades by path
server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/ai-agent') {
    wssAI.handleUpgrade(req, socket, head, (ws) => wssAI.emit('connection', ws, req));
  } else {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  }
});

// Mount AI host handler
attachAiHost(wssAI, getRoom);

// Admin users — bypass credit enforcement. Configure via ADMIN_USER_IDS (comma-separated
// Strapi user ID integers) and/or ADMIN_USER_NAMES (comma-separated full display names).
const ADMIN_USER_IDS   = new Set((process.env.ADMIN_USER_IDS   || '').split(',').map(s => s.trim()).filter(Boolean));
const ADMIN_USER_NAMES = new Set((process.env.ADMIN_USER_NAMES || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));

function isAdminUser(userId, userFullName) {
  if (userId && ADMIN_USER_IDS.has(String(userId))) return true;
  if (userFullName && ADMIN_USER_NAMES.has(String(userFullName).toLowerCase())) return true;
  return false;
}

// Server-side TTS: generate audio ONCE per question, broadcast to all clients.
// This ensures credits are consumed once regardless of how many players are in the room.
// The spoken text format is: question text + options — NO position number, so the same
// question's audio can be cached regardless of its index in the game.
const letters = ['A', 'B', 'C', 'D'];

/**
 * Normalize text for natural TTS pronunciation.
 * Converts abbreviations, symbols, units and punctuation that ElevenLabs
 * reads poorly into their full spoken equivalents.
 */
function normalizeForSpeech(text) {
  if (!text) return text;
  return text
    // ── Abbreviations ────────────────────────────────────────────────────────
    .replace(/\bapprox\.?/gi, 'approximately')
    .replace(/\bvs\.?\b/gi, 'versus')
    .replace(/\betc\.?(?=\s|$)/gi, 'et cetera')
    .replace(/\be\.g\.?/gi, 'for example')
    .replace(/\bi\.e\.?/gi, 'that is')
    .replace(/\bDr\.\s/g, 'Doctor ')
    .replace(/\bMr\.\s/g, 'Mister ')
    .replace(/\bMrs\.\s/g, 'Missus ')
    .replace(/\bMt\.\s/g, 'Mount ')
    .replace(/\bSt\.\s(?=[A-Z])/g, 'Saint ')  // St. followed by capital = Saint
    .replace(/\bNo\.\s*(\d)/g, 'Number $1')
    .replace(/\bc\.\s*(\d{4})/gi, 'circa $1')  // c. 1850 → circa 1850
    // ── Temperature & degrees ────────────────────────────────────────────────
    .replace(/(-?\d[\d.]*)\s*°C\b/g, '$1 degrees Celsius')
    .replace(/(-?\d[\d.]*)\s*°F\b/g, '$1 degrees Fahrenheit')
    .replace(/(-?\d[\d.]*)\s*°/g, '$1 degrees')
    // ── Units ────────────────────────────────────────────────────────────────
    .replace(/\bkm\/h\b/gi, 'kilometres per hour')
    .replace(/\bm\/s\b/gi, 'metres per second')
    .replace(/\bmph\b/gi, 'miles per hour')
    .replace(/\bkph\b/gi, 'kilometres per hour')
    .replace(/\bkm\b/gi, 'kilometres')
    .replace(/\bkg\b/gi, 'kilograms')
    .replace(/\blbs?\b/gi, 'pounds')
    .replace(/\bft\b/gi, 'feet')
    .replace(/\bsq\.\s*/gi, 'square ')
    // ── Currency ─────────────────────────────────────────────────────────────
    .replace(/\$\s*(\d[\d,.]*)(?:\s*billion)/gi, '$1 billion dollars')
    .replace(/\$\s*(\d[\d,.]*)(?:\s*million)/gi, '$1 million dollars')
    .replace(/\$\s*(\d[\d,.]*)/g, '$1 dollars')
    .replace(/£\s*(\d[\d,.]*)(?:\s*billion)/gi, '$1 billion pounds')
    .replace(/£\s*(\d[\d,.]*)(?:\s*million)/gi, '$1 million pounds')
    .replace(/£\s*(\d[\d,.]*)/g, '$1 pounds')
    .replace(/€\s*(\d[\d,.]*)(?:\s*billion)/gi, '$1 billion euros')
    .replace(/€\s*(\d[\d,.]*)(?:\s*million)/gi, '$1 million euros')
    .replace(/€\s*(\d[\d,.]*)/g, '$1 euros')
    // ── Symbols ──────────────────────────────────────────────────────────────
    .replace(/(\d)\s*%/g, '$1 percent')
    .replace(/\s*&\s*/g, ' and ')
    .replace(/#(\d)/g, 'number $1')
    // ── Numbers: remove commas so "1,000" → "1000" (ElevenLabs reads correctly) ─
    .replace(/(\d),(\d{3})/g, '$1$2')
    .replace(/(\d),(\d{3})/g, '$1$2')  // second pass for 1,000,000
    // ── Clean up ──────────────────────────────────────────────────────────────
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildQuestionSpeechText(qData, room) {
  const index     = qData.index ?? qData.currentQuestion ?? null;
  const category  = qData.category || null;
  const subject   = room?.subject || null;
  const intro     = pickQuestionIntro(index, subject, category);
  const optionsSpeech = (qData.options || [])
    .map((opt, i) => `${letters[i]}... ${normalizeForSpeech(opt)}`)
    .join('. ');
  const q = normalizeForSpeech(qData.question);
  return intro ? `${intro} ${q}. ${optionsSpeech}` : `${q}. ${optionsSpeech}`;
}

/** Pick a randomised, optionally themed intro phrase for a question. */
function pickQuestionIntro(index, subject, category) {
  const num = index !== null && index !== undefined ? index + 1 : null;
  const numWord = num !== null ? String(num) : null;

  const generic = numWord ? [
    `Question ${numWord}.`,
    `Alright, question ${numWord}.`,
    `OK — question ${numWord}.`,
    `Here's question ${numWord}.`,
    `Right then, question ${numWord}.`,
    `Next up — question ${numWord}.`,
    `Here comes question ${numWord}.`,
    `Question number ${numWord}.`,
  ] : [
    `Here's your next question.`,
    `Next question.`,
    `Alright, here we go.`,
    `OK — here's your next one.`,
  ];

  // Theme-specific openers (prepended before the question number)
  const theme = category || subject;
  const themedPrefixes = theme ? [
    `${theme} now.`,
    `This one's about ${theme}.`,
    `${theme} question.`,
    `For all you ${theme} fans.`,
    `Here's a ${theme} one.`,
  ] : [];

  // ~40% chance of a themed opener fused with a generic
  if (theme && themedPrefixes.length && Math.random() < 0.4) {
    const prefix = themedPrefixes[Math.floor(Math.random() * themedPrefixes.length)];
    const gen    = generic[Math.floor(Math.random() * generic.length)];
    return `${prefix} ${gen}`;
  }

  return generic[Math.floor(Math.random() * generic.length)];
}

setQuestionStartHook(async (room, qData) => {
  if (!room.voiceEnabled) {
    console.log(`[tts] Skipping audio for Q${qData.index + 1} (R${qData.round}/${qData.totalRounds}) — voice disabled`);
    return;
  }
  const text = buildQuestionSpeechText(qData, room);
  console.log(`[tts] Generating audio for Q${qData.index + 1} (R${qData.round}/${qData.totalRounds}): "${text.slice(0, 80)}..."`);
  const audio = await generateSpeech(text, room.voiceId);
  if (!audio) {
    console.warn(`[tts] ⚠️  Audio generation FAILED for Q${qData.index + 1} (R${qData.round}/${qData.totalRounds}) — sending fallback`);
    // Fallback: send text to client for Web Speech API (free, unlimited, works offline)
    broadcast(room, {
      type: 'question_audio_fallback',
      text: text,
      muteForPlayers: room.mutePlayersOnStart === true,
    });
    return;
  }
  if (room.state !== 'question') {
    console.warn(`[tts] ⚠️  Audio ready but room state changed (${room.state}) — not broadcasting for Q${qData.index + 1} (R${qData.round}/${qData.totalRounds})`);
    return;
  }
  // Send a URL instead of base64 so clients (especially iOS Safari) can play
  // via a normal HTTP fetch — blob URLs and data URIs are unreliable on iOS.
  const cacheKey = getAudioCacheKey(text, room.voiceId);
  console.log(`[tts] ✓ Broadcasting audio URL for Q${qData.index + 1} (R${qData.round}/${qData.totalRounds})`);
  broadcast(room, {
    type: 'question_audio',
    url: `/api/tts/q/${cacheKey}`,
    muteForPlayers: room.mutePlayersOnStart === true,
  });
});

// Round-end hook: generate next round in background, enforce minimum hold time on break screen
const ROUND_BREAK_MIN_MS = 8000;

setRoundEndHook((room, onTimerTick, onTimerEnd, onGameOver) => {
  // ── Chase mode: cash builder round ends → show offer screen ────────────
  if (room.gameMode === 'chase' && room.modeState.phase === 'cash_builder') {
    const cashBuilt = room.modeState.cashBuilt || 0;
    // Generate offers: high = 1.5×, safe = 1×, low = 0
    const offers = {
      high:  Math.round(cashBuilt * 1.5 / 1000) * 1000 || 1500,
      safe:  cashBuilt || 1000,
      low:   0,
    };
    room.modeState.offers = offers;
    room.modeState.phase = 'offer';
    room.state = 'round_break'; // hold on break screen until offer accepted

    broadcast(room, {
      type: 'chase_offer',
      cashBuilt,
      offers,
      modeState: room.modeState,
    });
    return; // don't proceed to normal round generation
  }

  const nextRound = room.currentRound + 1;
  const players   = [...room.players.values()].map(p => p.name);
  const qCount    = room.questionsPerRound;
  const questionsOnly = !room._aiMode;
  const usedQs    = room.usedQuestionTexts || [];

  console.log(`[server] Round ${room.currentRound + 1} ended — generating round ${nextRound + 1} (excluding ${usedQs.length} used questions)`);

  // Clear any cached script from round 1 so generateGame doesn't return stale data
  deleteScript(room.code);

  const breakStarted = Date.now();

  const advance = (questions) => {
    if (room.state !== 'round_break') return;
    const elapsed = Date.now() - breakStarted;
    const wait = Math.max(0, ROUND_BREAK_MIN_MS - elapsed);
    setTimeout(() => {
      if (room.state !== 'round_break') return;
      startNextRound(room, questions, onTimerTick, onTimerEnd, onGameOver);
    }, wait);
  };

  generateGame(room.code, players, qCount, room.subject, room.difficulty, questionsOnly, usedQs)
    .then(script => {
      if (!script || !script.questions?.length) {
        console.warn(`[server] Round ${nextRound + 1} AI gen failed — falling back to static`);
        const { getShuffledQuestions } = require('./src/questions');
        advance(getShuffledQuestions(qCount));
      } else {
        advance(script.questions);
      }
    })
    .catch(err => {
      console.error('[server] Round generation error:', err);
      const { getShuffledQuestions } = require('./src/questions');
      advance(getShuffledQuestions(qCount));
    });
});

// Pre-warm TTS disk cache for all static questions on startup.
// Static questions use no room context so no intro phrase — cached as bare question+options.
// Runs in background — doesn't block server start. Skips any already on disk.
if (hasTtsKey()) {
  const staticItems = QUESTIONS.map(q => ({
    text: buildQuestionSpeechText(q, null),
  }));
  prewarmCache(staticItems).catch(() => {});
}

const PORT = process.env.PORT || 3000;
const BETWEEN_QUESTION_DELAY_MS = process.env.BETWEEN_QUESTION_DELAY_MS ? Number(process.env.BETWEEN_QUESTION_DELAY_MS) : 5000;

app.use(express.json());

// React Native web SPA (built by expo export --platform web, lives in web/ in production)
// Falls back gracefully to the vanilla JS client if the web/ dir doesn't exist.
const fs = require('fs');
const webDir = path.join(__dirname, 'web');
const webDirExists = fs.existsSync(webDir);

// Pre-process index.html at startup to inject Google Analytics if configured.
// GOOGLE_ANALYTICS_ID env var (e.g. G-XXXXXXXXXX) is injected at runtime so
// template users can set their own GA key without rebuilding the image.
let indexHtml = null;
if (webDirExists) {
  const indexPath = path.join(webDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, 'utf8');
    const gaId = process.env.GOOGLE_ANALYTICS_ID;
    if (gaId) {
      const gaSnippet = `<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${gaId}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${gaId}');
</script>`;
      html = html.replace('</head>', `${gaSnippet}\n</head>`);
      console.log(`[server] Google Analytics enabled: ${gaId}`);
    }
    indexHtml = html;
  }
}

// Serve the (potentially GA-injected) index.html for the SPA root and any HTML route.
// Must be registered BEFORE express.static so we serve the processed version.
const sendIndex = (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(indexHtml);
};

if (webDirExists && indexHtml) {
  app.get('/', sendIndex);
  app.get('/index.html', sendIndex);
}

if (webDirExists) {
  // Serve all other static assets (JS chunks, images, fonts, etc.) — not index.html
  app.use(express.static(webDir, {
    index: false, // We handle index.html ourselves above
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html') || filePath.endsWith('.js')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));
}

// Vanilla JS assets (leaderboard page, sounds, legacy web client)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version });
});

// GET /api/whoami?userId=X — returns userId and whether the user is an admin.
// Used by hosts to discover their Strapi user ID for admin configuration.
app.get('/api/whoami', (req, res) => {
  const userId = req.query.userId || null;
  const userFullName = req.query.name || null;
  res.json({
    userId,
    userFullName,
    isAdmin: isAdminUser(userId, userFullName),
    adminHint: ADMIN_USER_IDS.size === 0 && ADMIN_USER_NAMES.size === 0
      ? 'Set ADMIN_USER_IDS or ADMIN_USER_NAMES env vars to configure admins'
      : undefined,
  });
});

// POST /api/admin/clear-question-cache — admin-only endpoint to reset question bank
app.post('/api/admin/clear-question-cache', express.json(), (req, res) => {
  const userId = req.body.userId || req.query.userId || null;
  const userFullName = req.body.name || req.query.name || null;
  
  if (!isAdminUser(userId, userFullName)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  const { clearAllCache } = require('./src/questionBank');
  const success = clearAllCache();
  
  if (success) {
    res.json({ success: true, message: 'Question bank cache cleared' });
  } else {
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// GET /api/admin/question-cache — stats + full question list per bank file
app.get('/api/admin/question-cache', (req, res) => {
  const userId = req.query.userId || null;
  const userFullName = req.query.name || null;
  if (!isAdminUser(userId, userFullName)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const fs = require('fs');
  const path = require('path');
  const { loadQuestions } = require('./src/questionBank');
  const bankDir = path.join(__dirname, 'data/question-bank');

  let banks = [];
  try {
    const files = fs.existsSync(bankDir) ? fs.readdirSync(bankDir).filter(f => f.endsWith('.json')) : [];
    for (const file of files) {
      const raw = JSON.parse(fs.readFileSync(path.join(bankDir, file), 'utf-8'));
      const questions = Array.isArray(raw.questions) ? raw.questions : [];
      const totalUsage = questions.reduce((s, q) => s + (q.usageCount || 0), 0);
      banks.push({
        file,
        subject: raw.subject || 'general',
        difficulty: raw.difficulty || 'medium',
        lastUpdated: raw.lastUpdated,
        count: questions.length,
        totalUsage,
        avgUsage: questions.length ? (totalUsage / questions.length).toFixed(1) : '0',
        questions: questions.map(q => ({
          id: q.id,
          question: q.question,
          options: q.options,
          answer: q.answer,
          category: q.category,
          usageCount: q.usageCount || 0,
          createdAt: q.createdAt,
        })),
      });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  const totalQuestions = banks.reduce((s, b) => s + b.count, 0);
  const totalUsage = banks.reduce((s, b) => s + b.totalUsage, 0);
  res.json({ banks, totalQuestions, totalUsage });
});

// GET /api/ping — lightweight health alias (closes #402)
app.get('/api/ping', (req, res) => {
  res.json({ pong: true });
});

// GET /api/stats — server-wide stats: total rooms, active players, and app version
app.get('/api/stats', (req, res) => {
  const { rooms } = require('./src/rooms');
  let activePlayers = 0;
  for (const room of rooms.values()) {
    activePlayers += room.players.size;
  }
  res.json({ totalGames: rooms.size, activePlayers, version });
});

// GET /api/rooms/public — list lobby rooms that the host has made public
app.get('/api/rooms/public', (req, res) => {
  res.json(getPublicRooms());
});

// POST /api/tts — proxy text → ElevenLabs → MP3 (keeps API key server-side)
// Body: { text: string (max 500 chars) }
app.post('/api/tts', express.json(), async (req, res) => {
  const { text } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text required' });
  }
  if (text.length > 500) {
    return res.status(400).json({ error: 'text too long (max 500 chars)' });
  }
  if (!hasTtsKey()) {
    return res.status(503).json({ error: 'TTS not configured' });
  }
  const audio = await generateSpeech(text.trim());
  if (!audio) return res.status(503).json({ error: 'TTS generation failed' });
  res.set('Content-Type', 'audio/mpeg');
  res.set('Cache-Control', 'no-store');
  res.send(audio);
});

// GET /api/tts/status — whether TTS is available (no key exposed)
app.get('/api/tts/status', (req, res) => {
  res.json({ available: hasTtsKey() });
});

// GET /api/tts/voices — curated list of available host voices
app.get('/api/tts/voices', (req, res) => {
  res.json({ voices: VOICE_OPTIONS });
});

// Clip name → TTS text map (mirrors staticCommentary.js on the client)
const COMMENTARY_CLIPS = {
  'correct-1':  'Brilliant! You knew that one cold.',
  'correct-2':  'Yes! Get in! That\'s the one.',
  'correct-3':  'Spot on! The crowd goes wild!',
  'wrong-1':    'Ooh, unlucky! So close though.',
  'wrong-2':    'Oof! Don\'t worry, plenty more questions to go.',
  'wrong-3':    'Nope! Shake it off — next one\'s yours.',
  'streak-1':   'On fire! Absolutely unstoppable!',
  'streak-2':   'What a streak! Can anyone stop them?',
  'gameover-1': 'And that is game! What a performance from everyone tonight.',
  'gameover-2': 'That\'s all folks! The scores are in — let\'s see who came out on top!',
  'round_break-1': 'That\'s the end of the round! Catch your breath — the next round is coming right up.',
  'round_break-2': 'Round complete! Check the leaderboard and get ready — we\'re not done yet!',
  'round_break-3': 'Great effort everyone! Take a breather while we prepare the next round.',
  'q-intro-1':  'Here we go! Think carefully on this one.',
  'q-intro-2':  'Ooh, this is a good one. No peeking!',
  'q-intro-3':  'Focus up! Points are on the line.',
};

// GET /api/tts/q/:key — serve cached TTS audio by SHA256 key (iOS-safe URL approach)
// The client receives a URL in question_audio WS messages and fetches audio here
// instead of decoding base64, which is unreliable on iOS Safari.
app.get('/api/tts/q/:key', (req, res) => {
  const { key } = req.params;
  if (!/^[a-f0-9]{64}$/.test(key)) return res.status(400).end();
  const filePath = path.join(__dirname, 'data', 'tts-cache', `${key}.mp3`);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(filePath);
});

// GET /api/tts/dynamic — generate TTS for arbitrary short text (named commentary clips)
// Query: ?text=...&voiceId=...
// Cached by voiceId+sha256(text) — same 2-layer cache as generateSpeech
app.get('/api/tts/dynamic', async (req, res) => {
  const { text, voiceId } = req.query;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text required' });
  }
  if (text.length > 300) return res.status(400).json({ error: 'text too long (max 300 chars)' });

  const validVoice = VOICE_OPTIONS.find(v => v.id === voiceId);
  if (!validVoice) return res.status(400).json({ error: 'Unknown voice' });

  try {
    const audio = await generateSpeech(text.trim(), voiceId);
    if (!audio) return res.status(503).json({ error: 'TTS unavailable' });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(audio);
  } catch (err) {
    console.error('[tts/dynamic]', err.message);
    res.status(500).json({ error: 'TTS error' });
  }
});


// Returns MP3 audio for a commentary clip in the requested voice.
// Audio is generated once via ElevenLabs and cached to disk permanently.
app.get('/api/tts/commentary/:voiceId/:clip', async (req, res) => {
  const { voiceId, clip } = req.params;
  const text = COMMENTARY_CLIPS[clip];
  if (!text) return res.status(404).json({ error: 'Unknown clip' });

  const validVoice = VOICE_OPTIONS.find(v => v.id === voiceId);
  if (!validVoice) return res.status(400).json({ error: 'Unknown voice' });

  try {
    const audio = await generateSpeech(text, voiceId);
    if (!audio) return res.status(503).json({ error: 'TTS unavailable' });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(audio);
  } catch (err) {
    console.error('[tts/commentary]', err.message);
    res.status(500).json({ error: 'TTS error' });
  }
});


// GET /api/scores/history — top 10 all-time scores sorted by score descending (60 req/min per IP)
const scoresHistoryLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
  max: Number(process.env.RATE_LIMIT_MAX ?? 60),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many requests' })
});
app.get('/api/scores/history', scoresHistoryLimiter, (req, res) => {
  const DEFAULT_LIMIT = 10;
  const MAX_LIMIT = 50;

  let limit = DEFAULT_LIMIT;
  if (req.query.limit !== undefined) {
    const parsed = Number(req.query.limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      return res.status(400).json({ error: `limit must be an integer between 1 and ${MAX_LIMIT}` });
    }
    limit = parsed;
  }

  const player = req.query.player ? String(req.query.player) : null;
  res.json(getTopScores({ limit, player }));
});

// Validation middleware for POST /api/scores
function validateScorePayload(req, res, next) {
  const { playerId, score, roomId, nickname } = req.body || {};
  if (!playerId || typeof playerId !== 'string') {
    return res.status(400).json({ error: 'playerId is required and must be a string' });
  }
  if (score === undefined || score === null || typeof score !== 'number') {
    return res.status(400).json({ error: 'score is required and must be a number' });
  }
  if (!roomId || typeof roomId !== 'string') {
    return res.status(400).json({ error: 'roomId is required and must be a string' });
  }
  if (nickname !== undefined && typeof nickname !== 'string') {
    return res.status(400).json({ error: 'nickname must be a string' });
  }
  next();
}

// POST /api/scores — record a player's score
app.post('/api/scores', validateScorePayload, (req, res) => {
  const { playerId, score, roomId, nickname } = req.body;
  const resolvedNickname = nickname || playerId;
  recordScore({ playerName: playerId, roomId, score, timestamp: new Date().toISOString(), nickname: resolvedNickname });
  res.status(200).json({ playerId, score, roomId, nickname: resolvedNickname, recorded: true });
});

// GET /api/leaderboard — top 10 scores across all rooms sorted by score descending
app.get('/api/leaderboard', (req, res) => {
  res.json(getTopScores(10));
});

// GET /leaderboard — serve the leaderboard HTML page (closes #431)
app.get('/leaderboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'leaderboard.html'));
});

/**
 * GET /auth-popup — OAuth relay page for native app (iOS/Android)
 *
 * expo-web-browser opens this page in a system browser.
 * It runs the FB JS SDK (no redirect_uri registration required),
 * exchanges the token with Strapi, then redirects back to the app
 * via deep link: trivianight://auth?jwt=...
 */
const STRAPI_URL_SERVER = process.env.STRAPI_URL || 'https://auth.alphinium.io';
app.get('/auth-popup', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Sign in — Trivia Night</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f0f1a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}
    .card{background:#1a1a2e;border-radius:20px;padding:36px 28px;max-width:360px;width:92%;text-align:center}
    h1{font-size:26px;font-weight:700;margin-bottom:6px}
    p{color:#a0a0c0;font-size:14px;margin-bottom:28px}
    button{width:100%;padding:15px;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:12px}
    .fb{background:#1877F2;color:#fff}
    .google{background:#fff;color:#3c4043;border:1px solid #dadce0}
    .status{color:#a0a0c0;font-size:13px;margin-top:18px;min-height:22px}
    .spinner{display:none;margin:16px auto;width:28px;height:28px;border:3px solid #2e2e4a;border-top-color:#6c63ff;border-radius:50%;animation:spin .7s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
  </style>
  <script>
    window.fbAsyncInit=function(){FB.init({appId:'1278485494007756',cookie:true,xfbml:true,version:'v25.0'})};
    (function(d,s,id){var js,fjs=d.getElementsByTagName(s)[0];if(d.getElementById(id))return;js=d.createElement(s);js.id=id;js.src='https://connect.facebook.net/en_US/sdk.js';fjs.parentNode.insertBefore(js,fjs)}(document,'script','facebook-jssdk'));

    function setStatus(msg){document.getElementById('status').textContent=msg}
    function setSpinner(on){document.getElementById('spinner').style.display=on?'block':'none'}

    function loginFacebook(){
      setSpinner(true);setStatus('');
      FB.login(function(r){
        if(r.authResponse&&r.authResponse.accessToken){
          setStatus('Signing you in\u2026');
          fetch('${STRAPI_URL_SERVER}/api/auth/facebook/callback?access_token='+r.authResponse.accessToken)
            .then(function(res){return res.json()})
            .then(function(data){
              if(data.jwt){
                var u=data.user||{};
                var params='jwt='+encodeURIComponent(data.jwt)+'&email='+encodeURIComponent(u.email||'')+'&username='+encodeURIComponent(u.username||'')+'&firstname='+encodeURIComponent(u.firstname||'');
                window.location.href='trivianight://auth?'+params;
              } else {
                setSpinner(false);setStatus((data.error&&data.error.message)||'Login failed.');
              }
            })
            .catch(function(){setSpinner(false);setStatus('Network error. Try again.')});
        } else {
          setSpinner(false);
          if(r.status!=='unknown')setStatus('Login cancelled.');
        }
      },{scope:'email,public_profile'});
    }

    function loginGoogle(){
      setSpinner(true);setStatus('Logging in with Google\u2026');
      var redirect=encodeURIComponent(window.location.href+'?provider=google');
      window.location.href='${STRAPI_URL_SERVER}/api/connect/google?redirect='+redirect;
    }

    // Handle OAuth callback from Strapi (Google only — FB uses SDK)
    window.onload=function(){
      var params=new URLSearchParams(window.location.search);
      var provider=params.get('provider');
      var access_token=params.get('access_token');
      if(provider==='google'&&access_token){
        setSpinner(true);setStatus('Completing sign in\u2026');
        fetch('${STRAPI_URL_SERVER}/api/auth/google/callback?access_token='+access_token)
          .then(function(res){return res.json()})
          .then(function(data){
            if(data.jwt){
              var u=data.user||{};
              var p='jwt='+encodeURIComponent(data.jwt)+'&email='+encodeURIComponent(u.email||'')+'&username='+encodeURIComponent(u.username||'')+'&firstname='+encodeURIComponent(u.firstname||'');
              window.location.href='trivianight://auth?'+p;
            }else{
              setSpinner(false);setStatus((data.error&&data.error.message)||'Login failed.');
            }
          })
          .catch(function(){setSpinner(false);setStatus('Network error. Try again.')});
      }
    }
  </script>
</head><body>
  <div class="card">
    <h1>🎯 Trivia Night</h1>
    <p>Sign in to save your scores &amp; history</p>
    <button class="fb" onclick="loginFacebook()">
      <span style="font-size:20px">📘</span> Continue with Facebook
    </button>
    <button class="google" onclick="loginGoogle()">
      <span style="font-size:20px">🔵</span> Continue with Google
    </button>
    <div class="spinner" id="spinner"></div>
    <div class="status" id="status"></div>
  </div>
</body></html>`);
});

/**
 * GET /auth/callback — OAuth callback for web platform
 * Strapi redirects here with access_token after Google/Facebook OAuth
 * We exchange it for a JWT and store in the client
 */
app.get('/auth/callback', async (req, res) => {
  const { access_token } = req.query;
  if (!access_token) {
    return res.send(`<!DOCTYPE html>
<html><body style="font-family:sans-serif;padding:40px;text-align:center">
  <h2>❌ Login Failed</h2>
  <p>No access token received.</p>
  <p><a href="/">Return to Home</a></p>
</body></html>`);
  }

  try {
    // Exchange access_token for JWT from Strapi
    const strapiRes = await fetch(`${STRAPI_URL_SERVER}/api/auth/google/callback?access_token=${access_token}`);
    const data = await strapiRes.json();

    if (data.jwt) {
      // Success: store JWT and redirect to app
      return res.send(`<!DOCTYPE html>
<html><head><title>Login Successful</title></head>
<body style="font-family:sans-serif;padding:40px;text-align:center">
  <h2>✓ Signed In</h2>
  <p>Redirecting to app...</p>
  <script>
    localStorage.setItem('jwt', '${data.jwt}');
    localStorage.setItem('user', JSON.stringify(${JSON.stringify(data.user || {})}));
    setTimeout(function(){ window.location.href='/'; }, 1000);
  </script>
</body></html>`);
    } else {
      throw new Error(data.error?.message || 'Authentication failed');
    }
  } catch (err) {
    console.error('[auth/callback] Error:', err);
    return res.send(`<!DOCTYPE html>
<html><body style="font-family:sans-serif;padding:40px;text-align:center">
  <h2>❌ Login Failed</h2>
  <p>${err.message || 'Unknown error'}</p>
  <p><a href="/">Try Again</a></p>
</body></html>`);
  }
});

// Map internal room states to the API-facing state names
function apiRoomState(state) {
  if (state === 'lobby') return 'waiting';
  if (state === 'finished') return 'finished';
  return 'in-progress';
}

// POST /api/rooms — create a new room; returns join code and host token
app.post('/api/rooms', (req, res) => {
  const hostName = (req.body && req.body.name) ? String(req.body.name).trim() : 'Host';
  const { room, playerId: hostToken } = createRoomHttp(hostName);

  if (req.body && req.body.adsEnabled === true) room.adsEnabled = true;

  if (req.body && req.body.questionTimeSecs !== undefined) {
    const err = validateTimerSeconds(req.body.questionTimeSecs);
    if (err) return res.status(400).json({ error: err });
    room.questionTimeSecs = req.body.questionTimeSecs;
  }

  res.status(201).json({
    code: room.code,
    hostToken,
    state: apiRoomState(room.state),
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score }))
  });
});

// POST /api/rooms/:code/join — join a room by code; returns player token
app.post('/api/rooms/:code/join', (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const playerName = (req.body && req.body.name) ? String(req.body.name).trim() : 'Player';

  const result = joinRoomHttp(code, playerName);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  const { room, playerId: playerToken } = result;
  const playerList = [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score }));
  broadcast(room, { type: 'player_joined', players: playerList });
  res.status(200).json({
    playerToken,
    code: room.code,
    state: apiRoomState(room.state),
    players: playerList
  });
});

// POST /api/rooms/:roomId/timer — set question timer duration (host only, lobby only)
app.post('/api/rooms/:roomId/timer', (req, res) => {
  const code = String(req.params.roomId).toUpperCase();
  const room = getRoom(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  if (room.started || room.state !== 'lobby') {
    return res.status(400).json({ error: 'Cannot change timer after game has started' });
  }

  const { hostToken } = req.body || {};
  if (!hostToken || room.hostId !== hostToken) {
    return res.status(403).json({ error: 'Only the host can set the timer' });
  }

  const rawDuration = (req.body.duration === undefined || req.body.duration === null)
    ? 30
    : req.body.duration;
  const duration = Number(rawDuration);
  if (!Number.isInteger(duration) || duration < 10 || duration > 120) {
    return res.status(400).json({ error: 'duration must be an integer between 10 and 120' });
  }

  room.questionTimeSecs = duration;
  res.status(200).json({ duration });
});

// POST /api/rooms/:code/start — start the game for a room (host only)
app.post('/api/rooms/:code/start', (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const room = getRoom(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const { hostToken } = req.body || {};
  if (!hostToken) return res.status(400).json({ error: 'hostToken required' });
  if (room.hostId !== hostToken) return res.status(403).json({ error: 'Only the host can start the game' });

  if (req.body.questionTimeSecs !== undefined) {
    const err = validateTimerSeconds(req.body.questionTimeSecs);
    if (err) return res.status(400).json({ error: err });
    room.questionTimeSecs = req.body.questionTimeSecs;
  }

  if (!startGame(room, onTimerTick, onTimerEnd, onGameOver)) {
    return res.status(409).json({ error: 'Cannot start game in current state' });
  }

  res.status(200).json({
    code: room.code,
    state: apiRoomState(room.state),
    questionTimeSecs: room.questionTimeSecs
  });
});

// DELETE /api/rooms/:id — delete a room and all its associated data
app.delete('/api/rooms/:id', (req, res) => {
  const code = String(req.params.id).toUpperCase();
  const deleted = deleteRoom(code);
  if (!deleted) return res.status(404).json({ error: 'Room not found' });
  deleteScript(code); // clean up any AI game script for this room

  res.status(200).json({
    code: deleted.code,
    state: apiRoomState(deleted.state),
    players: [...deleted.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score }))
  });
});

// POST /api/rooms/:code/answer — submit a player's answer via HTTP and broadcast score-update
app.post('/api/rooms/:code/answer', (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const room = getRoom(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const { playerToken, answer } = req.body || {};
  if (!playerToken) return res.status(400).json({ error: 'playerToken required' });
  if (answer === undefined || answer === null) return res.status(400).json({ error: 'answer required' });

  const result = submitAnswer(room, playerToken, answer);
  if (result.error) return res.status(400).json({ error: result.error });

  broadcast(room, {
    type: 'score-update',
    leaderboard: getLeaderboard(room)
  });

  if (result.allAnswered && room.state === 'question') {
    if (room.timer) {
      clearInterval(room.timer);
      room.timer = null;
    }
    room.state = 'leaderboard';
    onTimerEnd(room, onTimerTick, onTimerEnd, onGameOver);
  }

  res.json({ correct: result.correct, points: result.points, correctAnswer: result.correctAnswer, streak: result.streak, multiplier: result.multiplier });
});

// Timer callbacks
function onTimerTick(room, remaining) {
  broadcast(room, { type: 'timer_tick', remaining });
}

function onGameOver() {
  const topScores = getTopScores(10);
  const leaderboard = topScores.map((entry, i) => ({
    rank: i + 1,
    name: entry.nickname,
    score: entry.score,
    date: entry.timestamp,
  }));
  const msg = JSON.stringify({ type: 'persistent_leaderboard_update', leaderboard });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

// Store timer hooks globally so async WS handlers (e.g. chase_accept_offer) can reference them
global._triviaHooks = [onTimerTick, onTimerEnd, onGameOver];

function onTimerEnd(room, onTick, onEnd, onGameOver) {
  const q = room.questions[room.currentQuestion];
  const leaderboard = getLeaderboard(room);
  broadcast(room, {
    type: 'question_end',
    correctAnswer: q.answer,
    leaderboard
  });
  broadcast(room, { type: 'leaderboard_update', leaderboard });
  room.state = 'leaderboard';

  // Advance to next question after 5 seconds; store ID so deleteRoom can cancel it
  room.leaderboardTimer = setTimeout(() => {
    room.leaderboardTimer = null;
    if (room.state === 'leaderboard') {
      room.state = 'question';
      nextQuestion(room, onTick, onEnd, onGameOver);
    }
  }, BETWEEN_QUESTION_DELAY_MS);
}

// WebSocket message handlers
wss.on('connection', (ws) => {
  let playerId = null;
  let roomCode = null;
  let spectatorId = null;

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'reconnect': {
        // Allow players created via HTTP to attach their WebSocket session
        if (!msg.playerId) {
          ws.send(JSON.stringify({ type: 'error', message: 'playerId required for reconnect' }));
          return;
        }
        const room = attachPlayerWs(msg.playerId, ws);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
          return;
        }
        playerId = msg.playerId;
        roomCode = room.code;
        const isHost = room.hostId === playerId;
        const reconnectMsg = {
          type: 'reconnected',
          code: roomCode,
          playerId,
          isHost,
          state: room.state,
          gameMode: room.gameMode || 'classic',
          modeState: room.modeState || {},
          players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score })),
          spectatorModeEnabled: room.spectatorModeEnabled,
          spectatorCount: getSpectatorCount(room),
          voiceEnabled: room.voiceEnabled !== false,
          voiceAnswers: room.voiceAnswers === true,
          mutePlayersOnStart: room.mutePlayersOnStart === true,
        };
        // If generation is in-flight (room in lobby but AI is generating), tell client to show the loading screen
        if (room.state === 'lobby' && room.generating) {
          reconnectMsg.generating = true;
          reconnectMsg.subject = room.generatingSubject || null;
          reconnectMsg.difficulty = room.generatingDifficulty || 'medium';
          reconnectMsg.aiMode = room.generatingAiMode || false;
        }
        // If mid-question, include current question so reconnecting clients aren't stuck on a blank screen
        if (room.state === 'question' && room.currentQuestion >= 0 && room.questions[room.currentQuestion]) {
          const q = room.questions[room.currentQuestion];
          const elapsed = (Date.now() - room.timerStartedAt) / 1000;
          reconnectMsg.currentQuestion = {
            index: room.currentQuestion,
            total: room.questions.length,
            question: q.question,
            options: q.options,
            category: q.category,
            timeRemaining: Math.max(0, room.questionTimeSecs - elapsed)
          };
        }
        ws.send(JSON.stringify(reconnectMsg));
        break;
      }

      case 'create_room': {
        const { room, playerId: pid } = createRoom(ws, msg.name || 'Host');
        if (msg.adsEnabled === true) room.adsEnabled = true;
        playerId = pid;
        roomCode = room.code;
        ws.send(JSON.stringify({
          type: 'room_created',
          code: room.code,
          playerId,
          isHost: true,
          gameMode: room.gameMode,
          modeState: room.modeState,
          voiceId: room.voiceId,
          voiceAnswers: room.voiceAnswers === true,
          players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score }))
        }));
        break;
      }

      case 'join_room': {
        const result = joinRoom(msg.code, ws, msg.name || 'Player');
        if (result.error) {
          ws.send(JSON.stringify({ type: 'error', message: result.error }));
          return;
        }
        playerId = result.playerId;
        roomCode = result.room.code;
        const playerList = [...result.room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score }));
        ws.send(JSON.stringify({
          type: 'room_joined',
          code: roomCode,
          playerId,
          isHost: false,
          gameMode: result.room.gameMode,
          modeState: result.room.modeState,
          voiceId: result.room.voiceId,
          banterEnabled: result.room.banterEnabled,
          voiceAnswers: result.room.voiceAnswers === true,
          players: playerList
        }));
        // Notify existing players
        broadcast(result.room, { type: 'player_joined', players: playerList });
        break;
      }

      case 'set_public': {
        const room = getRoomByPlayer(playerId);
        if (!room || room.hostId !== playerId) break;
        room.isPublic = msg.isPublic === true;
        ws.send(JSON.stringify({ type: 'room_public_updated', isPublic: room.isPublic }));
        break;
      }

      case 'set_voice': {
        const room = getRoomByPlayer(playerId);
        if (!room || room.hostId !== playerId) break;
        room.voiceEnabled = msg.voiceEnabled !== false; // default true
        broadcast(room, { type: 'voice_updated', voiceEnabled: room.voiceEnabled });
        break;
      }
      
      case 'set_banter': {
        const room = getRoomByPlayer(playerId);
        if (!room || room.hostId !== playerId) break;
        room.banterEnabled = msg.banterEnabled !== false; // default true
        broadcast(room, { type: 'banter_updated', banterEnabled: room.banterEnabled });
        break;
      }

      case 'set_voice_answers': {
        const room = getRoomByPlayer(playerId);
        if (!room || room.hostId !== playerId) break;
        room.voiceAnswers = msg.voiceAnswers === true;
        broadcast(room, { type: 'voice_answers_updated', voiceAnswers: room.voiceAnswers });
        break;
      }

      // Chase mode: contestant accepts an offer (high/safe/low) after cash builder round
      case 'chase_accept_offer': {
        const room = getRoomByPlayer(playerId);
        if (!room || room.gameMode !== 'chase') break;
        if (room.modeState.phase !== 'offer') break;

        const { offerType } = msg; // 'high' | 'safe' | 'low'
        const offers = room.modeState.offers || {};
        const acceptedAmount = offers[offerType] ?? room.modeState.cashBuilt;

        room.modeState.offer = acceptedAmount;
        room.modeState.acceptedOfferType = offerType;
        room.modeState.phase = 'chase';
        // Set gap: high offer → chaser starts 4 steps back; safe → 3; low → 2
        room.modeState.chaserGap = offerType === 'high' ? 4 : offerType === 'low' ? 2 : 3;
        room.modeState.contestantSteps = 0;
        room.modeState.chaserSteps = 0;
        room.modeState.chaserWon = false;
        room.questionsPerRound = 6; // chase round has 6 questions

        broadcast(room, { type: 'chase_offer_accepted', offerType, offer: acceptedAmount, modeState: room.modeState });

        // Start chase round: generate fresh questions
        const players = [...room.players.values()].map(p => p.name);
        const usedQs  = room.usedQuestionTexts || [];
        const { generateGame } = require('./src/gameScript');
        const { getShuffledQuestions } = require('./src/questions');
        room.state = 'round_break';

        generateGame(room.code, players, room.questionsPerRound, room.subject, room.difficulty, !room._aiMode, usedQs)
          .then(script => {
            const questions = script?.questions?.length ? script.questions : getShuffledQuestions(room.questionsPerRound);
            startNextRound(room, questions, ...global._triviaHooks);
          })
          .catch(() => {
            startNextRound(room, getShuffledQuestions(room.questionsPerRound), ...global._triviaHooks);
          });

        broadcast(room, { type: 'chase_phase_start', phase: 'chase', modeState: room.modeState });
        break;
      }

      case 'set_host_voice': {
        const room = getRoomByPlayer(playerId);
        if (!room || room.hostId !== playerId) break;
        // Validate against known voice list
        const valid = VOICE_OPTIONS.find(v => v.id === msg.voiceId);
        if (!valid) break;
        room.voiceId = msg.voiceId;
        // Broadcast so all players know (useful if they display the host name)
        broadcast(room, { type: 'host_voice_updated', voiceId: room.voiceId });
        break;
      }

      case 'set_mute_players': {
        const room = getRoomByPlayer(playerId);
        if (!room || room.hostId !== playerId) break;
        room.mutePlayersOnStart = msg.muted === true;
        broadcast(room, { type: 'mute_players_updated', muted: room.mutePlayersOnStart });
        break;
      }

      case 'set_game_mode': {
        const room = getRoomByPlayer(playerId);
        if (!room || room.hostId !== playerId) break;
        if (room.state !== 'lobby') break; // Can only change mode in lobby
        const validModes = ['classic', 'millionaire', 'buzzer', 'chase'];
        if (!validModes.includes(msg.gameMode)) break;
        
        room.gameMode = msg.gameMode;
        
        // Initialize mode-specific state
        if (msg.gameMode === 'millionaire') {
          room.modeState = {
            currentLevel: 0,
            safeHaven: 0,
            lifelines: { fiftyFifty: true, audience: true, phone: true },
            moneyLadder: [100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000],
          };
          room.questionsPerRound = 15; // Override for Millionaire
        } else if (msg.gameMode === 'buzzer') {
          room.modeState = {
            buzzOrder: [],
            lockedPlayer: null,
            eliminatedPlayers: [],
          };
        } else if (msg.gameMode === 'chase') {
          const cashBuilderQs = 5; // questions in cash builder round
          room.modeState = {
            phase: 'cash_builder',         // cash_builder → offer → chase
            cashBuilt: 0,                  // accumulated in cash builder
            offer: 0,                      // the offer accepted
            cashBuilderQs,
            chaserGap: 3,                  // chaser starts N steps behind contestant
            contestantSteps: 0,            // steps gained in chase round
            chaserSteps: 0,                // chaser steps in chase round
            chaserAnswered: false,
            chaserWon: false,
          };
          room.questionsPerRound = cashBuilderQs;
          // Chase needs 2 "rounds": cash builder (round 0) + chase (round 1)
          // Without this, end of cash builder = isLastRound=true → game over
          room.totalRounds = 2;
        } else {
          room.modeState = {};
        }
        
        broadcast(room, { 
          type: 'game_mode_updated', 
          gameMode: room.gameMode,
          modeState: room.modeState 
        });
        break;
      }

      case 'use_lifeline': {
        const room = getRoomByPlayer(playerId);
        if (!room || room.gameMode !== 'millionaire' || room.state !== 'question') break;
        
        const lifeline = msg.lifeline; // 'fiftyFifty' | 'audience' | 'phone'
        if (!room.modeState.lifelines[lifeline]) break; // Already used
        
        room.modeState.lifelines[lifeline] = false;
        
        const q = room.questions[room.currentQuestion];
        let result = {};
        
        if (lifeline === 'fiftyFifty') {
          // Remove 2 wrong answers
          const wrongOptions = q.options
            .map((opt, idx) => idx)
            .filter(idx => idx !== q.correct);
          const toRemove = wrongOptions.slice(0, 2);
          result.removedOptions = toRemove;
        } else if (lifeline === 'audience') {
          // Simulate audience vote (bias toward correct answer)
          const percentages = [0, 0, 0, 0];
          let remaining = 100;
          percentages[q.correct] = 40 + Math.floor(Math.random() * 30); // 40-70%
          remaining -= percentages[q.correct];
          for (let i = 0; i < 4; i++) {
            if (i !== q.correct) {
              const val = Math.floor(Math.random() * (remaining / 2));
              percentages[i] = val;
              remaining -= val;
            }
          }
          percentages[0] += remaining; // Add remainder to first option
          result.percentages = percentages;
        } else if (lifeline === 'phone') {
          // AI-generated hint (simplified - just give a hint string)
          result.hint = `I think the answer might be ${q.options[q.correct]}, but I'm not 100% sure...`;
        }
        
        broadcast(room, {
          type: 'lifeline_used',
          lifeline,
          lifelines: room.modeState.lifelines,
          result
        });
        break;
      }

      case 'walk_away': {
        const room = getRoomByPlayer(playerId);
        if (!room || room.gameMode !== 'millionaire') break;
        
        const winnings = room.modeState.safeHaven;
        const player = room.players.get(playerId);
        if (player) player.score = winnings;
        
        room.state = 'gameover';
        broadcast(room, {
          type: 'walked_away',
          playerId,
          winnings,
          leaderboard: [...room.players.values()]
            .map(p => ({ name: p.name, score: p.score }))
            .sort((a, b) => b.score - a.score)
        });
        break;
      }

      case 'buzz': {
        const room = getRoomByPlayer(playerId);
        if (!room || room.gameMode !== 'buzzer') break;
        if (room.state !== 'question') break;

        const buzzState = room.modeState;
        // Ignore if already locked to another player
        if (buzzState.lockedPlayer) break;

        const timestamp = Date.now();
        buzzState.buzzOrder = buzzState.buzzOrder || [];
        buzzState.buzzOrder.push({ playerId, timestamp });
        buzzState.lockedPlayer = playerId;

        broadcast(room, {
          type: 'player_buzzed',
          playerId,
          timestamp,
          buzzOrder: buzzState.buzzOrder,
          modeState: buzzState,
        });
        break;
      }

      case 'join_spectator': {
        const room = getRoom(msg.code);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
          return;
        }
        if (!room.spectatorModeEnabled) {
          ws.send(JSON.stringify({ type: 'error', message: 'Spectator mode is disabled for this session' }));
          return;
        }
        const { spectatorId: sid } = joinAsSpectator(room, ws);
        spectatorId = sid;
        roomCode = room.code;
        ws.send(JSON.stringify({ type: 'spectator_joined', spectatorId, code: roomCode }));
        broadcastToHost(room, { type: 'spectator_count', count: getSpectatorCount(room) });
        break;
      }

      case 'start_game': {
        const room = getRoomByPlayer(playerId);
        if (!room || room.hostId !== playerId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Only the host can start the game' }));
          return;
        }
        if (room.state !== 'lobby') {
          ws.send(JSON.stringify({ type: 'error', message: 'Cannot start game in current state' }));
          return;
        }

        // Always use AI for question generation.
        // aiMode controls whether Quiz Master commentary is included.
        const players    = [...room.players.values()].map(p => p.name);
        const subject    = msg.subject    || null;
        const difficulty = msg.difficulty || 'medium';
        const aiMode     = msg.aiMode === true;
        const userId     = msg.userId || null;
        const userFullName = msg.userFullName || null;
        const testMode   = msg.testMode === true;
        const mutePlayersOnStart = msg.mutePlayersOnStart === true;

        // Validate and clamp rounds settings
        const numRounds = Math.min(ROUNDS_MAX, Math.max(ROUNDS_MIN,
          Number.isInteger(msg.numRounds) ? msg.numRounds : 1));
        const questionsPerRound = Math.min(QPR_MAX, Math.max(QPR_MIN,
          Number.isInteger(msg.questionsPerRound) ? msg.questionsPerRound : 4));

        // Admin bypass: skip credit check for configured admin users
        const adminUser = !testMode && isAdminUser(userId, userFullName);

        // Credit enforcement — 1 credit per AI Quiz Master game
        if (aiMode && !adminUser && userId && process.env.PAYMENTS_API_URL && process.env.TRIVIA_API_SECRET) {
          try {
            const deductRes = await fetch(
              `${process.env.PAYMENTS_API_URL}/api/trivia/credits/${encodeURIComponent(userId)}/deduct`,
              { method: 'POST', headers: { 'x-trivia-secret': process.env.TRIVIA_API_SECRET } }
            );
            if (deductRes.status === 402) {
              ws.send(JSON.stringify({ type: 'insufficient_credits' }));
              return;
            }
          } catch (e) {
            console.warn('[server] Credit deduction failed (proceeding):', e.message);
          }
        }

        if (adminUser) console.log(`[server] Admin user${testMode ? ' (test mode)' : ''}: ${userFullName || userId}`);

        // Store settings on room
        room.subject = subject;
        room.difficulty = difficulty;
        room.mutePlayersOnStart = mutePlayersOnStart;
        room.totalRounds = numRounds;
        room.questionsPerRound = questionsPerRound;
        room._aiMode = aiMode; // used by round-end hook

        const totalQuestions = numRounds * questionsPerRound;

        // ── Non-AI, no subject: use static question bank — instant, free ──
        if (!aiMode && !subject) {
          const { getShuffledQuestions } = require('./src/questions');
          const questions = getShuffledQuestions(questionsPerRound); // Round 1 only; subsequent rounds auto-generated
          if (!startGame(room, onTimerTick, onTimerEnd, onGameOver, questions)) {
            broadcast(room, { type: 'error', message: 'Cannot start game in current state' });
            return;
          }
          broadcast(room, {
            type: 'game_script_ready',
            intro: null,
            numQuestions: questionsPerRound,
            numRounds,
            totalQuestions,
            aiMode: false,
          });
          return;
        }

        // ── AI or subject-themed: generate Round 1 via LLM ──
        const questionsOnly = !aiMode;
        const preGenScript = getScript(room.code);
        if (preGenScript) {
          const matches = preGenScript._subject === subject &&
                          preGenScript._difficulty === difficulty &&
                          preGenScript._questionsOnly === questionsOnly;
          if (!matches) {
            console.log(`[server] 🔄 start_game: cache mismatch for room ${room.code} — busting`);
            deleteScript(room.code);
          }
        }

        checkLLMHealth().then((healthy) => {
          if (!healthy) {
            broadcast(room, { type: 'ai_mode_failed', message: 'AI service is currently unavailable. Please try again in a moment.' });
            return;
          }

          broadcast(room, { type: 'ai_generating', playerCount: players.length, subject, difficulty, aiMode, numRounds, questionsPerRound });
          room.generating = true;
          room.generatingSubject = subject;
          room.generatingDifficulty = difficulty;
          room.generatingAiMode = aiMode;

          generateGame(room.code, players, questionsPerRound, subject, difficulty, questionsOnly).then((script) => {
            room.generating = false;
            if (!script) {
              broadcast(room, { type: 'ai_mode_failed', message: 'AI is busy with another game — please wait a moment and try again' });
              return;
            }
            if (!startGame(room, onTimerTick, onTimerEnd, onGameOver, script.questions)) {
              broadcast(room, { type: 'error', message: 'Cannot start game in current state' });
              return;
            }
            broadcast(room, {
              type: 'game_script_ready',
              intro: script.intro,
              numQuestions: questionsPerRound,
              numRounds,
              totalQuestions,
              aiMode,
            });
          }).catch((err) => {
            room.generating = false;
            console.error('[server] AI generation error:', err);
            broadcast(room, { type: 'ai_mode_failed', message: 'AI error — please try again' });
          });
        });
        return; // async
      }

      case 'cancel_game_start': {
        const room = getRoomByPlayer(playerId);
        if (!room || room.hostId !== playerId) return;
        // Reset room state back to lobby so players can try again
        if (room.state === 'lobby') {
          broadcast(room, {
            type: 'ai_mode_failed',
            message: 'Game start cancelled by host.',
            cancelled: true,
          });
        }
        break;
      }

      case 'submit_answer': {
        const room = getRoomByPlayer(playerId);
        console.log(`[submit_answer] playerId=${playerId?.slice(0,8)} room=${room?.code || 'NULL'} mode=${room?.gameMode} phase=${room?.modeState?.phase} state=${room?.state} players=${room?.players?.size} answered=${room?.answeredThisRound?.size}`);
        if (!room) return;
        const result = submitAnswer(room, playerId, msg.answer);
        console.log(`[submit_answer] result: allAnswered=${result.allAnswered} error=${result.error} correct=${result.correct}`);
        if (result.error) {
          ws.send(JSON.stringify({ type: 'error', message: result.error }));
          return;
        }
        ws.send(JSON.stringify({ type: 'answer_result', ...result }));

        // Buzzer mode: if wrong, broadcast unlock so others can buzz
        if (result.unlocked) {
          broadcast(room, {
            type: 'buzzer_unlocked',
            playerId,
            modeState: result.modeState,
          });
        }
        
        // Generate AI banter if enabled
        if (room.banterEnabled !== false && room.voiceEnabled && result.isCorrect !== undefined) {
          const player = room.players.get(playerId);
          if (player) {
            const question = room.questions[room.currentQuestion];
            const context = {
              playerName: player.name || 'Player',
              question: question.question,
              isCorrect: result.isCorrect,
              streak: player.streak || 0,
              timeRemaining: result.timeRemaining || 0,
              totalTime: room.questionTimeSecs || 30,
            };
            
            // Generate banter asynchronously (don't block answer flow)
            generateBanter(context).then(async (banterText) => {
              if (banterText && room.state === 'question') {
                // Generate TTS audio
                const { generateSpeech, getAudioCacheKey } = require('./src/tts');
                const audio = await generateSpeech(banterText, room.voiceId);
                if (audio) {
                  const cacheKey = getAudioCacheKey(banterText, room.voiceId);
                  broadcast(room, {
                    type: 'banter_audio',
                    url: `/api/tts/q/${cacheKey}`,
                    text: banterText,
                    playerName: player.name,
                  });
                }
              }
            }).catch(err => {
              console.warn('[banter] Generation failed:', err.message);
            });
          }
        }
        
        // Broadcast score-update to all players in the room after each answer
        broadcast(room, {
          type: 'score-update',
          leaderboard: getLeaderboard(room)
        });
        if (result.allAnswered && room.state === 'question') {
          if (room.timer) {
            clearInterval(room.timer);
            room.timer = null;
          }
          room.state = 'leaderboard';
          onTimerEnd(room, onTimerTick, onTimerEnd, onGameOver);
        }
        break;
      }

      case 'toggle_spectator_mode': {
        const room = getRoomByPlayer(playerId);
        if (!room || room.hostId !== playerId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Only the host can toggle spectator mode' }));
          return;
        }
        room.spectatorModeEnabled = !!msg.enabled;
        if (!room.spectatorModeEnabled) {
          disconnectAllSpectators(room, 'Spectator mode has been disabled by the host');
        }
        ws.send(JSON.stringify({
          type: 'spectator_mode_updated',
          spectatorModeEnabled: room.spectatorModeEnabled,
          spectatorCount: getSpectatorCount(room)
        }));
        break;
      }

      case 'set_timer': {
        const room = getRoomByPlayer(playerId);
        if (!room || room.hostId !== playerId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Only the host can set the timer' }));
          return;
        }
        if (room.state !== 'lobby') {
          ws.send(JSON.stringify({ type: 'error', message: 'Timer can only be set while in the lobby' }));
          return;
        }
        const timerErr = validateTimerSeconds(msg.seconds);
        if (timerErr) {
          ws.send(JSON.stringify({ type: 'error', message: timerErr }));
          return;
        }
        room.questionTimeSecs = msg.seconds;
        broadcast(room, { type: 'timer_updated', seconds: msg.seconds });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (spectatorId && roomCode) {
      const room = getRoom(roomCode);
      if (room) {
        removeSpectator(room, spectatorId);
        broadcastToHost(room, { type: 'spectator_count', count: getSpectatorCount(room) });
      }
    } else if (playerId && roomCode) {
      const room = getRoomByPlayer(playerId);
      if (room) {
        if (room.state === 'lobby') {
          // Remove the player from the room and notify remaining players
          room.players.delete(playerId);
          const playerList = [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score }));
          broadcast(room, { type: 'player_left', players: playerList });
        } else {
          const player = room.players.get(playerId);
          if (player) player.ws = null;
        }
      }
    }
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Trivia Night server running on port ${PORT}`);
    console.log(`Loaded ${getLoadedCount()} historical scores from disk`);
  });
}

// SPA catch-all — serve index.html for any non-API, non-asset path so
// React Navigation can handle client-side routing on page refresh/deep-link.
// Only active when the React Native web build (web/) is present.
if (webDirExists && indexHtml) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/_expo/')) return next();
    sendIndex(req, res);
  });
}

module.exports = { app, server };
