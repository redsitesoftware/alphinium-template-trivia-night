'use strict';

/**
 * Regression tests for multiplier field in WebSocket broadcast payloads.
 * Asserts that `question_end`, `leaderboard_update`, and `game_over`
 * leaderboard entries all contain a numeric `multiplier` field.
 * Prevents regression of the fix in #468 (closes #469).
 */

const WebSocket = require('ws');

// Use 3 questions so we can reach game_over in the final test
const FIXED_QUESTIONS = [
  { id: 1, question: 'Q1', options: ['A', 'B', 'C', 'D'], answer: 0, category: 'Test' },
  { id: 2, question: 'Q2', options: ['A', 'B', 'C', 'D'], answer: 0, category: 'Test' },
  { id: 3, question: 'Q3', options: ['A', 'B', 'C', 'D'], answer: 0, category: 'Test' },
];

function buildServer() {
  jest.resetModules();
  jest.doMock('../../src/questions', () => ({
    getShuffledQuestions: () => [...FIXED_QUESTIONS],
  }));
  const { server } = require('../../server');
  return server;
}

function wsSend(ws, msg) {
  ws.send(JSON.stringify(msg));
}

function connectWs(server) {
  const { port } = server.address();
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => resolve(ws));
  });
}

function waitForMessage(ws, predicate) {
  return new Promise((resolve) => {
    function handler(raw) {
      const msg = JSON.parse(raw);
      if (predicate(msg)) {
        ws.off('message', handler);
        resolve(msg);
      }
    }
    ws.on('message', handler);
  });
}

// ─── helpers to assert multiplier shape ───────────────────────────────────────

function assertLeaderboardMultipliers(leaderboard) {
  expect(Array.isArray(leaderboard)).toBe(true);
  expect(leaderboard.length).toBeGreaterThan(0);
  for (const entry of leaderboard) {
    expect(entry).toHaveProperty('multiplier');
    expect(typeof entry.multiplier).toBe('number');
  }
}

// ─── suite ────────────────────────────────────────────────────────────────────

describe('multiplier field present in broadcast payloads', () => {
  let server, hostWs, playerWs, roomCode;

  beforeEach(async () => {
    jest.useFakeTimers();
    server = buildServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    hostWs = await connectWs(server);
    wsSend(hostWs, { type: 'create_room', name: 'Host' });
    const created = await waitForMessage(hostWs, (m) => m.type === 'room_created');
    roomCode = created.code;

    playerWs = await connectWs(server);
    wsSend(playerWs, { type: 'join_room', code: roomCode, name: 'Player' });
    await waitForMessage(playerWs, (m) => m.type === 'room_joined');

    // Start the game and wait for both clients to receive question_start
    const hostQP = waitForMessage(hostWs, (m) => m.type === 'question_start');
    const playerQP = waitForMessage(playerWs, (m) => m.type === 'question_start');
    wsSend(hostWs, { type: 'start_game' });
    await Promise.all([hostQP, playerQP]);
  });

  afterEach(async () => {
    if (hostWs && hostWs.readyState === WebSocket.OPEN) hostWs.close();
    if (playerWs && playerWs.readyState === WebSocket.OPEN) playerWs.close();
    jest.useRealTimers();
    await new Promise((resolve) => server.close(resolve));
  });

  // ── question_end ────────────────────────────────────────────────────────────

  test('question_end leaderboard entries each have a numeric multiplier field', async () => {
    const questionEndP = waitForMessage(hostWs, (m) => m.type === 'question_end');

    // Both players answer to trigger early question_end
    wsSend(hostWs, { type: 'submit_answer', answer: 0 }); // correct
    wsSend(playerWs, { type: 'submit_answer', answer: 1 }); // incorrect

    const questionEnd = await questionEndP;
    assertLeaderboardMultipliers(questionEnd.leaderboard);
  });

  // ── leaderboard_update ──────────────────────────────────────────────────────

  test('leaderboard_update leaderboard entries each have a numeric multiplier field', async () => {
    const lbUpdateP = waitForMessage(playerWs, (m) => m.type === 'leaderboard_update');

    wsSend(hostWs, { type: 'submit_answer', answer: 0 });
    wsSend(playerWs, { type: 'submit_answer', answer: 1 });

    const lbUpdate = await lbUpdateP;
    assertLeaderboardMultipliers(lbUpdate.leaderboard);
  });

  // ── game_over ───────────────────────────────────────────────────────────────

  test('game_over leaderboard entries each have a numeric multiplier field', async () => {
    // Play through all 3 questions
    for (let i = 0; i < 3; i++) {
      wsSend(hostWs, { type: 'submit_answer', answer: 0 });
      wsSend(playerWs, { type: 'submit_answer', answer: 0 });
      await waitForMessage(hostWs, (m) => m.type === 'question_end');

      if (i < 2) {
        const nextQP = waitForMessage(hostWs, (m) => m.type === 'question_start' && m.index === i + 1);
        jest.advanceTimersByTime(5000);
        await nextQP;
      }
    }

    const gameOverP = waitForMessage(hostWs, (m) => m.type === 'game_over');
    jest.advanceTimersByTime(5000);
    const gameOver = await gameOverP;

    assertLeaderboardMultipliers(gameOver.leaderboard);
  }, 30_000);

  // ── multiplier values match getMultiplier(streak) ──────────────────────────

  test('question_end multiplier values match getMultiplier(streak) for each entry', async () => {
    const { getMultiplier } = require('../../src/rooms');

    const questionEndP = waitForMessage(hostWs, (m) => m.type === 'question_end');
    wsSend(hostWs, { type: 'submit_answer', answer: 0 }); // correct → streak 1
    wsSend(playerWs, { type: 'submit_answer', answer: 1 }); // incorrect → streak 0

    const questionEnd = await questionEndP;
    for (const entry of questionEnd.leaderboard) {
      expect(entry.multiplier).toBe(getMultiplier(entry.streak));
    }
  });

  test('game_over multiplier values match getMultiplier(streak) for each entry', async () => {
    const { getMultiplier } = require('../../src/rooms');

    // Host answers correctly all 3 rounds → streak 3 → multiplier 1.5
    // Player answers incorrectly all 3 rounds → streak 0 → multiplier 1
    for (let i = 0; i < 3; i++) {
      wsSend(hostWs, { type: 'submit_answer', answer: 0 }); // correct
      wsSend(playerWs, { type: 'submit_answer', answer: 1 }); // incorrect
      await waitForMessage(hostWs, (m) => m.type === 'question_end');

      if (i < 2) {
        const nextQP = waitForMessage(hostWs, (m) => m.type === 'question_start' && m.index === i + 1);
        jest.advanceTimersByTime(5000);
        await nextQP;
      }
    }

    const gameOverP = waitForMessage(hostWs, (m) => m.type === 'game_over');
    jest.advanceTimersByTime(5000);
    const gameOver = await gameOverP;

    for (const entry of gameOver.leaderboard) {
      expect(entry.multiplier).toBe(getMultiplier(entry.streak));
    }

    // Verify the host accumulated streak 3 → 1.5x multiplier
    const hostEntry = gameOver.leaderboard.find((e) => e.name === 'Host');
    expect(hostEntry.streak).toBe(3);
    expect(hostEntry.multiplier).toBe(1.5);

    // Player answered wrong every round → streak 0 → 1x multiplier
    const playerEntry = gameOver.leaderboard.find((e) => e.name === 'Player');
    expect(playerEntry.streak).toBe(0);
    expect(playerEntry.multiplier).toBe(1);
  }, 30_000);
});
