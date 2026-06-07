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
 * LLM provider: Groq — ~3-5s via LPU hardware (llama-3.1-8b-instant)
 *
 * Environment:
 *   GROQ_API_KEY — Groq API key. Required for AI mode. Get one at console.groq.com
 *   GROQ_MODEL   — Groq model. Default: llama-3.1-8b-instant
 */

'use strict';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL   = process.env.GROQ_MODEL   || 'llama-3.1-8b-instant';

// Cached game scripts keyed by room code
const gameScripts = new Map();

function getScript(roomCode)         { return gameScripts.get(roomCode); }
function setScript(roomCode, script) { gameScripts.set(roomCode, script); }
function deleteScript(roomCode)      { gameScripts.delete(roomCode); }

// ---------------------------------------------------------------------------
// Canned fallback pools (used when GROQ_API_KEY not set or Groq fails)
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


// Health check — Groq is API-based, assume healthy if key is set; callGroq() handles failures
async function checkLLMHealth() {
  return !!GROQ_API_KEY;
}



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
  if (!GROQ_API_KEY) {
    console.log('[aiHost] No LLM provider configured (set GROQ_API_KEY) — AI mode disabled');
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

    console.log(`[aiHost] 🚀 Using Groq (${GROQ_MODEL}) for room ${roomCode}`);
    const raw = await callGroq(prompt);

    if (!raw) {
      if (cachedQuestions.length > 0) {
        console.log(`[aiHost] Groq failed — using ${cachedQuestions.length} cached questions only`);
        aiQuestions = [];
      } else {
        return null;
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
  const provider = GROQ_API_KEY ? `Groq (${GROQ_MODEL})` : 'DISABLED';
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

module.exports = { attachAiHost, generateGame, getScript, setScript, deleteScript, checkLLMHealth };
