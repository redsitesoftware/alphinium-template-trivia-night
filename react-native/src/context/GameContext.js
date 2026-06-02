/**
 * GameContext — global game state shared across all screens.
 * Wraps TriviaWebSocket and provides a unified dispatch interface.
 * Commentary is driven by pre-recorded static clips (staticCommentary.js)
 * — no Groq or ElevenLabs runtime calls for commentary.
 */

import React, { createContext, useContext, useReducer, useRef, useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import TriviaWebSocket, { ConnectionState } from '../services/websocket';
import soundManager from '../services/soundManager';
import ttsPlayer from '../services/ttsPlayer';
import { pick } from '../services/staticCommentary';
import { WS_URL } from '../config';

const initialState = {
  // Connection
  connectionState: ConnectionState.DISCONNECTED,

  // Player identity
  playerId: null,
  playerName: null,
  isHost: false,

  // Room
  roomCode: null,
  players: [],
  spectatorModeEnabled: true,
  spectatorCount: 0,
  voiceEnabled: true,
  banterEnabled: true,
  voiceAnswers: false,  // host can enable voice input for answering questions

  // Per-device mute (persisted in localStorage, not sent to server)
  voiceMuted: false,
  soundEffectsMuted: soundManager.isMuted(),

  // Host-controlled: mutes question audio on all non-host devices
  mutePlayersOnStart: false,

  // Active room voice ID (ElevenLabs) — commentary clips use this voice
  roomVoiceId: null,

  // Ad-supported mode
  adSupported: false,
  adBreakDuration: 15,  // seconds, from server ad_break message

  // Game mode
  gameMode: 'classic',  // classic | millionaire | buzzer | chase
  modeState: {},        // Mode-specific state

  // Game
  phase: 'home', // home | lobby | ai_generating | question | result | leaderboard | gameover | round_break | ad_break
  currentRound: 1,      // 1-indexed display round
  totalRounds: 1,       // total rounds for this game
  questionsPerRound: 4, // questions per round
  aiMode: false,    // true when AI Quiz Master generated the game
  aiSubject: null,  // subject the AI was given
  aiDifficulty: 'medium', // difficulty level
  question: null,    // { question, options, category, index, total, timeLimit }
  timerRemaining: 30,
  timerMax: 30,
  answered: false,
  selectedAnswer: null,
  answerResult: null, // { correct, points, streak, multiplier }
  currentStreak: 0,  // persistent consecutive correct answer count (reset on wrong/timeout)

  // Leaderboard
  leaderboard: [],
  correctAnswer: null,

  // Error
  error: null,
  insufficientCredits: false,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_CONNECTION':
      return { ...state, connectionState: action.payload };

    case 'ROOM_JOINED': {
      const players = action.payload.players || [];
      const me = players.find(p => p.id === action.payload.playerId);
      return {
        ...state,
        playerId: action.payload.playerId,
        playerName: me?.name || state.playerName || null,
        roomCode: action.payload.code,
        isHost: action.payload.isHost,
        players,
        phase: 'lobby',
        aiMode: false,
        error: null,
        roomVoiceId: action.payload.voiceId || null,
        banterEnabled: action.payload.banterEnabled !== false,
        voiceAnswers: action.payload.voiceAnswers === true,
        gameMode: action.payload.gameMode || 'classic',
        modeState: action.payload.modeState || {},
      };
    }

    case 'GAME_MODE_UPDATED':
      return { ...state, gameMode: action.payload.gameMode, modeState: action.payload.modeState || {} };

    case 'SET_PHASE':
      return { ...state, phase: action.payload };

    case 'MODE_STATE_UPDATED':
      return { ...state, modeState: { ...state.modeState, ...action.payload } };

    case 'HOST_VOICE_UPDATED':
      return { ...state, roomVoiceId: action.payload };

    case 'AI_GENERATING':
      return { ...state, phase: 'ai_generating', aiSubject: action.subject || null, aiDifficulty: action.difficulty || 'medium', aiMode: action.aiMode || false, error: null };

    case 'AI_MODE_FAILED':
      // AI generation failed — return to lobby so classic game can start
      return { ...state, phase: 'lobby', error: action.payload || null };

    case 'INSUFFICIENT_CREDITS':
      return { ...state, insufficientCredits: true };

    case 'CLEAR_INSUFFICIENT_CREDITS':
      return { ...state, insufficientCredits: false };

    case 'GAME_STARTED_AI':
      return { ...state, aiMode: true };

    case 'PLAYERS_UPDATE':
      return { ...state, players: action.payload };

    case 'QUESTION_START':
      return {
        ...state,
        phase: 'question',
        question: action.payload,
        timerMax: action.payload.timeLimit,
        timerRemaining: action.payload.timeLimit,
        answered: false,
        selectedAnswer: null,
        answerResult: null,
        // Update modeState from question_start (e.g. buzzer reset per question)
        ...(action.payload.modeState !== undefined ? { modeState: action.payload.modeState } : {}),
        ...(action.payload.gameMode !== undefined ? { gameMode: action.payload.gameMode } : {}),
      };

    case 'TIMER_TICK':
      return { ...state, timerRemaining: action.payload };

    case 'ANSWER_SUBMITTED':
      return { ...state, answered: true, selectedAnswer: action.payload };

    case 'ANSWER_RESULT':
      return {
        ...state,
        answerResult: action.payload,
        currentStreak: action.payload.correct ? (action.payload.streak ?? state.currentStreak + 1) : 0,
      };

    case 'QUESTION_END':
      return {
        ...state,
        phase: 'leaderboard',
        leaderboard: action.payload.leaderboard,
        correctAnswer: action.payload.correctAnswer,
        // Time ran out without the player answering — treat as wrong, reset streak
        currentStreak: state.answered ? state.currentStreak : 0,
      };

    case 'LEADERBOARD_UPDATE':
      return { ...state, leaderboard: action.payload };

    case 'GAME_OVER':
      return { ...state, phase: 'gameover', leaderboard: action.payload };

    case 'ROUND_END':
      return {
        ...state,
        phase: 'round_break',
        currentRound: action.payload.round,
        totalRounds: action.payload.totalRounds,
        leaderboard: action.payload.leaderboard,
      };

    case 'ROUND_START':
      return {
        ...state,
        currentRound: action.payload.round,
        totalRounds: action.payload.totalRounds,
        // phase stays round_break until first question_start arrives
      };

    case 'AD_BREAK':
      return {
        ...state,
        phase: 'ad_break',
        adBreakDuration: Math.round((action.payload.duration || 15000) / 1000),
      };

    case 'SPECTATOR_MODE_UPDATED':
      return {
        ...state,
        spectatorModeEnabled: action.payload.enabled,
        spectatorCount: action.payload.count ?? state.spectatorCount,
      };

    case 'SPECTATOR_COUNT':
      return { ...state, spectatorCount: action.payload };

    case 'VOICE_UPDATED':
      return { ...state, voiceEnabled: action.payload };
      
    case 'BANTER_UPDATED':
      return { ...state, banterEnabled: action.payload };

    case 'VOICE_ANSWERS_UPDATED':
      return { ...state, voiceAnswers: action.payload };

    case 'MUTE_TOGGLED':
      return { ...state, voiceMuted: action.payload };

    case 'SOUND_EFFECTS_TOGGLED':
      return { ...state, soundEffectsMuted: action.payload };

    case 'MUTE_PLAYERS_UPDATED':
      return { ...state, mutePlayersOnStart: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'RESET':
      return { ...initialState };

    default:
      return state;
  }
}

const GameContext = createContext(null);

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const wsRef = useRef(null);

  // Load per-device mute preference from localStorage on mount
  useEffect(() => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('trivia_voice_muted');
      if (saved === 'true') dispatch({ type: 'MUTE_TOGGLED', payload: true });
    }
  }, []);

  // Stable refs so memoised handleMessage can always read latest values
  const voiceEnabledRef = useRef(true);
  const voiceMutedRef   = useRef(false);
  const roomVoiceIdRef  = useRef(null);
  const isHostRef       = useRef(false);
  useEffect(() => { voiceEnabledRef.current = state.voiceEnabled; }, [state.voiceEnabled]);
  useEffect(() => { voiceMutedRef.current   = state.voiceMuted;   }, [state.voiceMuted]);
  useEffect(() => { roomVoiceIdRef.current  = state.roomVoiceId;  }, [state.roomVoiceId]);
  useEffect(() => { isHostRef.current       = state.isHost;       }, [state.isHost]);

  // Static commentary driven by pre-recorded clips (no Groq/ElevenLabs at runtime)
  const [aiComment, setAiComment] = useState(null);

  // Pending q-intro commentary timeout (700ms after question_start).
  // Stored as a ref so it can be cancelled when the player answers or game ends.
  const questionCommentaryTimeoutRef = useRef(null);

  // Pending gameover commentary timeout (2000ms after game_over).
  const gameoverCommentaryTimeoutRef = useRef(null);

  /**
   * Cancel the q-intro commentary timer if it hasn't fired yet.
   * Call this on answer_result and game_over to prevent stale commentary.
   */
  const cancelQuestionCommentary = useCallback(() => {
    if (questionCommentaryTimeoutRef.current) {
      clearTimeout(questionCommentaryTimeoutRef.current);
      questionCommentaryTimeoutRef.current = null;
    }
  }, []);

  /**
   * Play a static commentary clip and update the on-screen comment bubble.
   * If voice is disabled or muted, we still show the text (no audio).
   * @param {'question'|'correct'|'wrong'|'streak'|'gameover'|'round_break'} event
   * @param {boolean} afterCurrentAudio  wait for question audio to end first
   * @param {string|null} [playerName]   player name for personalised clips
   */
  const playCommentary = useCallback((event, afterCurrentAudio = false, playerName = null) => {
    const entry = pick(event, playerName);
    if (!entry) return;
    setAiComment(entry.text);
    const doPlay = () => {
      if (voiceEnabledRef.current && !voiceMutedRef.current) {
        if (entry.dynamic) {
          // Named dynamic clip — full substituted text passed as 'name', server generates TTS
          ttsPlayer.playStatic(entry.text, false, roomVoiceIdRef.current, true);
        } else {
          ttsPlayer.playStatic(entry.clip, false, roomVoiceIdRef.current);
        }
      }
    };
    if (afterCurrentAudio) {
      ttsPlayer.schedule(doPlay, 200);
    } else {
      doPlay();
    }
  }, []);

  // Stable ref for playerName so answer_result events carry the current name
  const playerNameRef = useRef(state.playerName);
  useEffect(() => { playerNameRef.current = state.playerName; }, [state.playerName]);

  // Stable ref for current question index
  const currentQuestionIndexRef = useRef(0);

  // Tracks whether the local player has submitted an answer for the current question.
  // Used to suppress late-arriving question_audio that would interrupt feedback.
  const hasAnsweredRef = useRef(false);

  // Stable refs for commentary so memoised handleMessage can call them
  const playCommentaryRef = useRef(playCommentary);
  useEffect(() => { playCommentaryRef.current = playCommentary; }, [playCommentary]);
  const cancelQuestionCommentaryRef = useRef(cancelQuestionCommentary);
  useEffect(() => { cancelQuestionCommentaryRef.current = cancelQuestionCommentary; }, [cancelQuestionCommentary]);

  // Clean up any pending commentary timers on unmount
  useEffect(() => () => {
    if (questionCommentaryTimeoutRef.current) clearTimeout(questionCommentaryTimeoutRef.current);
    if (gameoverCommentaryTimeoutRef.current) clearTimeout(gameoverCommentaryTimeoutRef.current);
  }, []);

  const handleMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'room_created':
      case 'room_joined':
        dispatch({ type: 'ROOM_JOINED', payload: msg });
        // Register playerId + roomCode so WS can auto-reconnect if the connection drops
        wsRef.current?.setContext(msg.playerId, msg.code);
        break;

      case 'reconnected':
        dispatch({ type: 'ROOM_JOINED', payload: { ...msg, players: msg.players || [] } });
        // Re-register context (new WS instance on reconnect)
        wsRef.current?.setContext(msg.playerId, msg.code);
        // Restore voice setting
        if (msg.voiceEnabled !== undefined) {
          dispatch({ type: 'VOICE_UPDATED', payload: msg.voiceEnabled !== false });
        }
        if (msg.mutePlayersOnStart !== undefined) {
          dispatch({ type: 'MUTE_PLAYERS_UPDATED', payload: msg.mutePlayersOnStart === true });
        }
        if (msg.voiceAnswers !== undefined) {
          dispatch({ type: 'VOICE_ANSWERS_UPDATED', payload: msg.voiceAnswers === true });
        }
        // If server tells us the room is already generating or playing, restore that state
        if (msg.state === 'lobby' && msg.generating) {
          dispatch({ type: 'AI_GENERATING', subject: msg.subject || null, difficulty: msg.difficulty || 'medium', aiMode: msg.aiMode || false });
        }
        break;

      case 'player_joined':
        dispatch({ type: 'PLAYERS_UPDATE', payload: msg.players });
        break;

      case 'player_left':
        dispatch({ type: 'PLAYERS_UPDATE', payload: msg.players });
        break;

      // AI generation in progress — always show loading screen now (all games use AI)
      case 'ai_generating':
        dispatch({ type: 'AI_GENERATING', subject: msg.subject, difficulty: msg.difficulty, aiMode: msg.aiMode });
        break;

      // AI generation succeeded — game will follow via question_start
      case 'game_script_ready':
        dispatch({ type: 'GAME_STARTED_AI' });
        break;

      // AI generation failed — return to lobby with error
      case 'ai_mode_failed':
        dispatch({ type: 'AI_MODE_FAILED', payload: msg.message });
        break;

      case 'insufficient_credits':
        dispatch({ type: 'INSUFFICIENT_CREDITS' });
        break;

      case 'question_start':
        currentQuestionIndexRef.current = msg.index || 0;
        hasAnsweredRef.current = false; // reset for each new question
        // Stop any TTS still playing from the previous question
        ttsPlayer.stop();
        dispatch({ type: 'QUESTION_START', payload: msg });
        // Play round-start sound on the very first question of every round (index 0)
        if (msg.index === 0) soundManager.play('round-start');
        // Cancel any stale q-intro timer left from the previous question
        cancelQuestionCommentaryRef.current();
        break;

      case 'question_audio': {
        // Server sends a URL (iOS-safe) — play via normal HTTP fetch, same as WAV sounds.
        // Falls back to base64 data for any older server versions.
        const shouldPlay = !voiceMutedRef.current
          && !hasAnsweredRef.current
          && !(msg.muteForPlayers && !isHostRef.current);

        if (shouldPlay && msg.url) {
          ttsPlayer.playUrl(msg.url);
        } else if (shouldPlay && msg.data) {
          ttsPlayer.playBase64(msg.data);
        } else if (!shouldPlay) {
          console.log('[audio] question_audio skipped — muted:', voiceMutedRef.current,
            'answered:', hasAnsweredRef.current, 'muteForPlayers:', msg.muteForPlayers);
        }
        break;
      }

      case 'question_audio_fallback': {
        // Fallback when ElevenLabs TTS fails (quota exceeded, API error, etc.)
        // Use Web Speech API (free, unlimited, works offline but lower quality)
        const shouldPlay = !voiceMutedRef.current
          && !hasAnsweredRef.current
          && !(msg.muteForPlayers && !isHostRef.current);

        if (shouldPlay && Platform.OS === 'web' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
          console.log('[audio] Using Web Speech API fallback for question');
          window.speechSynthesis.cancel(); // Stop any previous speech
          const utterance = new SpeechSynthesisUtterance(msg.text);
          utterance.rate = 0.9;    // Slightly slower for clarity
          utterance.pitch = 1.0;
          utterance.volume = 1.0;
          window.speechSynthesis.speak(utterance);
        } else if (!shouldPlay) {
          console.log('[audio] question_audio_fallback skipped — muted:', voiceMutedRef.current);
        } else {
          console.log('[audio] Web Speech API not available on this platform');
        }
        break;
      }

      case 'timer_tick':
        dispatch({ type: 'TIMER_TICK', payload: msg.remaining });
        // Only play tick at exactly 5 and 3 to avoid 5 overlapping audio instances
        if (msg.remaining === 5 || msg.remaining === 3) soundManager.play('tick');
        break;

      case 'answer_result':
        dispatch({ type: 'ANSWER_RESULT', payload: msg });
        hasAnsweredRef.current = true; // suppress any late-arriving question_audio
        // Cancel the pending q-intro timer — player already answered, no point
        // playing "Here we go!" now (especially on the last question).
        cancelQuestionCommentaryRef.current();
        // Stop question audio immediately — no need to keep reading the question
        // once the player has answered. ttsPlayer.stop() increments the epoch so
        // any previously scheduled callbacks are also cancelled.
        ttsPlayer.stop();
        if (msg.correct === true) {
          soundManager.play('correct');
          // schedule() sees !isPlaying (we just stopped) → fires after 200ms
          playCommentaryRef.current(msg.streak > 1 ? 'streak' : 'correct', true, playerNameRef.current);
        }
        if (msg.correct === false) {
          soundManager.play('wrong');
          playCommentaryRef.current('wrong', true, playerNameRef.current);
        }
        break;
        
      case 'banter_audio':
        // AI-generated banter after a player answers (server-side generation).
        // Play after correct/wrong sound + commentary (1-2s delay).
        if (voiceEnabledRef.current && !voiceMutedRef.current && msg.url) {
          ttsPlayer.schedule(() => ttsPlayer.playUrl(msg.url), 1500);
        }
        // Show banter text even if audio is muted
        if (msg.text) {
          setTimeout(() => setAiComment(msg.text), 1500);
        }
        break;

      case 'question_end':
        // Stop reading the question aloud — no point continuing once time's up
        // and the correct answer is about to be revealed.
        ttsPlayer.stop();
        dispatch({
          type: 'QUESTION_END',
          payload: { leaderboard: msg.leaderboard, correctAnswer: msg.correctAnswer },
        });
        break;

      case 'leaderboard_update':
      case 'score-update':
        dispatch({ type: 'LEADERBOARD_UPDATE', payload: msg.leaderboard });
        break;

      case 'game_over':
        dispatch({ type: 'GAME_OVER', payload: msg.leaderboard });
        // Cancel any pending q-intro timer (last question answered before 700ms)
        cancelQuestionCommentaryRef.current();
        // Stop all audio and cancel pending schedule() callbacks (epoch++)
        // so no stale correct/wrong commentary leaks into the gameover screen.
        ttsPlayer.stop();
        soundManager.play('game-over');
        // Gameover commentary fires after game-over sound effect (~1.5s) has played.
        // Plain setTimeout is fine here — game_over is terminal so no further
        // phase transitions can invalidate it.
        gameoverCommentaryTimeoutRef.current = setTimeout(() => {
          gameoverCommentaryTimeoutRef.current = null;
          playCommentaryRef.current('gameover', false);
        }, 2000);
        break;

      case 'round_end':
        ttsPlayer.stop();
        cancelQuestionCommentaryRef.current();
        soundManager.play('game-over'); // triumphant round-end sound
        dispatch({ type: 'ROUND_END', payload: msg });
        // Play round-break commentary (not gameover — there are more rounds)
        setTimeout(() => {
          playCommentaryRef.current('round_break', false);
        }, 2000);
        break;

      case 'round_start':
        dispatch({ type: 'ROUND_START', payload: msg });
        break;

      case 'ad_break':
        dispatch({ type: 'AD_BREAK', payload: msg });
        break;

      case 'spectator_mode_updated':
        dispatch({
          type: 'SPECTATOR_MODE_UPDATED',
          payload: { enabled: msg.spectatorModeEnabled, count: msg.spectatorCount },
        });
        break;

      case 'spectator_count':
        dispatch({ type: 'SPECTATOR_COUNT', payload: msg.count });
        break;

      case 'voice_updated':
        dispatch({ type: 'VOICE_UPDATED', payload: msg.voiceEnabled !== false });
        break;
        
      case 'banter_updated':
        dispatch({ type: 'BANTER_UPDATED', payload: msg.banterEnabled !== false });
        break;

      case 'voice_answers_updated':
        dispatch({ type: 'VOICE_ANSWERS_UPDATED', payload: msg.voiceAnswers === true });
        break;

      case 'host_voice_updated':
        dispatch({ type: 'HOST_VOICE_UPDATED', payload: msg.voiceId });
        break;

      case 'mute_players_updated':
        dispatch({ type: 'MUTE_PLAYERS_UPDATED', payload: msg.muted === true });
        break;

      case 'game_mode_updated':
        dispatch({ type: 'GAME_MODE_UPDATED', payload: { gameMode: msg.gameMode, modeState: msg.modeState } });
        break;

      case 'lifeline_used':
        dispatch({ type: 'MODE_STATE_UPDATED', payload: { lifelines: msg.lifelines, lastLifeline: { type: msg.lifeline, result: msg.result } } });
        soundManager.play('correct'); // play a chime for lifeline use
        break;

      case 'walked_away':
        ttsPlayer.stop();
        dispatch({ type: 'GAME_OVER', payload: msg.leaderboard });
        soundManager.play('game-over');
        break;

      case 'player_buzzed':
        dispatch({ type: 'MODE_STATE_UPDATED', payload: msg.modeState });
        soundManager.play('tick');
        break;

      case 'buzzer_unlocked':
        dispatch({ type: 'MODE_STATE_UPDATED', payload: msg.modeState });
        break;

      // Chase mode messages
      case 'chase_offer':
        dispatch({ type: 'MODE_STATE_UPDATED', payload: { ...msg.modeState, phase: 'offer', cashBuilt: msg.cashBuilt, offers: msg.offers } });
        dispatch({ type: 'SET_PHASE', payload: 'chase_offer' });
        break;

      case 'chase_offer_accepted':
        dispatch({ type: 'MODE_STATE_UPDATED', payload: msg.modeState });
        break;

      case 'chase_phase_start':
        dispatch({ type: 'MODE_STATE_UPDATED', payload: msg.modeState });
        break;

      case 'chaser_answered':
        dispatch({ type: 'MODE_STATE_UPDATED', payload: msg.modeState });
        soundManager.play(msg.correct ? 'wrong' : 'tick'); // wrong for chaser correct (bad for us)
        break;

      case 'chase_result':
        dispatch({ type: 'MODE_STATE_UPDATED', payload: { ...msg.modeState, chaserWon: msg.caught } });
        if (msg.caught) soundManager.play('game-over');
        break;

      case 'error':
        dispatch({ type: 'SET_ERROR', payload: msg.message });
        break;

      default:
        break;
    }
  }, []);

  const handleStateChange = useCallback((connectionState) => {
    dispatch({ type: 'SET_CONNECTION', payload: connectionState });
  }, []);

  const getWS = useCallback(() => {
    if (!wsRef.current) {
      wsRef.current = new TriviaWebSocket(WS_URL, handleMessage, handleStateChange);
    }
    return wsRef.current;
  }, [handleMessage, handleStateChange]);

  const connect = useCallback(async () => {
    const ws = getWS();
    await ws.connect();
    return ws;
  }, [getWS]);

  const send = useCallback((obj) => {
    getWS().send(obj);
  }, [getWS]);

  const disconnect = useCallback(() => {
    wsRef.current?.disconnect();
    wsRef.current = null;
    dispatch({ type: 'RESET' });
  }, []);

  const submitAnswer = useCallback((index) => {
    dispatch({ type: 'ANSWER_SUBMITTED', payload: index });
    send({ type: 'submit_answer', answer: index });
  }, [send]);

  const startGame = useCallback((aiMode = false, subject = null, difficulty = 'medium', userId = null, mutePlayersOnStart = false, userFullName = null, testMode = false, numRounds = 1, questionsPerRound = 4) => {
    dispatch({ type: 'ROUND_START', payload: { round: 1, totalRounds: numRounds } });
    send({ type: 'start_game', aiMode, subject, difficulty, userId, mutePlayersOnStart, userFullName, testMode, numRounds, questionsPerRound });
  }, [send]);

  const toggleMute = useCallback(() => {
    const newMuted = !state.voiceMuted;
    dispatch({ type: 'MUTE_TOGGLED', payload: newMuted });
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') localStorage.setItem('trivia_voice_muted', newMuted);
    if (newMuted) ttsPlayer.stop();
  }, [state.voiceMuted]);

  const toggleMutePlayers = useCallback(() => {
    const newMuted = !state.mutePlayersOnStart;
    send({ type: 'set_mute_players', muted: newMuted });
    // Optimistically update local state — server will broadcast back to confirm
    dispatch({ type: 'MUTE_PLAYERS_UPDATED', payload: newMuted });
  }, [state.mutePlayersOnStart, send]);

  const toggleSoundEffects = useCallback(() => {
    const newMuted = !state.soundEffectsMuted;
    if (newMuted) {
      soundManager.mute();
    } else {
      soundManager.unmute();
    }
    dispatch({ type: 'SOUND_EFFECTS_TOGGLED', payload: newMuted });
  }, [state.soundEffectsMuted]);

  const clearInsufficientCredits = useCallback(() => {
    dispatch({ type: 'CLEAR_INSUFFICIENT_CREDITS' });
  }, []);

  const setGameMode = useCallback((gameMode) => {
    send({ type: 'set_game_mode', gameMode });
  }, [send]);

  const useLifeline = useCallback((lifeline) => {
    send({ type: 'use_lifeline', lifeline });
  }, [send]);

  const walkAway = useCallback(() => {
    send({ type: 'walk_away' });
  }, [send]);

  return (
    <GameContext.Provider value={{ state, connect, send, disconnect, submitAnswer, startGame, aiComment, toggleMute, toggleMutePlayers, toggleSoundEffects, clearInsufficientCredits, setGameMode, useLifeline, walkAway }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}

export default GameContext;
