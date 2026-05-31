/**
 * AI Host — Quiz Master engine
 *
 * Architecture:
 *   - Server calls generateGame() directly when host starts game with AI mode
 *   - Full game script (questions + all QM commentary) generated in ONE LLM call
 *   - Script cached in memory, keyed by room code
 *   - Client connects to /ai-agent WS to receive commentary events during gameplay
 *   - Zero AI latency during game — all lines pre-baked at start
 *
 * LLM provider priority:
 *   1. Groq  — if GROQ_API_KEY set: ~3-5s via LPU hardware (llama-3.1-8b-instant)
 *   2. Ollama — fallback: ~90s via dolphin-mistral on CPU
 *
 * Environment:
 *   GROQ_API_KEY      — Groq API key. If set, Groq is used as primary provider.
 *   GROQ_MODEL        — Groq model.   Default: llama-3.1-8b-instant
 *   OLLAMA_URL        — Ollama base URL. Fallback when Groq unavailable. Default: '' (disabled)
 *   OLLAMA_MODEL      — Ollama model tag. Default: dolphin-mistral:latest
 *   OLLAMA_TIMEOUT_MS — Per-request timeout ms. Default: 120000
 */

'use strict';

const GROQ_API_KEY      =  process.env.GROQ_API_KEY || '';
const GROQ_MODEL        =  process.env.GROQ_MODEL   || 'llama-3.1-8b-instant';
const OLLAMA_URL        = (process.env.OLLAMA_URL   || '').replace(/\/$/, '');
const OLLAMA_MODEL      =  process.env.OLLAMA_MODEL || 'dolphin-mistral:latest';
const OLLAMA_TIMEOUT_MS = parseInt(process.env.OLLAMA_TIMEOUT_MS || '120000', 10);

// Cached game scripts keyed by room code
const gameScripts = new Map();

function getScript(roomCode)         { return gameScripts.get(roomCode); }
function setScript(roomCode, script) { gameScripts.set(roomCode, script); }
function deleteScript(roomCode)      { gameScripts.delete(roomCode); }

// ---------------------------------------------------------------------------
// Canned fallback pools (used when Ollama unavailable or for edge cases)
// ---------------------------------------------------------------------------
const CANNED = {
  intro:    ['🎙️ The Quiz Master is in the house! Let\'s see who the sharpest minds are tonight!'],
  qm_intro: [
    '🎯 Eyes on the screen — here comes question {n}!',
    '🧠 Think carefully now — this one\'s a test of real brainpower!',
    '⏱️ You\'ve got {sec} seconds — make \'em count!',
    '🎲 Okay players, here we go — question {n}!',
  ],
  qm_hint:  [
    '💡 Psst... think about it from a different angle!',
    '🤔 Still thinking? The clock is your enemy right now...',
    '⏰ Tick tock! Maybe eliminate the obvious wrong answers first?',
  ],
  correct:  ['🔥 Nailed it!', '✨ Brilliant!', '🏆 Champion form!'],
  wrong:    ['😬 Bold choice. Wrong choice.', '📚 And now you know!', '🤷 Can\'t win \'em all!'],
  game_over:['🏁 What a game! Thanks for playing!', '🎊 GG everyone! You were all legends (some more than others).'],
};

function pick(arr, vars = {}) {
  let s = arr[Math.floor(Math.random() * arr.length)];
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}

// ---------------------------------------------------------------------------
// Groq API — OpenAI-compatible, ~3-5s via LPU hardware
// ---------------------------------------------------------------------------
async function callGroq(prompt) {
  if (!GROQ_API_KEY) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000); // 30s should be very generous
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.85,
        max_tokens: 2000,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const err = await res.text().catch(() => res.status);
      console.warn('[aiHost] Groq error:', res.status, String(err).slice(0, 200));
      return null;
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    clearTimeout(timer);
    console.warn('[aiHost] Groq error:', err.name === 'AbortError' ? 'timeout' : err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Ollama concurrency guard — bounded promise queue, max 3 concurrent/queued
// ---------------------------------------------------------------------------
const OLLAMA_QUEUE_MAX = 3;
let _ollamaQueue = Promise.resolve();
let _ollamaQueueDepth = 0;

async function withOllamaLock(fn) {
  if (_ollamaQueueDepth >= OLLAMA_QUEUE_MAX) {
    console.warn(`[aiHost] Ollama queue full (depth=${_ollamaQueueDepth}) — dropping request`);
    return null;
  }
  _ollamaQueueDepth++;
  // Chain onto the shared queue so requests execute sequentially
  const result = _ollamaQueue.then(() => fn()).finally(() => { _ollamaQueueDepth--; });
  // Advance the queue pointer; swallow rejections so they don't block subsequent requests
  _ollamaQueue = result.then(() => {}, () => {});
  return result;
}

// ---------------------------------------------------------------------------
// Ollama HTTP — streaming with early JSON completion detection
// ---------------------------------------------------------------------------
async function callOllama(prompt, timeoutMs = OLLAMA_TIMEOUT_MS, numPredict = 2500) {
  if (!OLLAMA_URL) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: true,
        options: { num_predict: numPredict, temperature: 0.85, top_p: 0.9, repeat_penalty: 1.1 },
      }),
      signal: controller.signal,
    });

    // Stream tokens; stop early once the closing JSON bracket is received.
    let text = '';
    let bracketDepth = 0;
    let inString = false;
    let escape = false;
    let jsonStarted = false;
    let jsonComplete = false;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split('\n')) {
        if (!line.trim()) continue;
        let obj;
        try { obj = JSON.parse(line); } catch { continue; }
        const token = obj.response || '';
        text += token;

        // Track bracket depth to detect when the top-level JSON array/object closes.
        // escape flag is always reset after the char following a backslash, regardless of context.
        for (const ch of token) {
          if (escape) { escape = false; continue; }
          if (ch === '\\') { escape = true; continue; }  // handles \" inside strings correctly
          if (ch === '"') { inString = !inString; continue; }
          if (inString) continue;
          if (ch === '[' || ch === '{') { bracketDepth++; jsonStarted = true; }
          else if ((ch === ']' || ch === '}') && bracketDepth > 0) {
            bracketDepth--;
            if (jsonStarted && bracketDepth === 0) { jsonComplete = true; break; }
          }
        }

        if (jsonComplete || obj.done) break outer;
      }
    }

    clearTimeout(timer);
    try { reader.cancel(); } catch {}
    return text.trim() || null;
  } catch (err) {
    clearTimeout(timer);
    console.warn('[aiHost] Ollama error:', err.name === 'AbortError' ? 'timeout' : err.message);
    return null;
  }
}

// Quick reachability check — resolves true/false within 5 seconds
async function checkOllamaHealth() {
  if (!OLLAMA_URL) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

// Health check for whichever provider is active
async function checkLLMHealth() {
  if (GROQ_API_KEY) return true; // Groq is API-based — assume healthy; callGroq() handles failures
  return checkOllamaHealth();
}

// exported in module.exports at bottom of file

// ---------------------------------------------------------------------------
// Game script generator — one big prompt, returns structured JSON
// ---------------------------------------------------------------------------

// Popular trivia categories rotated randomly when no subject is chosen
const POPULAR_CATEGORIES = [
  'Science & Technology', 'World History', 'Geography', 'Pop Culture & Celebrities',
  'Sport & Athletics', 'Music (all eras)', 'Movies & TV Shows', 'Food & Drink',
  'Nature & Animals', 'Space & Astronomy', 'Video Games', 'Politics & Current Events',
  'Art & Literature', 'Business & Tech Companies', 'Mythology & Ancient Civilisations',
];

function pickCategories(n = 5) {
  const shuffled = [...POPULAR_CATEGORIES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n).join(', ');
}

function buildQuestionsOnlyPrompt(numQuestions, subject, difficulty, usedQuestions = []) {
  const difficultyGuide = {
    easy:   'Well-known mainstream facts. Most people should have a fair chance. Think pub quiz round 1.',
    medium: 'Requires some knowledge — not too obscure but not dead obvious. Think pub quiz round 3.',
    hard:   'Specialist knowledge, precise facts, deep-cuts. Expect most players to get most wrong.',
  };

  const subjectLine = subject
    ? `ALL questions must be about: "${subject}". Do not drift to other topics.`
    : `Randomly mix questions from these categories this game: ${pickCategories(5)}. Vary the categories evenly. Include current/recent events and pop culture where relevant.`;

  const exclusionBlock = usedQuestions.length > 0
    ? `\nDO NOT repeat any of these questions from previous rounds:\n${usedQuestions.map(q => `- ${q}`).join('\n')}\n`
    : '';

  return `Generate ${numQuestions} trivia questions for a pub quiz game.

DIFFICULTY: ${difficulty.toUpperCase()} — ${difficultyGuide[difficulty] || difficultyGuide.medium}
SUBJECT: ${subjectLine}
${exclusionBlock}
Return ONLY a valid JSON object (no markdown, no explanation):
{
  "questions": [
    {
      "question": "A clear trivia question",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": 0,
      "category": "Category name"
    }
  ]
}

Rules:
- Exactly ${numQuestions} questions
- Factually correct with exactly 1 correct answer (answer = 0-indexed in options array)
- Questions should feel fresh and varied — avoid clichés like "What is the chemical symbol for gold"
- Include questions about recent years (2020-2025) where possible
- Write for VOICE: spell out abbreviations ("approximately" not "approx.", "versus" not "vs.", "kilometres" not "km"), avoid symbols (use "percent" not "%", "degrees Celsius" not "°C", "and" not "&"), write numbers naturally as they would be spoken
- ONLY return the JSON object, nothing else`;
}

function buildGamePrompt(players, numQuestions, subject, difficulty, usedQuestions = []) {
  const names = players.join(', ');

  const difficultyGuide = {
    easy:   'Questions should be well-known, mainstream facts that most people have a good chance of knowing. Avoid niche or specialist knowledge. Think pub quiz "round 1" level.',
    medium: 'Questions should require some knowledge or thought — not too obscure but not dead obvious either. Think pub quiz "round 3" level. Mix of easy and tricky.',
    hard:   'Questions should be genuinely challenging — specialist knowledge, precise facts, dates, records, or deep-cuts that only enthusiasts would know. Think pub quiz "final round" level. Expect most players to get most questions wrong.',
  };

  const subjectLine = subject
    ? `ALL questions must be specifically about: "${subject}". Every question must relate directly to this subject — do not drift to other topics.`
    : `Randomly mix questions from these categories this game: ${pickCategories(5)}. Vary the categories evenly. Include current/recent events and pop culture where relevant.`;

  const exclusionBlock = usedQuestions.length > 0
    ? `\nDO NOT repeat any of these questions from previous rounds:\n${usedQuestions.map(q => `- ${q}`).join('\n')}\n`
    : '';

  return `You are "The Quiz Master" — an energetic, witty, slightly cheeky trivia night host.

Generate a complete trivia game JSON for these players: ${names}

DIFFICULTY: ${difficulty.toUpperCase()}
${difficultyGuide[difficulty] || difficultyGuide.medium}

SUBJECT: ${subjectLine}
${exclusionBlock}
Return ONLY valid JSON matching this exact structure (no markdown, no explanation):
{
  "intro": "Exciting 1-sentence welcome mentioning player names and building hype.",
  "questions": [
    {
      "question": "A clear trivia question",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": 0,
      "category": "Category name",
      "qm_intro": "1 punchy sentence when question appears. Tease players. No answer hints."
    }
  ]
}

Rules:
- Generate exactly ${numQuestions} questions
- Exactly 1 correct answer (answer = 0-indexed position in options array)
- Questions should feel fresh and varied
- Include questions about recent years (2020-2025) where possible
- Write for VOICE: spell out abbreviations ("approximately" not "approx.", "versus" not "vs.", "kilometres" not "km"), avoid symbols (use "percent" not "%", "degrees Celsius" not "°C", "and" not "&"), write numbers naturally as they would be spoken
- ONLY return the JSON object, nothing else`;
}

function parseGameScript(raw) {
  // Strip markdown code fences if model wrapped the response
  const cleaned = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
  // Sometimes models add trailing text after the closing brace
  const lastBrace = cleaned.lastIndexOf('}');
  const trimmed = lastBrace > 0 ? cleaned.slice(0, lastBrace + 1) : cleaned;
  return JSON.parse(trimmed);
}

// ---------------------------------------------------------------------------
// Main export: generate full game (called server-side, not via WS)
// ---------------------------------------------------------------------------
async function generateGame(roomCode, players, numQuestions = 10, subject = null, difficulty = 'medium', questionsOnly = false, usedQuestions = []) {
  if (!GROQ_API_KEY && !OLLAMA_URL) {
    console.log('[aiHost] No LLM provider configured (set GROQ_API_KEY or OLLAMA_URL) — AI mode disabled');
    return null;
  }

  // Return cached script immediately if pre-gen already finished
  const cached = getScript(roomCode);
  if (cached) {
    console.log(`[aiHost] ⚡ Cache hit for room ${roomCode} — returning pre-generated script`);
    return cached;
  }

  const names = players.map(p => (typeof p === 'string' ? p : p.name)).filter(Boolean);
  const numQ  = Math.min(Math.max(numQuestions, 3), 15);

  const mode = questionsOnly ? 'questions-only' : 'full AI Master';
  console.log(`[aiHost] 🎙️  Generating game for room ${roomCode}: ${names.join(', ')}, ${numQ} questions [${mode}]`);

  // ── NEW: Check question bank first ──
  const { getQuestionsForGame, addQuestions } = require('./questionBank');
  const { cached: cachedQuestions, needsGeneration } = getQuestionsForGame(subject, difficulty, numQ, usedQuestions);
  
  let aiQuestions = [];
  if (needsGeneration > 0) {
    console.log(`[aiHost] Generating ${needsGeneration} new questions via AI...`);
    
    const prompt = questionsOnly
      ? buildQuestionsOnlyPrompt(needsGeneration, subject, difficulty, [...usedQuestions, ...cachedQuestions.map(q => q.question)])
      : buildGamePrompt(names, needsGeneration, subject, difficulty, [...usedQuestions, ...cachedQuestions.map(q => q.question)]);

    const timeoutMs  = OLLAMA_TIMEOUT_MS;
    const numPredict = 1500;

    // Try Groq first (3-5s), fall back to Ollama (~90s)
    let raw;
    if (GROQ_API_KEY) {
      console.log(`[aiHost] 🚀 Using Groq (${GROQ_MODEL}) for room ${roomCode}`);
      raw = await callGroq(prompt);
      if (!raw) console.warn(`[aiHost] Groq failed for room ${roomCode} — falling back to Ollama`);
    }
    if (!raw) {
      if (!OLLAMA_URL) {
        console.warn(`[aiHost] No fallback — OLLAMA_URL not set`);
        // If we have cached questions, use them even if AI fails
        if (cachedQuestions.length > 0) {
          console.log(`[aiHost] Using ${cachedQuestions.length} cached questions only (AI unavailable)`);
          aiQuestions = [];
        } else {
          return null;
        }
      } else {
        console.log(`[aiHost] 🐢 Using Ollama (${OLLAMA_MODEL}) for room ${roomCode}`);
        raw = await withOllamaLock(() => callOllama(prompt, timeoutMs, numPredict));
      }
    }

    if (raw) {
      let script;
      try {
        script = parseGameScript(raw);
      } catch (e) {
        console.error(`[aiHost] JSON parse failed for room ${roomCode}:`, e.message);
        console.error('[aiHost] Raw (first 400 chars):', raw.slice(0, 400));
        // Use cached questions if AI parsing fails
        if (cachedQuestions.length > 0) {
          console.log(`[aiHost] Using ${cachedQuestions.length} cached questions (AI parse failed)`);
          aiQuestions = [];
        } else {
          return null;
        }
      }

      if (script && Array.isArray(script.questions) && script.questions.length > 0) {
        aiQuestions = script.questions;
        // Save new questions to bank
        addQuestions(aiQuestions, subject, difficulty);
      }
    }
  } else {
    console.log(`[aiHost] ✅ Using ${cachedQuestions.length} cached questions (no AI generation needed)`);
  }

  // Combine cached + new AI questions
  const allQuestions = [...cachedQuestions, ...aiQuestions];
  
  if (allQuestions.length === 0) {
    console.error('[aiHost] No questions available for room', roomCode);
    return null;
  }

  // Normalise to server question format
  const questionTimeSecs = 30; // default; overridden at runtime if room has custom setting
  const normalizedQuestions = allQuestions.map((q, i) => ({
    id: q.id || `ai_${i}`,
    question: q.question,
    options: Array.isArray(q.options) ? q.options : ['A', 'B', 'C', 'D'],
    answer: typeof q.answer === 'number' ? q.answer : 0,
    category: q.category || 'General',
    // Commentary only populated in full AI Master mode
    qm_intro: q.qm_intro || (questionsOnly ? null : pick(CANNED.qm_intro, { n: i + 1, sec: questionTimeSecs })),
    qm_hint:  q.qm_hint  || (questionsOnly ? null : pick(CANNED.qm_hint)),
    correct_reactions: q.correct_reactions || {},
    wrong_reactions:   q.wrong_reactions   || {},
  }));

  const script = {
    questions: normalizedQuestions,
    intro: questionsOnly ? null : pick(CANNED.intro),
    game_over_lines: {},
    questionsOnly,
    _subject: subject,
    _difficulty: difficulty,
    _questionsOnly: questionsOnly,
  };

  setScript(roomCode, script);
  console.log(`[aiHost] ✅ Game script ready for room ${roomCode} (${cachedQuestions.length} cached + ${aiQuestions.length} new = ${allQuestions.length} total, ${mode})`);
  return script;
}

// ---------------------------------------------------------------------------
// Broadcast helper
// ---------------------------------------------------------------------------
function safeSend(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

// ---------------------------------------------------------------------------
// WebSocket handler — fired during gameplay for commentary events
// ---------------------------------------------------------------------------
function attachAiHost(wss) {
  const provider = GROQ_API_KEY ? `Groq (${GROQ_MODEL})` : (OLLAMA_URL ? `Ollama (${OLLAMA_MODEL})` : 'DISABLED');
  console.log(`[aiHost] WS handler ready — provider: ${provider}`);

  wss.on('connection', (ws, req) => {
    const url      = new URL(req.url, 'http://localhost');
    const roomCode = url.searchParams.get('room')?.toUpperCase();

    if (!roomCode) { ws.close(1008, 'room required'); return; }
    console.log(`[aiHost] 🎙️  Client connected — room ${roomCode}`);

    ws.on('message', (raw) => {
      if (ws.readyState !== 1) return;
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.type !== 'game_event') return;

      const script = getScript(roomCode);
      const { event, questionIndex, playerName, rank, score, totalPlayers } = msg;

      let text = null;

      if (script) {
        const q = script.questions[questionIndex] || {};
        switch (event) {
          case 'game_intro':     text = script.intro; break;
          case 'question_intro': text = q.qm_intro || null; break;
          case 'hint':           text = q.qm_hint  || null; break;
          case 'correct':        text = q.correct_reactions?.[playerName] || (playerName ? `✨ Nice one, ${playerName}!` : pick(CANNED.correct)); break;
          case 'wrong':          text = q.wrong_reactions?.[playerName]   || (playerName ? `😬 Tough break, ${playerName}! Next one's yours.` : pick(CANNED.wrong)); break;
          case 'game_over': {
            const scripted = script.game_over_lines?.[playerName];
            if (scripted) { text = scripted; break; }
            // Fall through to personalised canned if no scripted line
          }
          // falls through
          default: break;
        }
      }

      // Canned fallback (also handles game_over when no scripted line)
      if (!text) {
        const medals = ['🥇', '🥈', '🥉'];
        switch (event) {
          case 'question_intro': text = pick(CANNED.qm_intro, { n: (questionIndex || 0) + 1, sec: 30 }); break;
          case 'hint':           text = pick(CANNED.hint || CANNED.qm_hint); break;
          case 'correct':        text = playerName ? `✨ Nice one, ${playerName}!` : pick(CANNED.correct); break;
          case 'wrong':          text = playerName ? `😬 Tough break, ${playerName}! Keep going.` : pick(CANNED.wrong); break;
          case 'game_over': {
            if (playerName && rank) {
              const medal = medals[rank - 1] || `#${rank}`;
              const others = totalPlayers > 1 ? ` out of ${totalPlayers} players` : '';
              text = `${medal} ${playerName} finished with ${score} pts${others}! ${rank === 1 ? 'Champion! 🏆' : rank <= 3 ? 'Podium finish! 🎉' : 'Well played! 🎮'}`;
            } else {
              text = pick(CANNED.game_over);
            }
            break;
          }
        }
      }
    });

    ws.on('close', () => console.log(`[aiHost] 🎙️  Client disconnected — room ${roomCode}`));
    ws.on('error', (err) => console.warn(`[aiHost] WS error room ${roomCode}:`, err.message));

    // Send intro commentary if script is already available
    const script = getScript(roomCode);
    if (script?.intro) {
      setTimeout(() => safeSend(ws, { type: 'commentary', text: script.intro, duration: 8000 }), 500);
    }
  });
}

module.exports = { attachAiHost, generateGame, getScript, setScript, deleteScript, checkOllamaHealth, checkLLMHealth };
