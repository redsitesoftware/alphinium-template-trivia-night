/**
 * Question Bank — Persistent storage for AI-generated trivia questions
 * 
 * Architecture:
 *   - Questions saved to disk in /data/question-bank/{subject}-{difficulty}.json
 *   - Deduplicated using SHA-256 hash of normalized question text
 *   - Tracks usage stats and links to TTS audio cache
 *   - Loads on-demand (not preloaded into RAM)
 * 
 * Benefits:
 *   - Hosts collectively build shared question database
 *   - Reuse questions across games = cost savings
 *   - Faster game starts (no AI generation wait)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BANK_DIR = path.join(__dirname, '../data/question-bank');
const CACHE_MIN = parseInt(process.env.QUESTION_CACHE_MIN || '20', 10);
const CACHE_MIX = parseFloat(process.env.QUESTION_CACHE_MIX || '0.7');

// Ensure bank directory exists
try { fs.mkdirSync(BANK_DIR, { recursive: true }); } catch (_) {}

/**
 * Get the filename for a given subject/difficulty combo.
 * Normalizes subject to lowercase-kebab-case.
 * null subject → "general.json"
 */
function getFilename(subject, difficulty = 'medium') {
  const subj = subject ? subject.toLowerCase().replace(/\s+/g, '-') : 'general';
  const diff = (difficulty || 'medium').toLowerCase();
  return `${subj}-${diff}.json`;
}

function getFilePath(subject, difficulty) {
  return path.join(BANK_DIR, getFilename(subject, difficulty));
}

/**
 * Generate a deterministic hash for a question.
 * Uses normalized question text (lowercase, trimmed, punctuation-stripped).
 */
function hashQuestion(questionText) {
  const normalized = questionText
    .toLowerCase()
    .trim()
    .replace(/[?!.,;:]/g, '')
    .replace(/\s+/g, ' ');
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Load cached questions for a given subject/difficulty.
 * Returns empty array if file doesn't exist.
 */
function loadQuestions(subject, difficulty) {
  const file = getFilePath(subject, difficulty);
  try {
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data.questions) ? data.questions : [];
  } catch (e) {
    console.warn(`[questionBank] Failed to load ${file}:`, e.message);
    return [];
  }
}

/**
 * Save questions to cache for a given subject/difficulty.
 * Overwrites the file entirely (not append).
 */
function saveQuestions(questions, subject, difficulty) {
  const file = getFilePath(subject, difficulty);
  try {
    const data = {
      subject: subject || null,
      difficulty: difficulty || 'medium',
      lastUpdated: new Date().toISOString(),
      count: questions.length,
      questions,
    };
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`[questionBank] ✓ Saved ${questions.length} questions to ${getFilename(subject, difficulty)}`);
    return true;
  } catch (e) {
    console.error(`[questionBank] Failed to save ${file}:`, e.message);
    return false;
  }
}

/**
 * Add new questions to the cache, deduplicating against existing.
 * Returns the updated full list of cached questions.
 * 
 * @param {Array} newQuestions - Array of question objects from AI
 * @param {string} subject - Subject category (null for general)
 * @param {string} difficulty - Difficulty level
 * @returns {Array} Updated full question list
 */
function addQuestions(newQuestions, subject, difficulty) {
  const existing = loadQuestions(subject, difficulty);
  const existingHashes = new Set(existing.map(q => q.id));
  
  const added = [];
  for (const q of newQuestions) {
    const hash = hashQuestion(q.question);
    if (existingHashes.has(hash)) {
      console.log(`[questionBank] ⚠️  Duplicate skipped: "${q.question.slice(0, 60)}..."`);
      continue;
    }
    
    added.push({
      id: hash,
      question: q.question,
      options: q.options,
      answer: q.answer,
      category: q.category || 'General',
      subject: subject || null,
      difficulty: difficulty || 'medium',
      usageCount: 0,
      createdAt: new Date().toISOString(),
      audioCache: {}, // voiceId → cacheKey mapping, populated on first TTS
    });
    existingHashes.add(hash);
  }
  
  const updated = [...existing, ...added];
  if (added.length > 0) {
    saveQuestions(updated, subject, difficulty);
    console.log(`[questionBank] ➕ Added ${added.length} new questions (${updated.length} total in cache)`);
  }
  
  return updated;
}

/**
 * Get questions for a game, mixing cached + new AI-generated.
 * Returns { cached, needsGeneration, total }.
 * 
 * Strategy:
 *   - If cache has >= CACHE_MIN questions:
 *     - Use 70% cached (randomly sampled, excluding usedQuestions)
 *     - Generate 30% new via AI
 *   - If cache has < CACHE_MIN:
 *     - Use all cached (excluding usedQuestions)
 *     - Generate enough new to reach requested count
 * 
 * @param {string} subject - Subject category
 * @param {string} difficulty - Difficulty level
 * @param {number} count - Total questions needed
 * @param {Array<string>} usedQuestions - Array of question texts to exclude
 * @returns {Object} { cached: Question[], needsGeneration: number }
 */
function getQuestionsForGame(subject, difficulty, count = 10, usedQuestions = []) {
  const allCached = loadQuestions(subject, difficulty);
  
  // Filter out already-used questions
  const usedSet = new Set(usedQuestions.map(q => hashQuestion(q)));
  const availableCached = allCached.filter(q => !usedSet.has(q.id));
  
  console.log(`[questionBank] Cache: ${allCached.length} total, ${availableCached.length} available (${usedSet.size} already used)`);
  
  // Update usage count for cached questions
  const updateUsage = (questions) => {
    for (const q of questions) q.usageCount = (q.usageCount || 0) + 1;
  };
  
  if (availableCached.length === 0) {
    // No available cached questions — generate all
    console.log(`[questionBank] No available cached questions for ${subject || 'general'}/${difficulty} — will generate ${count}`);
    return { cached: [], needsGeneration: count };
  }
  
  if (availableCached.length < CACHE_MIN) {
    // Insufficient cache — use all available + generate remaining
    const needsNew = Math.max(0, count - availableCached.length);
    console.log(`[questionBank] Cache has ${availableCached.length}/${CACHE_MIN} available — using all + generating ${needsNew} new`);
    updateUsage(availableCached);
    saveQuestions(allCached, subject, difficulty); // persist usage count
    return {
      cached: shuffle(availableCached),
      needsGeneration: needsNew,
    };
  }
  
  // Sufficient cache — mix cached + new
  const numCached = Math.floor(count * CACHE_MIX);
  const numNew = count - numCached;
  
  const shuffled = shuffle(availableCached);
  const selected = shuffled.slice(0, numCached);
  updateUsage(selected);
  saveQuestions(allCached, subject, difficulty); // persist usage count
  
  console.log(`[questionBank] Mix: ${numCached} cached + ${numNew} new (${availableCached.length} available in cache)`);
  return {
    cached: selected,
    needsGeneration: numNew,
  };
}

/**
 * Increment usage count for questions (called after game ends).
 * Pass in the question IDs (hashes) that were used.
 */
function recordUsage(questionIds, subject, difficulty) {
  const questions = loadQuestions(subject, difficulty);
  const idSet = new Set(questionIds);
  
  let updated = 0;
  for (const q of questions) {
    if (idSet.has(q.id)) {
      q.usageCount = (q.usageCount || 0) + 1;
      updated++;
    }
  }
  
  if (updated > 0) {
    saveQuestions(questions, subject, difficulty);
    console.log(`[questionBank] Updated usage count for ${updated} questions`);
  }
}

/**
 * Get stats for a given subject/difficulty cache.
 */
function getStats(subject, difficulty) {
  const questions = loadQuestions(subject, difficulty);
  if (questions.length === 0) return null;
  
  const totalUsage = questions.reduce((sum, q) => sum + (q.usageCount || 0), 0);
  const avgUsage = totalUsage / questions.length;
  
  return {
    count: questions.length,
    totalUsage,
    avgUsage: avgUsage.toFixed(1),
    oldestQuestion: questions[0]?.createdAt,
    newestQuestion: questions[questions.length - 1]?.createdAt,
  };
}

/**
 * Shuffle array in place (Fisher-Yates)
 */
/**
 * Clear all question bank cache files.
 * Used for testing/admin purposes.
 * @returns {boolean} Success
 */
function clearAllCache() {
  try {
    const files = fs.readdirSync(CACHE_DIR);
    let cleared = 0;
    for (const file of files) {
      if (file.endsWith('.json')) {
        fs.unlinkSync(path.join(CACHE_DIR, file));
        cleared++;
      }
    }
    console.log(`[questionBank] 🗑️  Cleared ${cleared} cache files`);
    return true;
  } catch (e) {
    console.error('[questionBank] Failed to clear cache:', e.message);
    return false;
  }
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

module.exports = {
  loadQuestions,
  saveQuestions,
  addQuestions,
  getQuestionsForGame,
  recordUsage,
  getStats,
  hashQuestion,
  clearAllCache,
  CACHE_MIN,
  CACHE_MIX,
};
