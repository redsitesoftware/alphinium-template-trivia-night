/**
 * Cross-platform sound manager.
 *
 * Native (iOS / Android): uses expo-av to load WAV assets bundled in assets/sounds/.
 * Web: uses the Web Audio API (new Audio) pointing at /sounds/*.wav served from public/.
 *
 * Rules to prevent overlapping audio:
 *  - On native, only ONE sound plays at a time. Starting a new sound stops the previous.
 *  - `tick` is debounced: ignored if last tick was < 900ms ago.
 *  - _loadNative is concurrency-safe: parallel calls for the same name share one promise.
 */

import { Platform } from 'react-native';

// ─── Native asset map ────────────────────────────────────────────────────────
const NATIVE_ASSETS = {
  'correct':     require('../../assets/sounds/correct.wav'),
  'wrong':       require('../../assets/sounds/wrong.wav'),
  'tick':        require('../../assets/sounds/tick.wav'),
  'round-start': require('../../assets/sounds/round-start.wav'),
  'game-over':   require('../../assets/sounds/game-over.wav'),
};

// ─── Web path map (served from public/ by server.js) ─────────────────────────
const WEB_PATHS = {
  'correct':     '/sounds/correct.wav',
  'wrong':       '/sounds/wrong.wav',
  'tick':        '/sounds/tick.wav',
  'round-start': '/sounds/round-start.wav',
  'game-over':   '/sounds/game-over.wav',
};

// ─── Mute state ───────────────────────────────────────────────────────────────
let _muted = false;
try {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    _muted = localStorage.getItem('soundMuted') === 'true';
  }
} catch (_) {}

// ─── Web audio: AudioContext for iOS compatibility ──────────────────────────
let _webAudio = null;
let _audioContext = null;
let _unlocked = false;
let _audioBufferCache = {}; // name → AudioBuffer (pre-decoded WAV data)

// Uses a promise to prevent concurrent createAsync calls for the same name.
const _cache = {};        // name → expo-av Sound
const _loading = {};      // name → Promise<Sound> (in-flight loads)
let _activeSound = null;  // currently playing Sound on native (for stop-before-play)
let _lastTickAt = 0;      // timestamp of last tick play (debounce)

// ─── AudioContext unlock for iOS (same pattern as ttsPlayer) ─────────────────
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  function _getAudioContext() {
    if (_audioContext) return _audioContext;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        _audioContext = new AudioCtx();
      }
    } catch (e) {
      console.warn('[soundManager] AudioContext creation failed:', e);
    }
    return _audioContext;
  }

  function _unlockAudio() {
    if (_unlocked) return;
    const ctx = _getAudioContext();
    if (!ctx) return;

    console.log('[soundManager] Unlocking AudioContext from gesture');
    _unlocked = true;

    // Resume context
    if (ctx.state !== 'running') {
      ctx.resume().catch(e => console.warn('[soundManager] ctx.resume() failed:', e));
    }

    // Play silent buffer to fully unlock
    try {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch (e) {
      console.warn('[soundManager] Silent buffer failed:', e);
    }

    // Pre-fetch and decode all WAV files for instant playback
    _prefetchSounds();
  }

  async function _prefetchSounds() {
    const ctx = _getAudioContext();
    if (!ctx) return;

    console.log('[soundManager] Pre-fetching WAV files...');
    for (const name of Object.keys(WEB_PATHS)) {
      if (_audioBufferCache[name]) continue; // already cached
      
      try {
        const response = await fetch(WEB_PATHS[name]);
        if (!response.ok) continue;
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        _audioBufferCache[name] = audioBuffer;
        console.log(`[soundManager] Cached ${name}`);
      } catch (e) {
        console.warn(`[soundManager] Failed to cache ${name}:`, e);
      }
    }
  }

  // Add gesture listeners for unlock (same as ttsPlayer)
  window.addEventListener('touchend', _unlockAudio, { once: false, passive: true });
  window.addEventListener('click', _unlockAudio, { once: false, passive: true });

  // Try to create context immediately (will be suspended on iOS until gesture)
  try {
    _getAudioContext();
  } catch (e) {
    console.warn('[soundManager] Initial AudioContext creation failed:', e);
  }
}

async function _loadNative(name) {
  if (_cache[name]) return _cache[name];
  // If already loading this sound, wait for the same promise (no double-create)
  if (_loading[name]) return _loading[name];
  _loading[name] = (async () => {
    try {
      const { Audio } = await import('expo-av');
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(NATIVE_ASSETS[name], { shouldPlay: false });
      _cache[name] = sound;
      return sound;
    } catch (e) {
      console.warn('[Sound] Failed to load', name, e);
      return null;
    } finally {
      delete _loading[name];
    }
  })();
  return _loading[name];
}

// ─── Public API ───────────────────────────────────────────────────────────────
const soundManager = {
  async play(name) {
    if (_muted) return;
    if (!NATIVE_ASSETS[name]) return;

    // Debounce tick — ignore if played < 900ms ago
    if (name === 'tick') {
      const now = Date.now();
      if (now - _lastTickAt < 900) return;
      _lastTickAt = now;
    }

    try {
      if (Platform.OS === 'web') {
        const ctx = _getAudioContext();
        if (!ctx || !_unlocked) {
          console.warn(`[soundManager] Cannot play ${name} - AudioContext not unlocked`);
          return;
        }

        // Use pre-cached AudioBuffer if available, otherwise fall back to HTMLAudioElement
        const audioBuffer = _audioBufferCache[name];
        if (audioBuffer) {
          // Stop previous sound (except ticks which can overlap)
          if (name !== 'tick' && _webAudio) {
            try { _webAudio.stop(); } catch {}
            _webAudio = null;
          }

          // Play from AudioBuffer (near-instant, iOS-safe)
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          if (name !== 'tick') {
            _webAudio = source;
            source.onended = () => {
              if (_webAudio === source) _webAudio = null;
            };
          }
          source.start(0);
          console.log(`[soundManager] Played ${name} via AudioContext`);
        } else {
          // Fallback: HTMLAudioElement (will fail silently on iOS if not unlocked)
          console.warn(`[soundManager] ${name} not cached, using HTMLAudioElement fallback`);
          if (name !== 'tick' && _webAudio) {
            try { _webAudio.pause(); _webAudio.src = ''; } catch {}
            _webAudio = null;
          }
          const audio = new window.Audio(WEB_PATHS[name]);
          if (name !== 'tick') {
            _webAudio = audio;
            audio.addEventListener('ended', () => {
              if (_webAudio === audio) _webAudio = null;
            }, { once: true });
          }
          audio.play().catch(e => console.warn(`[soundManager] play() blocked:`, e));
        }
      } else {
        const sound = await _loadNative(name);
        if (!sound) return;
        // Stop any currently playing sound before starting new one
        if (_activeSound && _activeSound !== sound) {
          try { await _activeSound.stopAsync(); } catch {}
        }
        _activeSound = sound;
        await sound.setPositionAsync(0);
        await sound.playAsync();
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.didJustFinish && _activeSound === sound) {
            _activeSound = null;
          }
        });
      }
    } catch (e) {
      console.warn('[Sound] Play failed:', name, e);
    }
  },

  mute() {
    _muted = true;
    // Stop active web audio immediately
    if (_webAudio) {
      try { _webAudio.pause(); _webAudio.src = ''; } catch {}
      _webAudio = null;
    }
    // Stop active native sound immediately
    if (_activeSound) {
      try { _activeSound.stopAsync(); } catch {}
      _activeSound = null;
    }
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem('soundMuted', 'true');
      }
    } catch (_) {}
  },

  unmute() {
    _muted = false;
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem('soundMuted', 'false');
      }
    } catch (_) {}
  },

  isMuted() {
    return _muted;
  },

  /** Release all cached native Sound objects (call on app teardown). */
  async release() {
    _activeSound = null;
    for (const sound of Object.values(_cache)) {
      try { await sound.unloadAsync(); } catch (_) {}
    }
    for (const key of Object.keys(_cache)) delete _cache[key];
  },
};

export default soundManager;

