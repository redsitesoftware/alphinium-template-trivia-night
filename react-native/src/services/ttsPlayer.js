/**
 * ttsPlayer.js — client-side TTS audio player
 *
 * Plays MP3 audio received as a URL from the server's question_audio WS message.
 * Also plays commentary clips from /api/tts/commentary or /voice/ static files.
 *
 * iOS Safari notes:
 *  - Autoplay requires user interaction. We unlock on first touchstart/click.
 *  - Only real HTTP URLs work reliably on iOS — blob URLs and data URIs do NOT.
 *  - The question_audio WS message now sends a URL instead of base64.
 *  - Dynamic named clips require a voiceId; without one we fall back to a static clip.
 */

import { Platform } from 'react-native';
import { getWebBaseUrl } from '../config';

function getApiBase() {
  const base = getWebBaseUrl();
  if (base) return base;
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return '';
}

// ─── iOS Audio Unlock via AudioContext ───────────────────────────────────────
// iOS Safari blocks async audio unless AudioContext has been resumed from a user
// gesture. Once resumed, AudioContext.decodeAudioData + BufferSource works for
// all subsequent plays — even those triggered by WS messages (no gesture needed).
//
// CRITICAL BUG (fixed): Do NOT call _unlockAudio() from non-gesture contexts
// (e.g. playUrl, playStatic). Doing so sets _unlocked=true before a real user
// gesture fires, which then makes the event listeners no-ops — the AudioContext
// is never properly resumed on iOS.
//
// Correct flow:
//  1. Page loads → AudioContext created eagerly (starts 'suspended')
//  2. User taps → gesture handler → _unlockAudio() → ctx.resume() in gesture ✅
//  3. WS audio arrives → fetch → decodeAudioData → source.start(0) → plays ✅
//  4. If context auto-suspends (backgrounded): _ensureRunning() re-resumes it.
let _audioCtx = null;
let _unlocked = false;

function _getOrCreateAudioContext() {
  if (_audioCtx) return _audioCtx;
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) _audioCtx = new Ctx();
  } catch (_) {}
  return _audioCtx;
}

// Called ONLY from user gesture event handlers (touchend/click).
// Must not be called from async/WS contexts.
function _unlockAudio() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  console.log('[ttsPlayer] _unlockAudio called from user gesture, _unlocked =', _unlocked);
  
  if (_unlocked) {
    console.log('[ttsPlayer] Already unlocked, re-resuming AudioContext anyway');
  }
  
  _unlocked = true;
  try {
    const ctx = _getOrCreateAudioContext();
    if (ctx) {
      console.log('[ttsPlayer] AudioContext state before resume:', ctx.state);
      if (ctx.state !== 'running') {
        // IMPORTANT: ctx.resume() returns a Promise, but we're in a sync gesture handler.
        // We fire it and let it complete async — iOS will allow it because we're in a gesture.
        ctx.resume()
          .then(() => {
            console.log('[ttsPlayer] ✅ AudioContext resumed from gesture, new state:', ctx.state);
          })
          .catch((err) => {
            console.warn('[ttsPlayer] ctx.resume() from gesture failed:', err.message);
          });
      } else {
        console.log('[ttsPlayer] AudioContext already running');
      }
    }
    
    // Belt-and-suspenders: play a silent buffer through AudioContext to fully activate it
    if (ctx && ctx.state !== 'closed') {
      try {
        const buffer = ctx.createBuffer(1, 1, 22050); // Tiny silent buffer
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
        console.log('[ttsPlayer] Played silent buffer from gesture');
      } catch (err) {
        console.warn('[ttsPlayer] Silent buffer play failed:', err.message);
      }
    }
    
    // Also play a silent HTMLAudioElement
    const a = new window.Audio('/sounds/tick.wav');
    a.volume = 0;
    const p = a.play();
    if (p && p.then) p.then(() => a.pause()).catch(() => {});
  } catch (err) {
    console.warn('[ttsPlayer] _unlockAudio error:', err.message);
  }
}

// Called before async audio plays. If context got auto-suspended (page backgrounded),
// try to resume — works on iOS 14.5+ after prior user-gesture activation.
async function _ensureRunning() {
  const ctx = _getOrCreateAudioContext();
  if (!ctx) {
    console.log('[ttsPlayer] _ensureRunning: No AudioContext available');
    return null;
  }
  console.log('[ttsPlayer] _ensureRunning: AudioContext state =', ctx.state, ', _unlocked =', _unlocked);
  if (ctx.state !== 'running') {
    console.log('[ttsPlayer] Attempting ctx.resume()...');
    try { 
      await ctx.resume(); 
      console.log('[ttsPlayer] ctx.resume() completed, new state:', ctx.state);
    } catch (err) {
      console.warn('[ttsPlayer] ctx.resume() failed:', err.message);
    }
  }
  return ctx;
}

// Expose unlock function so UI components can call it from button onPress handlers
export function unlockAudioFromGesture() {
  console.log('[ttsPlayer] unlockAudioFromGesture called (explicit button tap)');
  _unlockAudio();
}

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  // Use touchend (not touchstart) — fires after the gesture completes, more reliable on iOS
  window.addEventListener('touchend',  _unlockAudio, { once: false, passive: true });
  window.addEventListener('click',     _unlockAudio, { once: false, passive: true });
  // Eagerly create AudioContext so it's ready when first gesture fires
  if (window.AudioContext || window.webkitAudioContext) {
    try { _getOrCreateAudioContext(); } catch (_) {}
  }
}

// ─── Player class ─────────────────────────────────────────────────────────────
class TtsPlayer {
  constructor() {
    this._audio  = null;
    this._sourceNode = null;  // AudioContext BufferSourceNode (iOS path)
    this._ttsAvailable = null;
    this._checking     = false;
    // Epoch increments on every stop()/new play — guards all pending callbacks
    this._epoch = 0;
  }

  get isPlaying() {
    if (this._sourceNode) return true;  // AudioContext source (no pause state)
    return !!(this._audio && !this._audio.paused && !this._audio.ended);
  }

  /** Stop current audio and invalidate ALL pending onEnd / schedule callbacks. */
  stop() {
    this._epoch++;
    if (this._sourceNode) {
      try { this._sourceNode.stop(); } catch {}
      this._sourceNode = null;
    }
    if (this._audio) {
      try { this._audio.pause(); this._audio.src = ''; } catch {}
      this._audio = null;
    }
  }

  /**
   * Register a callback when current audio ends, guarded by epoch.
   * If nothing is currently playing the callback is NOT fired immediately.
   */
  onEnd(callback) {
    if (!this.isPlaying) return;
    const epoch = this._epoch;
    const guard = () => { if (this._epoch === epoch) callback(); };
    if (this._sourceNode) {
      // AudioContext path — onended fires once when buffer finishes
      const prev = this._sourceNode.onended;
      this._sourceNode.onended = (e) => { if (prev) prev(e); guard(); };
    } else if (this._audio) {
      this._audio.addEventListener('ended', guard, { once: true });
      this._audio.addEventListener('error', guard, { once: true });
    }
  }

  schedule(callback, delay = 0) {
    const epoch = this._epoch;
    const fire = () => {
      if (this._epoch !== epoch) return;
      if (delay > 0) setTimeout(() => { if (this._epoch === epoch) callback(); }, delay);
      else callback();
    };
    if (!this.isPlaying) {
      if (delay > 0) setTimeout(() => { if (this._epoch === epoch) callback(); }, delay);
      else callback();
      return;
    }
    if (this._sourceNode) {
      const prev = this._sourceNode.onended;
      this._sourceNode.onended = (e) => { if (prev) prev(e); fire(); };
    } else if (this._audio) {
      this._audio.addEventListener('ended', fire, { once: true });
      this._audio.addEventListener('error', fire, { once: true });
    }
  }

  /**
   * Play a voice clip for a commentary event.
   *
   * @param {string}  name     Clip name (e.g. 'correct-1') OR substituted text when dynamic=true
   * @param {boolean} muted
   * @param {string|null} voiceId  ElevenLabs voice ID — uses API endpoint when set
   * @param {boolean} dynamic  When true, `name` is the full text, fetched via /api/tts/dynamic
   */
  playStatic(name, muted = false, voiceId = null, dynamic = false) {
    if (Platform.OS !== 'web') return;
    if (muted) return;

    // Dynamic named clip needs a voiceId — without one, skip (no meaningful fallback URL)
    if (dynamic && !voiceId) return;

    this.stop();
    // Note: Do NOT call _unlockAudio() here — it must only be called from user gesture handlers.
    // AudioContext unlock is handled by the touchend/click listeners in module scope.

    let url;
    if (dynamic && voiceId) {
      url = `${getApiBase()}/api/tts/dynamic?voiceId=${encodeURIComponent(voiceId)}&text=${encodeURIComponent(name)}`;
    } else if (voiceId) {
      url = `${getApiBase()}/api/tts/commentary/${encodeURIComponent(voiceId)}/${encodeURIComponent(name)}`;
    } else {
      // No voiceId — skip rather than 404 on /voice/*.mp3 (those files don't exist in deployment)
      console.warn('[ttsPlayer] playStatic called without voiceId, skipping:', name);
      return;
    }

    this._playUrl(url);
  }

  /**
   * Play audio from a URL (real HTTP/HTTPS URL).
   * This is the iOS-safe path — same as how WAV sounds play in soundManager.
   * Relative URLs are resolved against the API base so they work on iOS when
   * the app is served from a different origin than window.location.
   */
  playUrl(url) {
    if (Platform.OS !== 'web') return;
    if (!url) return;
    this.stop();
    // Note: Do NOT call _unlockAudio() here — it must only be called from user gesture handlers.
    // Resolve relative URLs so iOS can fetch from the correct server
    const fullUrl = url.startsWith('http') ? url : `${getApiBase()}${url}`;
    this._playUrl(fullUrl);
  }

  /**
   * Play pre-generated base64 MP3 audio.
   * Legacy fallback only — iOS Safari cannot play data URIs reliably.
   * Prefer playUrl() when the server sends a URL.
   */
  playBase64(base64) {
    if (Platform.OS !== 'web') return;
    if (!base64) return;
    this.stop();
    // data URL is more reliable than createObjectURL on iOS Safari
    const dataUrl = `data:audio/mpeg;base64,${base64}`;
    this._playUrl(dataUrl);
  }

  /** Internal: play audio from a URL using AudioContext (iOS-safe) or HTMLAudioElement fallback. */
  async _playUrl(url) {
    console.log('🔊 Playing URL:', url.substring(0, 80));
    
    // Capture the epoch at entry — if it changes during our async work, abort
    const playEpoch = this._epoch;
    
    // CRITICAL FIX: Stop any previous source BEFORE starting async work
    // This prevents the race condition where new audio stops old audio mid-decode
    const previousSource = this._sourceNode;
    this._sourceNode = null;
    this._audio = null;
    if (previousSource) {
      try { 
        previousSource.stop(); 
        console.log('🔊 Stopped previous audio');
      } catch {}
    }
    
    // Ensure AudioContext is running (re-resumes if auto-suspended after page backgrounding).
    // This is safe to call from non-gesture contexts on iOS 14.5+ once previously activated.
    const ctx = await _ensureRunning();
    console.log('🔊 AudioContext state:', ctx ? ctx.state : 'null');
    
    // Check if we've been superseded by a newer play/stop call
    if (this._epoch !== playEpoch) {
      console.log('🔊 Aborted — superseded by newer call');
      return;
    }
    
    if (ctx) {
      try {
        console.log('🔊 Fetching audio...');
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        // Check again after async fetch
        if (this._epoch !== playEpoch) {
          console.log('🔊 Aborted after fetch — superseded');
          return;
        }
        
        console.log('🔊 Decoding audio...');
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        console.log('🔊 Decoded OK, duration:', audioBuffer.duration.toFixed(2), 's');

        // Check one last time before starting playback
        if (this._epoch !== playEpoch) {
          console.log('🔊 Aborted after decode — superseded');
          return;
        }

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        this._sourceNode = source;
        const epoch = this._epoch;
        source.onended = () => {
          if (this._epoch === epoch) this._sourceNode = null;
        };
        source.start(0);
        console.log('✅ Audio playing, duration:', audioBuffer.duration.toFixed(2), 's');
        return;
      } catch (err) {
        console.warn('❌ AudioContext path failed:', err.message || err);
      }
    }

    // Fallback: HTMLAudioElement (less reliable on iOS async, but works on desktop/Android)
    console.log('[ttsPlayer] Falling back to HTMLAudioElement');
    
    // Check epoch before HTMLAudioElement fallback too
    if (this._epoch !== playEpoch) {
      console.log('[ttsPlayer] Aborted HTMLAudioElement — superseded');
      return;
    }
    
    try {
      const audio = new window.Audio(url);
      audio.preload = 'auto';
      this._audio = audio;
      audio.addEventListener('ended', () => {
        if (this._audio === audio) this._audio = null;
      }, { once: true });
      audio.addEventListener('error', (e) => {
        console.warn('[ttsPlayer] audio error:', url.substring(0, 80), e?.target?.error?.message || e);
        if (this._audio === audio) this._audio = null;
      }, { once: true });
      const p = audio.play();
      if (p && p.catch) p.catch(err => console.warn('[ttsPlayer] play() blocked:', err.name, url.substring(0, 60)));
    } catch (err) {
      console.warn('[ttsPlayer] _playUrl error:', err);
    }
  }

  /** Check server TTS availability (cached after first check). */
  async _checkAvailable() {
    if (this._ttsAvailable !== null) return this._ttsAvailable;
    if (this._checking) return false;
    this._checking = true;
    try {
      const base = getApiBase();
      if (!base) { this._ttsAvailable = false; return false; }
      const res = await fetch(`${base}/api/tts/status`);
      const data = await res.json();
      this._ttsAvailable = !!data.available;
    } catch {
      this._ttsAvailable = false;
    }
    this._checking = false;
    return this._ttsAvailable;
  }

  /**
   * Speak text via /api/tts (fallback path, used for AI commentary if needed).
   */
  async speak(text) {
    if (Platform.OS !== 'web') return;
    if (!text) return;
    const available = await this._checkAvailable();
    if (!available) return;
    const base = getApiBase();
    if (!base) return;

    if (this.isPlaying) {
      await new Promise(resolve => this.onEnd(resolve));
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    try {
      const res = await fetch(`${base}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        if (res.status === 503) this._ttsAvailable = false;
        return;
      }
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => this._playUrl(reader.result);
      reader.readAsDataURL(blob);
    } catch (err) {
      console.warn('[ttsPlayer] speak error:', err);
    }
  }
}

export default new TtsPlayer();

