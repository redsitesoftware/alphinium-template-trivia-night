/**
 * useAgent — Quiz Master AI commentary hook
 *
 * Connects to the /ai-agent WebSocket on the trivia server and streams
 * personalised AI commentary (powered by Ollama / dolphin-mistral).
 *
 * Falls back gracefully to canned responses when the AI endpoint is
 * unavailable or when EXPO_PUBLIC_ALPHINIUM_AI_URL is not set.
 *
 * The URL is auto-derived on web (same host, /ai-agent path) and on
 * native from EXPO_PUBLIC_WS_URL. Override via EXPO_PUBLIC_ALPHINIUM_AI_URL.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { ALPHINIUM_AI_URL } from '../config';

// Canned fallback commentary for offline/stub mode
const FALLBACK_COMMENTS = {
  question_start: [
    '🤔 Think fast!',
    '💡 I know this one... do you?',
    '🎯 Focus, focus!',
    "⏱ The clock's ticking!",
    '🧠 Time to put that brain to work!',
  ],
  correct: [
    '🔥 Nailed it!',
    '✨ Brilliant!',
    "🎉 You're on fire!",
    '💪 That streak is impressive!',
    '🏆 Championship form!',
  ],
  wrong: [
    "😬 Ooh, so close!",
    "🤷 Can't win 'em all!",
    '📚 Now you know!',
    "💪 Shake it off — next one's yours!",
    "🎲 Tough break!",
  ],
  game_over: [
    '🏁 What a game!',
    '🎊 Thanks for playing!',
    '🌟 Legends all around!',
    '🎮 GG everyone!',
  ],
  streak: [
    '🔥 STREAKING! Unstoppable!',
    '⚡ They cannot be stopped!',
    '🚀 On a roll!',
  ],
};

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * @param {object} options
 * @param {string}   options.roomCode      — current room code
 * @param {string}   [options.playerName]  — this player's display name
 * @param {Array}    [options.players]     — full player list [{ id, name, score }]
 * @param {Array}    [options.leaderboard] — current leaderboard
 * @param {boolean}  [options.enabled]     — set false to disable AI
 * @returns {{ comment: string|null, isConnected: boolean, sendEvent: Function }}
 */
export function useAgent({ roomCode, playerName, players = [], leaderboard = [], enabled = true } = {}) {
  const [comment, setComment] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  const commentTimerRef = useRef(null);

  const clearComment = useCallback((delay = 6000) => {
    if (commentTimerRef.current) clearTimeout(commentTimerRef.current);
    commentTimerRef.current = setTimeout(() => setComment(null), delay);
  }, []);

  const showComment = useCallback((text, duration = 6000) => {
    setComment(text);
    clearComment(duration);
  }, [clearComment]);

  // Connect to the AI agent WebSocket when we have a room code
  useEffect(() => {
    if (!enabled || !ALPHINIUM_AI_URL || !roomCode) return;

    const url = `${ALPHINIUM_AI_URL}?room=${roomCode}`;
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      console.warn('[useAgent] WebSocket construction failed:', e.message);
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      console.log('[useAgent] Connected to Quiz Master AI');
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'commentary' && msg.text) {
          showComment(msg.text, msg.duration || 6000);
        }
      } catch {}
    };

    ws.onerror = () => {
      // Silently fall back to stub mode — AI commentary is non-critical
      setIsConnected(false);
    };

    ws.onclose = () => setIsConnected(false);

    return () => {
      ws.onclose = null;
      ws.close();
      wsRef.current = null;
      setIsConnected(false);
    };
  }, [enabled, roomCode, showComment]);

  /**
   * sendEvent — call from GameContext on each game event.
   *
   * Translates internal event types to server game_event format.
   * In live mode: sends to AI WS endpoint.
   * In stub mode: generates local canned response immediately.
   *
   * @param {object} event  — { type, ...eventData }
   */
  const sendEvent = useCallback((event) => {
    if (!enabled) return;

    // Map internal event types to server game_event format
    let serverEvent = null;
    let questionIndex = event.index ?? event.questionIndex ?? 0;

    switch (event.type) {
      case 'question_start':
        serverEvent = 'question_intro';
        break;
      case 'hint':
        serverEvent = 'hint';
        break;
      case 'answer_result':
        if (event.streak >= 3) serverEvent = 'streak';
        else if (event.correct) serverEvent = 'correct';
        else serverEvent = 'wrong';
        break;
      case 'game_over':
        serverEvent = 'game_over';
        break;
      case 'game_intro':
        serverEvent = 'game_intro';
        break;
      default:
        break;
    }

    // Live AI mode — send to server; commentary arrives via onmessage
    if (serverEvent && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'game_event',
        event: serverEvent,
        questionIndex,
        playerName: event.playerName || playerName || undefined,
        rank: event.rank || undefined,
        score: event.score || undefined,
        totalPlayers: event.totalPlayers || undefined,
      }));
      return;
    }

    // Stub / offline mode — generate local commentary
    let text = null;
    const pName = event.playerName || playerName;
    switch (event.type) {
      case 'question_start':
        text = pickRandom(FALLBACK_COMMENTS.question_start);
        break;
      case 'answer_result':
        if (event.streak >= 3) {
          text = pName ? `🔥 ${pName} is on a streak! Unstoppable!` : pickRandom(FALLBACK_COMMENTS.streak);
        } else if (event.correct) {
          text = pName ? `✨ Nice one, ${pName}!` : pickRandom(FALLBACK_COMMENTS.correct);
        } else {
          text = pName ? `😬 Tough break, ${pName}! Next one's yours.` : pickRandom(FALLBACK_COMMENTS.wrong);
        }
        break;
      case 'game_over': {
        const medals = ['🥇', '🥈', '🥉'];
        if (pName && event.rank) {
          const medal = medals[event.rank - 1] || `#${event.rank}`;
          const others = event.totalPlayers > 1 ? ` out of ${event.totalPlayers}` : '';
          text = `${medal} ${pName} — ${event.score} pts${others}! What a game! 🎮`;
        } else {
          text = pickRandom(FALLBACK_COMMENTS.game_over);
        }
        break;
      }
      default:
        break;
    }

    if (text) showComment(text);
  }, [enabled, playerName, showComment]);

  return { comment, isConnected, sendEvent };
}

export default useAgent;

