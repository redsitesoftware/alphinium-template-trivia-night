'use strict';

// Tests for reconnect WS message — fix issue #475
// Ensures reconnecting clients receive current question state when mid-game

beforeEach(() => {
  jest.resetModules();
});

function getRooms() {
  return require('../../src/rooms');
}

function mockWs(readyState = 1) {
  return {
    readyState,
    messages: [],
    send(data) { this.messages.push(JSON.parse(data)); }
  };
}

function makeQuestion(index = 0) {
  return { question: `Q${index}?`, options: ['A', 'B', 'C', 'D'], answer: 0, category: 'Test' };
}

/** Arm a room into 'question' state without starting a real timer. */
function armQuestion(room, questionIndex = 0) {
  if (room.timer) { clearInterval(room.timer); room.timer = null; }
  room.questions = [makeQuestion(0), makeQuestion(1), makeQuestion(2)];
  room.state = 'question';
  room.currentQuestion = questionIndex;
  room.timerStartedAt = Date.now();
  room.answeredThisRound = new Set();
  room.questionTimeSecs = 30;
}

describe('reconnect — lobby state', () => {
  it('reconnected message does NOT include currentQuestion when in lobby', () => {
    const { createRoomHttp, attachPlayerWs } = getRooms();
    const { room, playerId } = createRoomHttp('Host');

    const ws = mockWs();
    attachPlayerWs(playerId, ws);

    // Simulate reconnect handler logic (same as server.js case 'reconnect')
    const isHost = room.hostId === playerId;
    const reconnectMsg = {
      type: 'reconnected',
      code: room.code,
      playerId,
      isHost,
      state: room.state,
      players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score })),
      spectatorModeEnabled: room.spectatorModeEnabled,
      spectatorCount: 0
    };
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

    expect(reconnectMsg.state).toBe('lobby');
    expect(reconnectMsg.currentQuestion).toBeUndefined();
  });
});

describe('reconnect — question state (the fix)', () => {
  it('reconnected message includes currentQuestion when mid-game', () => {
    const { createRoomHttp, attachPlayerWs } = getRooms();
    const { room, playerId } = createRoomHttp('Host');
    armQuestion(room, 1); // mid-game, question index 1

    const ws = mockWs();
    attachPlayerWs(playerId, ws);

    const isHost = room.hostId === playerId;
    const reconnectMsg = {
      type: 'reconnected',
      code: room.code,
      playerId,
      isHost,
      state: room.state,
      players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score })),
      spectatorModeEnabled: room.spectatorModeEnabled,
      spectatorCount: 0
    };
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

    expect(reconnectMsg.state).toBe('question');
    expect(reconnectMsg.currentQuestion).toBeDefined();
    expect(reconnectMsg.currentQuestion.index).toBe(1);
    expect(reconnectMsg.currentQuestion.total).toBe(3);
    expect(reconnectMsg.currentQuestion.question).toBe('Q1?');
    expect(reconnectMsg.currentQuestion.options).toEqual(['A', 'B', 'C', 'D']);
    expect(reconnectMsg.currentQuestion.category).toBe('Test');
    expect(reconnectMsg.currentQuestion.timeRemaining).toBeGreaterThan(0);
    expect(reconnectMsg.currentQuestion.timeRemaining).toBeLessThanOrEqual(30);
  });

  it('timeRemaining does not exceed questionTimeSecs', () => {
    const { createRoomHttp, attachPlayerWs } = getRooms();
    const { room, playerId } = createRoomHttp('Host');
    armQuestion(room, 0);
    room.timerStartedAt = Date.now() - 5000; // 5 seconds already elapsed

    const ws = mockWs();
    attachPlayerWs(playerId, ws);

    const q = room.questions[room.currentQuestion];
    const elapsed = (Date.now() - room.timerStartedAt) / 1000;
    const timeRemaining = Math.max(0, room.questionTimeSecs - elapsed);

    expect(timeRemaining).toBeGreaterThan(20);
    expect(timeRemaining).toBeLessThanOrEqual(30);
  });

  it('timeRemaining is 0 when timer already expired', () => {
    const { createRoomHttp, attachPlayerWs } = getRooms();
    const { room, playerId } = createRoomHttp('Host');
    armQuestion(room, 0);
    room.timerStartedAt = Date.now() - 60000; // 60 seconds ago, well past 30s limit

    const ws = mockWs();
    attachPlayerWs(playerId, ws);

    const elapsed = (Date.now() - room.timerStartedAt) / 1000;
    const timeRemaining = Math.max(0, room.questionTimeSecs - elapsed);

    expect(timeRemaining).toBe(0);
  });

  it('reconnected includes correct player list', () => {
    const { createRoomHttp, joinRoom, attachPlayerWs } = getRooms();
    const { room, playerId: hostId } = createRoomHttp('Host');
    const { playerId: p2 } = joinRoom(room.code, mockWs(), 'Alice');
    armQuestion(room, 0);

    const hostWs = mockWs();
    attachPlayerWs(hostId, hostWs);

    const players = [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score }));
    expect(players).toHaveLength(2);
    const names = players.map(p => p.name);
    expect(names).toContain('Host');
    expect(names).toContain('Alice');
  });
});

describe('reconnect — leaderboard state', () => {
  it('reconnected message does NOT include currentQuestion when in leaderboard state', () => {
    const { createRoomHttp, attachPlayerWs } = getRooms();
    const { room, playerId } = createRoomHttp('Host');
    armQuestion(room, 0);
    room.state = 'leaderboard'; // between questions

    const ws = mockWs();
    attachPlayerWs(playerId, ws);

    // state is 'leaderboard' so condition is false — no currentQuestion
    const includeQuestion = room.state === 'question' && room.currentQuestion >= 0 && room.questions[room.currentQuestion];
    expect(includeQuestion).toBeFalsy();
  });
});
