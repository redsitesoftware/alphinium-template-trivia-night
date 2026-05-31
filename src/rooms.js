const { v4: uuidv4 } = require('uuid');
const { getShuffledQuestions } = require('./questions');
const { recordScore } = require('./scoreHistory');
const { DEFAULT_VOICE_ID } = require('./tts');

const MAX_PLAYERS = 8;
const QUESTION_TIME_SECS = 30;
const AD_BREAK_DURATION_MS = 15000;
const TIMER_MIN = 10;
const TIMER_MAX = 120;
const ROUNDS_MIN = 1;
const ROUNDS_MAX = 5;
const QPR_MIN = 2;   // questions per round min
const QPR_MAX = 10;  // questions per round max

/**
 * Validate a questionTimeSecs value.
 * Returns null on success, or an error string on failure.
 */
function validateTimerSeconds(val) {
  if (typeof val !== 'number' || !Number.isInteger(val)) {
    return 'questionTimeSecs must be an integer';
  }
  if (val < TIMER_MIN || val > TIMER_MAX) {
    return `questionTimeSecs must be between ${TIMER_MIN} and ${TIMER_MAX}`;
  }
  return null;
}
const rooms = new Map();

// Optional hook called after each question_start broadcast — used by server for TTS generation.
let _onQuestionStart = null;
function setQuestionStartHook(fn) { _onQuestionStart = fn; }

// Optional hook called at end of each non-final round — used by server to generate next round.
// Signature: (room) => void
let _onRoundEnd = null;
function setRoundEndHook(fn) { _onRoundEnd = fn; }

function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateJoinCode() : code;
}

function createRoom(hostWs, hostName) {
  const code = generateJoinCode();
  const hostId = uuidv4();
  const room = {
    code,
    hostId,
    hostName,
    state: 'lobby',
    isPublic: false,
    gameMode: 'classic',  // classic | millionaire | buzzer | chase
    modeState: {},        // Mode-specific state (lifelines, buzz order, etc.)
    voiceEnabled: true,
    banterEnabled: true,  // AI banter enabled by default
    voiceAnswers: true,   // voice answer input enabled by default
    voiceId: DEFAULT_VOICE_ID,
    subject: null,
    difficulty: 'medium',
    players: new Map([[hostId, { id: hostId, name: hostName, score: 0, streak: 0, ws: hostWs }]]),
    questions: [],
    currentQuestion: -1,
    currentRound: 0,
    totalRounds: 1,
    questionsPerRound: 4,
    usedQuestionTexts: [],  // accumulates all question text across rounds to avoid repeats
    timer: null,
    timerStartedAt: null,
    answeredThisRound: new Set(),
    spectatorModeEnabled: true,
    spectators: new Map(),
    questionTimeSecs: QUESTION_TIME_SECS,
    adsEnabled: false,
  };
  rooms.set(code, room);
  return { room, playerId: hostId };
}

/**
 * HTTP-friendly variant: creates a room without requiring a WebSocket connection.
 * The host WebSocket can be attached later via attachPlayerWs().
 */
function createRoomHttp(hostName) {
  return createRoom(null, hostName);
}

function joinRoom(code, ws, playerName, nickname) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return { error: 'Room not found' };
  if (room.state !== 'lobby') return { error: 'Game already in progress' };
  if (room.players.size >= MAX_PLAYERS) return { error: 'Room is full' };

  const playerId = uuidv4();
  room.players.set(playerId, { id: playerId, name: playerName, nickname, score: 0, streak: 0, ws });
  return { room, playerId };
}

/**
 * HTTP-friendly variant: joins a room without requiring a WebSocket connection.
 * The player WebSocket can be attached later via attachPlayerWs().
 */
function joinRoomHttp(code, playerName, nickname) {
  return joinRoom(code, null, playerName, nickname);
}

/**
 * Attach (or update) the WebSocket for an existing player in a room.
 */
function attachPlayerWs(playerId, ws) {
  for (const room of rooms.values()) {
    const player = room.players.get(playerId);
    if (player) {
      player.ws = ws;
      return room;
    }
  }
  return null;
}

function getRoom(code) {
  return rooms.get(code.toUpperCase()) || null;
}

function getRoomByPlayer(playerId) {
  for (const room of rooms.values()) {
    if (room.players.has(playerId)) return room;
  }
  return null;
}

function getLeaderboard(room) {
  return [...room.players.values()]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ rank: i + 1, name: p.name, nickname: p.nickname, score: p.score, id: p.id, streak: p.streak || 0, multiplier: getMultiplier(p.streak || 0) }));
}

function getMultiplier(streak) {
  if (streak >= 7) return 3;
  if (streak >= 5) return 2;
  if (streak >= 3) return 1.5;
  return 1;
}

function broadcast(room, message) {
  const data = JSON.stringify(message);
  for (const player of room.players.values()) {
    if (player.ws && player.ws.readyState === 1) {
      player.ws.send(data);
    }
  }
  for (const spectator of room.spectators.values()) {
    if (spectator.ws && spectator.ws.readyState === 1) {
      spectator.ws.send(data);
    }
  }
}

function nextQuestion(room, onTimerTick, onTimerEnd, onGameOver) {
  if (room.timer) clearInterval(room.timer);
  room.currentQuestion++;

  if (room.currentQuestion >= room.questions.length) {
    // End of questions for this round — record all used question texts
    room.usedQuestionTexts = [
      ...(room.usedQuestionTexts || []),
      ...room.questions.map(q => q.question),
    ];
    const isLastRound = room.currentRound >= room.totalRounds - 1;

    if (isLastRound) {
      // ── Game over ──
      room.state = 'finished';
      const leaderboard = getLeaderboard(room);
      const finishedAt = new Date().toISOString();
      for (const entry of leaderboard) {
        recordScore({ playerName: entry.name, nickname: entry.nickname || entry.name, roomId: room.code, score: entry.score, timestamp: finishedAt });
      }
      broadcast(room, { type: 'game_over', leaderboard });
      if (onGameOver) onGameOver();
    } else {
      // ── Round break: more rounds to come ──
      room.state = 'round_break';
      const leaderboard = getLeaderboard(room);
      broadcast(room, {
        type: 'round_end',
        round: room.currentRound + 1,      // 1-indexed for display
        totalRounds: room.totalRounds,
        leaderboard,
      });
      if (_onRoundEnd) _onRoundEnd(room, onTimerTick, onTimerEnd, onGameOver);
    }
    return;
  }

  const q = room.questions[room.currentQuestion];
  room.timerStartedAt = Date.now();
  room.answeredThisRound = new Set();

  // Reset buzzer state for new question
  if (room.gameMode === 'buzzer' && room.modeState) {
    room.modeState.buzzOrder = [];
    room.modeState.lockedPlayer = null;
  }

  // Chase: reset per-question chaser state
  if (room.gameMode === 'chase' && room.modeState) {
    room.modeState.chaserAnswered = false;
  }

  const timeSecs = room.questionTimeSecs;
  const questionData = {
    type: 'question_start',
    index: room.currentQuestion,
    total: room.questions.length,
    round: room.currentRound + 1,         // 1-indexed
    totalRounds: room.totalRounds,
    question: q.question,
    options: q.options,
    category: q.category,
    timeLimit: timeSecs,
    gameMode: room.gameMode,
    modeState: room.modeState,
  };
  broadcast(room, questionData);
  if (_onQuestionStart) _onQuestionStart(room, questionData);

  let remaining = timeSecs;
  room.timer = setInterval(() => {
    remaining--;
    onTimerTick(room, remaining);
    if (remaining <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      room.state = 'leaderboard';
      onTimerEnd(room, onTimerTick, onTimerEnd, onGameOver);
    }
  }, 1000);
}

/** Load the next round's questions and advance the round counter. */
function startNextRound(room, questions, onTimerTick, onTimerEnd, onGameOver) {
  room.currentRound++;
  room.currentQuestion = -1;
  room.questions = questions;
  room.answeredThisRound = new Set();

  if (room.adsEnabled) {
    room.state = 'ad_break';
    broadcast(room, {
      type: 'ad_break',
      duration: AD_BREAK_DURATION_MS,
      round: room.currentRound + 1,   // 1-indexed
      totalRounds: room.totalRounds,
    });
    setTimeout(() => {
      if (room.state !== 'ad_break') return;
      _startRound(room, onTimerTick, onTimerEnd, onGameOver);
    }, AD_BREAK_DURATION_MS);
  } else {
    _startRound(room, onTimerTick, onTimerEnd, onGameOver);
  }
}

function _startRound(room, onTimerTick, onTimerEnd, onGameOver) {
  room.state = 'question';
  broadcast(room, {
    type: 'round_start',
    round: room.currentRound + 1,         // 1-indexed
    totalRounds: room.totalRounds,
  });
  nextQuestion(room, onTimerTick, onTimerEnd, onGameOver);
}

function startGame(room, onTimerTick, onTimerEnd, onGameOver, customQuestions) {
  if (room.state !== 'lobby') return false;
  room.questions = customQuestions && customQuestions.length > 0
    ? customQuestions
    : getShuffledQuestions(room.questionsPerRound || 4);
  room.currentQuestion = -1;
  room.currentRound = 0;
  room.state = 'question';
  nextQuestion(room, onTimerTick, onTimerEnd, onGameOver);
  return true;
}

function submitAnswer(room, playerId, answerIndex, onTimerTick, onTimerEnd) {
  if (room.state !== 'question') return { error: 'No active question' };
  if (room.answeredThisRound && room.answeredThisRound.has(playerId)) {
    return { error: 'Already answered' };
  }

  const q = room.questions[room.currentQuestion];
  const player = room.players.get(playerId);
  if (!player) return { error: 'Player not found' };

  room.answeredThisRound.add(playerId);

  const isCorrect = answerIndex === q.answer;
  
  // Millionaire Mode: Special answer handling
  if (room.gameMode === 'millionaire') {
    if (isCorrect) {
      room.modeState.currentLevel++;
      
      // Update safe haven at levels 5 and 10
      if (room.modeState.currentLevel === 5) {
        room.modeState.safeHaven = room.modeState.moneyLadder[4]; // $1,000
      } else if (room.modeState.currentLevel === 10) {
        room.modeState.safeHaven = room.modeState.moneyLadder[9]; // $32,000
      }
      
      // Check if won the game (reached level 15)
      if (room.modeState.currentLevel >= 15) {
        player.score = room.modeState.moneyLadder[14]; // $1,000,000
        if (room.timer) {
          clearInterval(room.timer);
          room.timer = null;
        }
        room.state = 'gameover';
        return { 
          correct: true, 
          won: true,
          winnings: player.score,
          correctAnswer: q.answer 
        };
      }
      
      player.score = room.modeState.moneyLadder[room.modeState.currentLevel - 1];
    } else {
      // Wrong answer: drop to safe haven, game over
      player.score = room.modeState.safeHaven;
      if (room.timer) {
        clearInterval(room.timer);
        room.timer = null;
      }
      room.state = 'gameover';
      return { 
        correct: false, 
        gameover: true,
        winnings: player.score,
        correctAnswer: q.answer 
      };
    }
    
    // Continue to next question
    if (room.timer) {
      clearInterval(room.timer);
      room.timer = null;
    }
    room.state = 'leaderboard';
    onTimerEnd(room, onTimerTick, onTimerEnd);
    
    return { 
      correct: isCorrect, 
      level: room.modeState.currentLevel,
      winnings: player.score,
      safeHaven: room.modeState.safeHaven,
      correctAnswer: q.answer 
    };
  }

  // Buzzer Mode: Only locked player can answer; wrong = unlock for next buzzer
  if (room.gameMode === 'buzzer') {
    if (room.modeState.lockedPlayer !== playerId) {
      return { error: 'Not your turn to answer' };
    }
    if (isCorrect) {
      player.score = (player.score || 0) + 10;
      // End question
      if (room.timer) { clearInterval(room.timer); room.timer = null; }
      room.state = 'leaderboard';
      onTimerEnd(room, onTimerTick, onTimerEnd);
      return { correct: true, points: 10, correctAnswer: q.answer };
    } else {
      // Deduct 5 and unlock for next buzzer
      player.score = Math.max(0, (player.score || 0) - 5);
      room.modeState.lockedPlayer = null;
      // Remove from buzzOrder so UI can show who was wrong
      return { correct: false, points: -5, correctAnswer: null, unlocked: true, modeState: room.modeState };
    }
  }

  // Chase Mode: cash_builder phase → offer → chase phase
  if (room.gameMode === 'chase') {
    const cs = room.modeState;

    if (cs.phase === 'cash_builder') {
      // Contestant answers to build cash; each correct = +1000
      if (isCorrect) {
        cs.cashBuilt = (cs.cashBuilt || 0) + 1000;
        player.score = cs.cashBuilt;
      }
      // End question naturally (timer or all-answered logic below handles flow)
    } else if (cs.phase === 'chase') {
      // Both contestant and chaser answer; chaser is simulated
      if (isCorrect) {
        cs.contestantSteps = (cs.contestantSteps || 0) + 1;
        player.score = (player.score || 0) + (cs.offer || cs.cashBuilt || 0);
      }
      // Simulate chaser answer ~70% accuracy after 2-3s
      if (!cs.chaserAnswered) {
        cs.chaserAnswered = true;
        const chaserDelay = 2000 + Math.random() * 2000;
        setTimeout(() => {
          if (room.state !== 'question') return;
          const chaserCorrect = Math.random() < 0.70;
          if (chaserCorrect) {
            cs.chaserSteps = (cs.chaserSteps || 0) + 1;
            if (cs.chaserSteps >= cs.chaserGap) {
              // Chaser caught contestant — game over
              if (room.timer) { clearInterval(room.timer); room.timer = null; }
              room.state = 'gameover';
              room.modeState.chaserWon = true;
              broadcast(room, { type: 'chase_result', caught: true, modeState: cs });
              const [oTick, oEnd, oOver] = global._triviaHooks || [];
              if (oEnd) oEnd(room, oTick, oEnd, oOver);
              return;
            }
          }
          broadcast(room, { type: 'chaser_answered', correct: chaserCorrect, modeState: cs });

          // Both contestant & chaser have now answered — end question early
          if (room.timer) { clearInterval(room.timer); room.timer = null; }
          if (room.state === 'question') {
            room.state = 'leaderboard';
            const [oTick, oEnd, oOver] = global._triviaHooks || [];
            if (oEnd) oEnd(room, oTick, oEnd, oOver);
          }
        }, chaserDelay);
      }
    }

    // Chase mode handles its own scoring above; skip classic scoring.
    // Cash builder: end early when contestant answers (move fast through questions).
    // Chase phase: do NOT end early here — wait for chaser's simulated response
    // in the setTimeout above to end the question (or let the timer expire).
    const allAnsweredChase = cs.phase === 'cash_builder' ? allPlayersAnswered(room) : false;
    if (allAnsweredChase && onTimerTick && onTimerEnd) {
      if (room.timer) { clearInterval(room.timer); room.timer = null; }
      room.state = 'leaderboard';
      onTimerEnd(room, onTimerTick, onTimerEnd);
    }
    return { correct: isCorrect, points: 0, correctAnswer: q.answer, allAnswered: allAnsweredChase };
  }
  
  // Classic Mode: Original scoring logic
  let points = 0;
  let multiplier = 1;
  if (isCorrect) {
    player.streak = (player.streak || 0) + 1;
    multiplier = getMultiplier(player.streak);
    const elapsed = (Date.now() - room.timerStartedAt) / 1000;
    const timeSecs = room.questionTimeSecs;
    const remainingSeconds = Math.max(0, timeSecs - elapsed);
    const basePoints = Math.round(1000 * remainingSeconds / timeSecs);
    points = Math.round(basePoints * multiplier);
    player.score += points;
  } else {
    player.streak = 0;
  }

  const allAnswered = allPlayersAnswered(room);
  if (allAnswered && onTimerTick && onTimerEnd) {
    if (room.timer) {
      clearInterval(room.timer);
      room.timer = null;
    }
    room.state = 'leaderboard';
    onTimerEnd(room, onTimerTick, onTimerEnd);
  }

  return { correct: isCorrect, points, correctAnswer: q.answer, allAnswered, streak: player.streak, multiplier };
}

/**
 * Set the question timer duration for a room.
 * Only allowed while the room is in the lobby state.
 * Returns { error } if invalid, otherwise updates room.questionTimeSecs.
 */
function setTimer(room, duration) {
  if (room.state !== 'lobby') return { error: 'Timer can only be set before the game starts' };
  const secs = Number(duration);
  if (!Number.isInteger(secs) || secs < 10 || secs > 120) {
    return { error: 'Timer duration must be an integer between 10 and 120' };
  }
  room.questionTimeSecs = secs;
  return { duration: secs };
}

function joinAsSpectator(room, ws) {
  const spectatorId = uuidv4();
  room.spectators.set(spectatorId, { id: spectatorId, ws });
  return { spectatorId };
}

function removeSpectator(room, spectatorId) {
  room.spectators.delete(spectatorId);
}

function getSpectatorCount(room) {
  return room.spectators.size;
}

function allPlayersAnswered(room) {
  if (!room || room.state !== 'question') return false;
  if (room.players.size === 0) return false;
  return room.answeredThisRound.size >= room.players.size;
}

function disconnectAllSpectators(room, noticeMessage) {
  const notice = JSON.stringify({ type: 'spectator_removed', reason: noticeMessage });
  for (const spectator of room.spectators.values()) {
    if (spectator.ws && spectator.ws.readyState === 1) {
      spectator.ws.send(notice);
      spectator.ws = null;
    }
  }
  room.spectators.clear();
}

function broadcastToHost(room, message) {
  const host = room.players.get(room.hostId);
  if (host && host.ws && host.ws.readyState === 1) {
    host.ws.send(JSON.stringify(message));
  }
}

/**
 * Delete a room by code, clearing any active timer and removing all associated data.
 * Returns the deleted room object, or null if the room was not found.
 */
function deleteRoom(code) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return null;
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }
  if (room.leaderboardTimer) {
    clearTimeout(room.leaderboardTimer);
    room.leaderboardTimer = null;
  }
  rooms.delete(room.code);
  return room;
}

function setQuestionTimeSecs(room, value) {
  if (!Number.isInteger(value) || value < 10 || value > 120) {
    return { error: 'questionTimeSecs must be an integer between 10 and 120' };
  }
  room.questionTimeSecs = value;
  return { ok: true };
}

function getPublicRooms() {
  const result = [];
  for (const room of rooms.values()) {
    if (room.isPublic && room.state === 'lobby') {
      result.push({
        code: room.code,
        hostName: room.hostName,
        subject: room.subject,
        difficulty: room.difficulty,
        playerCount: room.players.size,
      });
    }
  }
  return result;
}

function setRoomPublic(code, isPublic) {
  const room = rooms.get(code);
  if (!room) return false;
  room.isPublic = isPublic;
  return true;
}

module.exports = {
  rooms,
  createRoom,
  createRoomHttp,
  joinRoom,
  joinRoomHttp,
  attachPlayerWs,
  getRoom,
  getRoomByPlayer,
  getLeaderboard,
  getMultiplier,
  broadcast,
  startGame,
  nextQuestion,
  submitAnswer,
  setTimer,
  deleteRoom,
  joinAsSpectator,
  removeSpectator,
  getSpectatorCount,
  allPlayersAnswered,
  disconnectAllSpectators,
  broadcastToHost,
  setQuestionTimeSecs,
  QUESTION_TIME_SECS,
  validateTimerSeconds,
  getPublicRooms,
  setRoomPublic,
  setQuestionStartHook,
  setRoundEndHook,
  startNextRound,
  ROUNDS_MIN, ROUNDS_MAX, QPR_MIN, QPR_MAX,
};
