/**
 * tts.js — ElevenLabs text-to-speech helper (server-side)
 *
 * Proxies text → ElevenLabs → MP3 buffer.
 * Returns null (gracefully) when key is not configured or generation fails.
 *
 * Caching (two layers):
 *  1. In-memory Map: zero-cost hits within a server session.
 *  2. Disk cache (data/tts-cache/): survives server restarts/redeploys.
 *     Static question audio is pre-warmed on startup so GKE rollouts don't
 *     burn ElevenLabs credits regenerating the same questions every time.
 *
 * Voice: configurable via ELEVENLABS_VOICE_ID, defaults to Brian (British game show host).
 * Model: eleven_turbo_v2_5 — lowest latency (~300ms for short text).
 */

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const ELEVENLABS_API  = 'https://api.elevenlabs.io/v1/text-to-speech';
const DEFAULT_VOICE_ID = 'nPczCjzI2devNBz1zQrb'; // Brian — Deep, Resonant (default)
const CACHE_DIR = path.join(__dirname, '../data/tts-cache');

/** Curated host voices available in the room settings dropdown. */
const VOICE_OPTIONS = [
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian',   label: '🎙️ Brian',   desc: 'Deep & Resonant',       gender: 'male',    accent: 'American', isDefault: true  },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George',  label: '🎩 George',  desc: 'Warm Storyteller',      gender: 'male',    accent: 'British'  },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel',  label: '📻 Daniel',  desc: 'Steady Broadcaster',    gender: 'male',    accent: 'British'  },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', label: '⚡ Charlie', desc: 'Deep & Energetic',      gender: 'male',    accent: 'Australian'},
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah',   label: '🌟 Sarah',   desc: 'Confident & Reassuring',gender: 'female',  accent: 'American' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice',   label: '🎓 Alice',   desc: 'Engaging Educator',     gender: 'female',  accent: 'British'  },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily',    label: '🌸 Lily',    desc: 'Velvety & Confident',   gender: 'female',  accent: 'British'  },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', label: '✨ Jessica', desc: 'Playful & Warm',        gender: 'female',  accent: 'American' },
];

// Ensure cache directory exists
try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (_) {}

/**
 * Normalise text so ElevenLabs reads it naturally.
 */
function normaliseForTts(text) {
  if (!text) return text;

  // Currency (do BEFORE large number expansion to avoid double-processing)
  // £1,234,567 → 1234567 pounds
  text = text.replace(/£([\d,]+\.?\d*)/g, (_, amt) => amt.replace(/,/g, '') + ' pounds');
  text = text.replace(/€([\d,]+\.?\d*)/g, (_, amt) => amt.replace(/,/g, '') + ' euros');
  // $1.5 billion / $42,000
  text = text.replace(/\$([\d,]+\.?\d*)\s*(billion|million|thousand)?/gi, (_, amt, scale) =>
    amt.replace(/,/g, '') + (scale ? ' ' + scale : '') + ' dollars');

  // Strip commas from numbers: 1,234,567 → 1234567
  text = text.replace(/\b(\d{1,3}(?:,\d{3})+)\b/g, s => s.replace(/,/g, ''));

  // Large numbers → words
  text = text.replace(/\b(\d+)\b/g, n => {
    const num = parseInt(n, 10);
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + ' billion';
    if (num >= 1_000_000)     return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + ' million';
    return n; // keep as-is (ElevenLabs reads 4-digit years and smaller numbers fine)
  });

  // Percent: 42% → 42 percent
  text = text.replace(/(\d+\.?\d*)\s*%/g, '$1 percent');

  // Units (no word boundary — can be attached to digits like "120km/h")
  text = text.replace(/(\d)\s*km\/h/gi, '$1 kilometres per hour');
  text = text.replace(/(\d)\s*m\/s/gi,  '$1 metres per second');
  text = text.replace(/(\d)\s*(?:mi\/h|mph)/gi, '$1 miles per hour');
  text = text.replace(/(\d)\s*km(?!\w)/gi, '$1 kilometres');
  text = text.replace(/sq\.?\s*km/gi, 'square kilometres');
  text = text.replace(/sq\.?\s*mi/gi, 'square miles');

  // Abbreviations with optional trailing period — expanded, period consumed
  const abbr = [
    [/\bapprox\.?(?=[\s,;.]|$)/gi, 'approximately'],
    [/\best\.(?=\s|$)/gi,'established'],  // 'est.' but not 'estimate'
    [/\bmin\.(?=\s|$)/gi,'minutes'],
    [/\bmax\.(?=\s|$)/gi,'maximum'],
    [/\bavg\.?/gi,        'average'],
    [/\bno\.(?=\s|$)/gi, 'number'],
    [/\bNo\.(?=\s|$)/g,  'number'],
    [/\byr\.?s?\b/gi,     'years'],
    [/\bMt\.(?=\s)/g,    'Mount'],
    [/\bSt\.(?=\s)/g,    'Saint'],
    [/\bDr\.(?=\s)/g,    'Doctor'],
    [/\bMr\.(?=\s)/g,    'Mister'],
    [/\bMrs\.(?=\s)/g,   'Missus'],
    [/\bMs\.(?=\s)/g,    'Miss'],
    [/\bProf\.(?=\s)/g,  'Professor'],
    [/\bvs\.?/gi,         'versus'],
    [/\be\.g\.?/gi,       'for example'],
    [/\bi\.e\.?/gi,       'that is'],
    [/\betc\.?/gi,        'and so on'],
  ];
  for (const [pattern, replacement] of abbr) {
    text = text.replace(pattern, replacement);
  }

  // Ordinals: 1st, 2nd, 3rd, 4th … → first, second, third, fourth …
  const ordinalWords = ['zeroth','first','second','third','fourth','fifth',
    'sixth','seventh','eighth','ninth','tenth','eleventh','twelfth',
    'thirteenth','fourteenth','fifteenth','sixteenth','seventeenth',
    'eighteenth','nineteenth','twentieth'];
  text = text.replace(/\b(\d+)(st|nd|rd|th)\b/gi, (_, n) => {
    const num = parseInt(n, 10);
    return num < ordinalWords.length ? ordinalWords[num] : n + 'th';
  });

  // Convert standalone numbers to words for better TTS pronunciation
  // Handles numbers 0-999,999 (sufficient for most trivia questions)
  const ones = ['','one','two','three','four','five','six','seven','eight','nine'];
  const teens = ['ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  const tens = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  
  function numberToWords(n) {
    if (n === 0) return 'zero';
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) {
      const ten = Math.floor(n / 10);
      const one = n % 10;
      return tens[ten] + (one ? ' ' + ones[one] : '');
    }
    if (n < 1000) {
      const hundred = Math.floor(n / 100);
      const rest = n % 100;
      return ones[hundred] + ' hundred' + (rest ? ' ' + numberToWords(rest) : '');
    }
    if (n < 1000000) {
      const thousand = Math.floor(n / 1000);
      const rest = n % 1000;
      return numberToWords(thousand) + ' thousand' + (rest ? ' ' + numberToWords(rest) : '');
    }
    return n.toString(); // fallback for very large numbers
  }
  
  // Convert standalone numbers (not part of dates/codes) to words
  // Match numbers that are:
  // - Preceded by space or start of string
  // - Followed by space, punctuation, or end of string
  // - NOT part of a year (4 digits) or code
  text = text.replace(/(?<!\d)(\d{1,6})(?!\d)/g, (match) => {
    const n = parseInt(match, 10);
    // Keep 4-digit numbers as-is (likely years)
    if (match.length === 4) return match;
    // Convert small numbers to words
    if (n <= 9999) return numberToWords(n);
    return match;
  });

  // Dashes between digits → "to" (ranges like 10–20)
  text = text.replace(/(\d)\s*[-–—]\s*(\d)/g, '$1 to $2');

  // Standalone minus sign before number
  text = text.replace(/\s-\s(\d)/g, ' minus $1');

  // Remove parenthetical annotations that are hard to say
  text = text.replace(/\(\s*(approximately|estimated?|circa|c\.?)\s*\)/gi, '');

  // Normalise whitespace
  text = text.replace(/  +/g, ' ').trim();

  return text;
}

// In-memory cache: normalizedText → Buffer. Populated from disk on first access.
const _audioCache = new Map();
let _cacheHits = 0;
let _cacheMisses = 0;
let _diskHits = 0;

function getKey() { return process.env.ELEVENLABS_API_KEY || ''; }
function hasKey() { return !!getKey(); }
function getCacheStats() {
  return { hits: _cacheHits, diskHits: _diskHits, misses: _cacheMisses, size: _audioCache.size };
}

function _cacheFile(normalizedText) {
  const hash = crypto.createHash('sha256').update(normalizedText).digest('hex');
  return path.join(CACHE_DIR, `${hash}.mp3`);
}

function _readDisk(normalizedText) {
  try {
    const file = _cacheFile(normalizedText);
    if (fs.existsSync(file)) return fs.readFileSync(file);
  } catch (_) {}
  return null;
}

function _writeDisk(normalizedText, buffer) {
  try { fs.writeFileSync(_cacheFile(normalizedText), buffer); } catch (_) {}
}

/**
 * Generate speech for `text` using `voiceId` (defaults to Brian).
 * Returns a Buffer (MP3 bytes) or null on failure.
 * Results are cached in memory AND on disk so repeated calls — even across
 * server restarts — are free. Cache key includes the voice ID so different
 * voices for the same text are cached independently.
 * @param {string} text
 * @param {string} [voiceId]
 * @returns {Promise<Buffer|null>}
 */
async function generateSpeech(rawText, voiceId) {
  const key = getKey();
  if (!key || !rawText) return null;

  const text = normaliseForTts(rawText);
  const resolvedVoiceId = VOICE_OPTIONS.find(v => v.id === voiceId) ? voiceId : DEFAULT_VOICE_ID;
  const cacheKey = `${resolvedVoiceId}:${text.trim().toLowerCase()}`;

  // Layer 1: in-memory
  if (_audioCache.has(cacheKey)) {
    _cacheHits++;
    return _audioCache.get(cacheKey);
  }

  // Layer 2: disk
  const fromDisk = _readDisk(cacheKey);
  if (fromDisk) {
    _diskHits++;
    _audioCache.set(cacheKey, fromDisk);
    console.log(`[tts] Disk cache hit (${_diskHits} disk, ${_cacheHits} mem, ${_audioCache.size} loaded)`);
    return fromDisk;
  }

  try {
    const res = await fetch(`${ELEVENLABS_API}/${resolvedVoiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[tts] ElevenLabs ${res.status}: ${body.slice(0, 120)}`);
      return null;
    }

    _cacheMisses++;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    _audioCache.set(cacheKey, buffer);
    _writeDisk(cacheKey, buffer);
    console.log(`[tts] Generated (${buffer.length}b) — cache now ${_audioCache.size} entries`);
    return buffer;
  } catch (e) {
    console.warn('[tts] Error:', e.message);
    return null;
  }
}

/**
 * Pre-warm the disk cache for a set of question texts.
 * Called at startup for static questions so the first game after a deploy
 * is as fast as subsequent games. Skips any text already on disk.
 * @param {Array<{text: string}>} items
 */
async function prewarmCache(items) {
  if (!hasKey()) return;
  let warmed = 0;
  for (const { text } of items) {
    if (!text) continue;
    const cacheKey = text.trim().toLowerCase();
    if (_audioCache.has(cacheKey) || _readDisk(cacheKey)) continue;
    const buf = await generateSpeech(text);
    if (buf) warmed++;
    // Gentle rate-limit to avoid burst on startup
    await new Promise(r => setTimeout(r, 200));
  }
  if (warmed > 0) console.log(`[tts] Pre-warmed ${warmed} new static question audio files`);
}

/**
 * Get the cache file path for a given text + voiceId.
 * Exported so server.js can serve cached audio via URL.
 */
function getAudioCacheFile(text, voiceId) {
  if (!text) return null;
  const resolvedVoiceId = VOICE_OPTIONS.find(v => v.id === voiceId) ? voiceId : DEFAULT_VOICE_ID;
  const normalized = normaliseForTts(text);
  const cacheKey = `${resolvedVoiceId}:${normalized.trim().toLowerCase()}`;
  return _cacheFile(cacheKey);
}

/**
 * Get the URL-safe cache key (SHA256 hex) for a given text + voiceId.
 * Used by the /api/tts/q/:key endpoint to serve cached audio.
 * Must normalise text the same way generateSpeech does so the key matches the stored file.
 */
function getAudioCacheKey(text, voiceId) {
  if (!text) return null;
  const resolvedVoiceId = VOICE_OPTIONS.find(v => v.id === voiceId) ? voiceId : DEFAULT_VOICE_ID;
  const normalized = normaliseForTts(text);
  const cacheKey = `${resolvedVoiceId}:${normalized.trim().toLowerCase()}`;
  return crypto.createHash('sha256').update(cacheKey).digest('hex');
}

module.exports = { generateSpeech, normaliseForTts, hasKey, getCacheStats, prewarmCache, getAudioCacheFile, getAudioCacheKey, VOICE_OPTIONS, DEFAULT_VOICE_ID };
