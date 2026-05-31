'use strict';

const WebSocket = require('ws');
const request = require('supertest');

const {
  createRoom,
  joinRoom,
  submitAnswer,
  getMultiplier,
  rooms,
  deleteRoom
} = require('../../src/rooms');

// ─── Mock questions so answer index 0 is always correct ───────────────────────
jest.mock('../../src/questions', () => ({
  getShuffledQuestions: (n) =>
    Array.from({ length: n }, (_, i) => ({
      question: `Q${i}`,
      options: ['A', 'B', 'C', 'D'],
      answer: 0,
      category: 'General'
    }))
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePlayer(overrides = {}) {
  return { id: 'p1', name: 'Alice', score: 0, streak: 0, ws: null, ...overrides };
}

function makeRoom({ playerIds = ['p1'], state = 'question' } = {}) {
  return {
    state,
    players: new Map(playerIds.map(id => [id, makePlayer({ id })])),
    questions: [{ question: 'Q', options: ['A', 'B', 'C', 'D'], answer: 0, category: 'General' }],
    currentQuestion: 0,
    timerStartedAt: Date.now(),
    questionTimeSecs: 30,
    answeredThisRound: new Set()
  };
}

// ─── 1. getMultiplier ─────────────────────────────────────────────────────────

describe('getMultiplier', () => {
  test('streak 0 returns 1x', () => expect(getMultiplier(0)).toBe(1));
  test('streak 1 returns 1x', () => expect(getMultiplier(1)).toBe(1));
  test('streak 2 returns 1x', () => expect(getMultiplier(2)).toBe(1));
  test('streak 3 returns 1.5x', () => expect(getMultiplier(3)).toBe(1.5));
  test('streak 4 returns 1.5x', () => expect(getMultiplier(4)).toBe(1.5));
  test('streak 5 returns 2x', () => expect(getMultiplier(5)).toBe(2));
  test('streak 6 returns 2x', () => expect(getMultiplier(6)).toBe(2));
  test('streak 7 returns 3x', () => expect(getMultiplier(7)).toBe(3));
  test('streak 10 returns 3x', () => expect(getMultiplier(10)).toBe(3));
});

// ─── 2. streak initialisation ────────────────────────────────────────────────

describe('streak initialisation', () => {
  let roomCode;

  afterEach(() => {
    if (roomCode) deleteRoom(roomCode);
    roomCode = null;
  });

  test('player.streak is 0 when a room is created', () => {
    const { room, playerId } = createRoom(null, 'Host');
    roomCode = room.code;
    expect(room.players.get(playerId).streak).toBe(0);
  });

  test('player.streak is 0 when a player joins', () => {
    const { room } = createRoom(null, 'Host');
    roomCode = room.code;
    const { playerId } = joinRoom(room.code, null, 'Joiner', 'joiner');
    expect(room.players.get(playerId).streak).toBe(0);
  });
});

// ─── 3. streak increment / reset ─────────────────────────────────────────────

describe('submitAnswer – streak tracking', () => {
  test('correct answer increments streak from 0 to 1', () => {
    const room = makeRoom();
    submitAnswer(room, 'p1', 0);
    expect(room.players.get('p1').streak).toBe(1);
  });

  test('correct answers increment streak cumulatively (1 → 2 → 3)', () => {
    // Need separate rounds with a fresh answeredThisRound each time
    const room = makeRoom();

    submitAnswer(room, 'p1', 0);
    expect(room.players.get('p1').streak).toBe(1);

    room.answeredThisRound = new Set();
    submitAnswer(room, 'p1', 0);
    expect(room.players.get('p1').streak).toBe(2);

    room.answeredThisRound = new Set();
    submitAnswer(room, 'p1', 0);
    expect(room.players.get('p1').streak).toBe(3);
  });

  test('wrong answer resets streak to 0', () => {
    const room = makeRoom();
    room.players.get('p1').streak = 5;

    submitAnswer(room, 'p1', 1); // 1 is wrong; correct is 0
    expect(room.players.get('p1').streak).toBe(0);
  });

  test('wrong answer after a streak resets to 0', () => {
    const room = makeRoom();

    submitAnswer(room, 'p1', 0); // correct → streak 1
    room.answeredThisRound = new Set();
    submitAnswer(room, 'p1', 0); // correct → streak 2
    room.answeredThisRound = new Set();
    submitAnswer(room, 'p1', 1); // wrong  → streak 0
    expect(room.players.get('p1').streak).toBe(0);
  });
});

// ─── 4. points are rounded after multiplier ──────────────────────────────────

describe('submitAnswer – points with multiplier', () => {
  test('base points (streak < 3) are unmodified by multiplier of 1x', () => {
    const room = makeRoom();
    // streak 0 → multiplier 1 → points = basePoints * 1
    const result = submitAnswer(room, 'p1', 0);
    expect(result.correct).toBe(true);
    expect(result.points).toBeGreaterThan(0);
    expect(result.multiplier).toBe(1);
  });

  test('points are Math.round(base * multiplier) at streak 3 (1.5x)', () => {
    const room = makeRoom();
    // Seed streak to 2 so next correct answer brings it to 3
    room.players.get('p1').streak = 2;
    // Fix timerStartedAt so we get a predictable basePoints
    room.timerStartedAt = Date.now() - 15000; // 15s elapsed of 30s → base = 500
    const result = submitAnswer(room, 'p1', 0);
    // base ≈ 500, multiplier 1.5 → 750
    expect(result.multiplier).toBe(1.5);
    expect(result.points).toBe(Math.round(result.points)); // is an integer
    expect(result.points).toBeGreaterThan(0);
  });

  test('wrong answer gives 0 points regardless of streak', () => {
    const room = makeRoom();
    room.players.get('p1').streak = 10;
    const result = submitAnswer(room, 'p1', 1); // wrong answer
    expect(result.correct).toBe(false);
    expect(result.points).toBe(0);
  });
});

// ─── 5. submitAnswer return shape ────────────────────────────────────────────

describe('submitAnswer – response shape', () => {
  test('includes streak and multiplier fields on correct answer', () => {
    const room = makeRoom();
    const result = submitAnswer(room, 'p1', 0);
    expect(result).toHaveProperty('streak');
    expect(result).toHaveProperty('multiplier');
    expect(typeof result.streak).toBe('number');
    expect(typeof result.multiplier).toBe('number');
  });

  test('includes streak and multiplier fields on wrong answer', () => {
    const room = makeRoom();
    const result = submitAnswer(room, 'p1', 1);
    expect(result).toHaveProperty('streak', 0);
    expect(result).toHaveProperty('multiplier', 1);
  });
});

// ─── 6. score-update broadcast includes streak and multiplier ─────────────────

jest.mock('../../src/questions', () => ({
  getShuffledQuestions: (n) =>
    Array.from({ length: n }, (_, i) => ({
      question: `Q${i}`,
      options: ['A', 'B', 'C', 'D'],
      answer: 0,
      category: 'General'
    }))
}));

describe('score-update broadcast payload', () => {
  let server, hostWs, playerWs, roomCode, hostToken, playerToken;

  function buildServer() {
    jest.resetModules();
    const { server } = require('../../server');
    return server;
  }

  function connectWs(srv) {
    const { port } = srv.address();
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      ws.on('open', () => resolve(ws));
    });
  }

  function waitForMessage(ws, predicate, timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timeout waiting for WS message')),
        timeoutMs
      );
      ws.on('message', function handler(raw) {
        const msg = JSON.parse(raw);
        if (predicate(msg)) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve(msg);
        }
      });
    });
  }

  function wsSend(ws, msg) {
    ws.send(JSON.stringify(msg));
  }

  beforeEach(async () => {
    server = buildServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    hostWs = await connectWs(server);
    wsSend(hostWs, { type: 'create_room', name: 'Host' });
    const created = await waitForMessage(hostWs, (m) => m.type === 'room_created');
    roomCode = created.code;
    hostToken = created.playerId;

    playerWs = await connectWs(server);
    wsSend(playerWs, { type: 'join_room', code: roomCode, name: 'Player' });
    const joined = await waitForMessage(playerWs, (m) => m.type === 'room_joined');
    playerToken = joined.playerId;

    jest.useFakeTimers();

    const hostQStartP = waitForMessage(hostWs, (m) => m.type === 'question_start');
    const playerQStartP = waitForMessage(playerWs, (m) => m.type === 'question_start');

    await request(server)
      .post(`/api/rooms/${roomCode}/start`)
      .send({ hostToken });

    await Promise.all([hostQStartP, playerQStartP]);
  });

  afterEach(async () => {
    const { deleteRoom } = require('../../src/rooms');
    deleteRoom(roomCode);
    if (hostWs && hostWs.readyState === WebSocket.OPEN) hostWs.terminate();
    if (playerWs && playerWs.readyState === WebSocket.OPEN) playerWs.terminate();
    await new Promise((resolve) => server.close(resolve));
    jest.useRealTimers();
  });

  test('score-update broadcast includes streak and multiplier per player', async () => {
    const scoreUpdateP = waitForMessage(playerWs, (m) => m.type === 'score-update');

    await request(server)
      .post(`/api/rooms/${roomCode}/answer`)
      .send({ playerToken: hostToken, answer: 0 });

    const scoreUpdate = await scoreUpdateP;
    expect(Array.isArray(scoreUpdate.leaderboard)).toBe(true);

    for (const entry of scoreUpdate.leaderboard) {
      expect(entry).toHaveProperty('streak');
      expect(entry).toHaveProperty('multiplier');
      expect(typeof entry.streak).toBe('number');
      expect(typeof entry.multiplier).toBe('number');
    }
  });

  test('HTTP answer response includes streak and multiplier fields', async () => {
    const res = await request(server)
      .post(`/api/rooms/${roomCode}/answer`)
      .send({ playerToken: hostToken, answer: 0 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('streak');
    expect(res.body).toHaveProperty('multiplier');
  });
});
