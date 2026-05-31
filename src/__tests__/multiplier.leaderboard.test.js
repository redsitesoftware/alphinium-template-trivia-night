'use strict';

/**
 * Regression tests for issue #469 / fix #468:
 * `multiplier` must be present as a numeric field in every leaderboard entry
 * emitted by `question_end`, `leaderboard_update`, and `game_over` WebSocket
 * broadcasts.
 */

const WebSocket = require('ws');

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Fixed 3-question set: correct answer is always index 0.
// Using a fixed-length array ensures game_over fires after 3 rounds regardless
// of the `n` argument passed by startGame (which hardcodes 10).
const FIXED_QUESTIONS = [
  { question: 'Q0', options: ['A', 'B', 'C', 'D'], answer: 0, category: 'General' },
  { question: 'Q1', options: ['A', 'B', 'C', 'D'], answer: 0, category: 'General' },
  { question: 'Q2', options: ['A', 'B', 'C', 'D'], answer: 0, category: 'General' },
];

function buildServer() {
  jest.resetModules();
  jest.doMock('../../src/questions', () => ({
    getShuffledQuestions: () => [...FIXED_QUESTIONS],
  }));
  return require('../../server').server;
}

function connectWs(srv) {
  const { port } = srv.address();
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => resolve(ws));
  });
}

function wsSend(ws, msg) {
  ws.send(JSON.stringify(msg));
}

// No built-in timeout — compatible with jest.useFakeTimers(); Jest test
// timeout guards against hangs.
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

function assertLeaderboardHasNumericMultiplier(leaderboard) {
  expect(Array.isArray(leaderboard)).toBe(true);
  expect(leaderboard.length).toBeGreaterThan(0);
  for (const entry of leaderboard) {
    expect(entry).toHaveProperty('multiplier');
    expect(typeof entry.multiplier).toBe('number');
  }
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('multiplier field in leaderboard broadcasts (regression #468)', () => {
  let server, hostWs, playerWs, roomCode, hostToken;

  beforeEach(async () => {
    jest.useFakeTimers();

    server = buildServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    hostWs = await connectWs(server);
    wsSend(hostWs, { type: 'create_room', name: 'Host' });
    const created = await waitForMessage(hostWs, (m) => m.type === 'room_created');
    roomCode = created.code;
    hostToken = created.playerId;

    playerWs = await connectWs(server);
    wsSend(playerWs, { type: 'join_room', code: roomCode, name: 'Player' });
    await waitForMessage(playerWs, (m) => m.type === 'room_joined');

    // Start the game and wait for the first question
    const hostQStart = waitForMessage(hostWs, (m) => m.type === 'question_start');
    const playerQStart = waitForMessage(playerWs, (m) => m.type === 'question_start');
    wsSend(hostWs, { type: 'start_game' });
    await Promise.all([hostQStart, playerQStart]);
  });

  afterEach(async () => {
    if (hostWs && hostWs.readyState === WebSocket.OPEN) hostWs.terminate();
    if (playerWs && playerWs.readyState === WebSocket.OPEN) playerWs.terminate();
    jest.useRealTimers();
    await new Promise((resolve) => server.close(resolve));
  });

  test('question_end leaderboard entries each have a numeric multiplier field', async () => {
    const questionEndP = waitForMessage(hostWs, (m) => m.type === 'question_end');

    // Both players submit — triggers early-advance to question_end
    wsSend(hostWs, { type: 'submit_answer', answer: 0 }); // correct
    wsSend(playerWs, { type: 'submit_answer', answer: 1 }); // incorrect

    const questionEnd = await questionEndP;
    assertLeaderboardHasNumericMultiplier(questionEnd.leaderboard);
  });

  test('leaderboard_update leaderboard entries each have a numeric multiplier field', async () => {
    const lbUpdateP = waitForMessage(hostWs, (m) => m.type === 'leaderboard_update');

    wsSend(hostWs, { type: 'submit_answer', answer: 0 });
    wsSend(playerWs, { type: 'submit_answer', answer: 1 });

    const lbUpdate = await lbUpdateP;
    assertLeaderboardHasNumericMultiplier(lbUpdate.leaderboard);
  });

  test('game_over leaderboard entries each have a numeric multiplier field', async () => {

    // Play through all 3 questions to reach game_over
    for (let i = 0; i < 3; i++) {
      const questionEndP = waitForMessage(hostWs, (m) => m.type === 'question_end');
      wsSend(hostWs, { type: 'submit_answer', answer: 0 });
      wsSend(playerWs, { type: 'submit_answer', answer: 0 });
      await questionEndP;

      if (i < 2) {
        const nextQP = waitForMessage(
          hostWs,
          (m) => m.type === 'question_start' && m.index === i + 1
        );
        jest.advanceTimersByTime(5000);
        await nextQP;
      }
    }

    const gameOverP = waitForMessage(hostWs, (m) => m.type === 'game_over');
    jest.advanceTimersByTime(5000);
    const gameOver = await gameOverP;

    assertLeaderboardHasNumericMultiplier(gameOver.leaderboard);
  }, 30_000);

  test('multiplier values match getMultiplier(streak) expectations', async () => {
    // Both players submit correctly on Q1 → streak becomes 1 → multiplier should be 1
    const questionEndP = waitForMessage(hostWs, (m) => m.type === 'question_end');
    wsSend(hostWs, { type: 'submit_answer', answer: 0 });
    wsSend(playerWs, { type: 'submit_answer', answer: 0 });
    const questionEnd = await questionEndP;

    for (const entry of questionEnd.leaderboard) {
      // streak 1 → multiplier 1 (streak 0-2 maps to 1x)
      expect(entry.multiplier).toBe(1);
    }
  });
});
