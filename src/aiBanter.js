/**
 * AI Banter Service
 * Generates real-time commentary reactions after player answers.
 * 
 * Uses Groq for fast generation (~500ms) with minimal context.
 * Falls back to canned responses if AI unavailable.
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

// Canned banter fallbacks
const CANNED_BANTER = {
  correct: {
    fast: [
      "Lightning quick! 🚀",
      "That's how it's done! ⚡",
      "Boom! Nailed it instantly! 💥",
      "Speed demon right here! 🔥"
    ],
    medium: [
      "Nice work! 👏",
      "Solid answer! ✓",
      "Well done! 🎯",
      "That's right! ✨"
    ],
    slow: [
      "Got there in the end! ⏰",
      "Better late than never! 🐢",
      "Just made it! ⏱️",
      "Close call but correct! 😅"
    ],
    streak: [
      "On fire! 🔥 {streak} in a row!",
      "Unstoppable! {streak} streak!",
      "Absolutely crushing it! {streak} straight!",
      "Is anyone going to stop this player?! {streak} correct!"
    ]
  },
  wrong: {
    default: [
      "Ooh, not quite! 😬",
      "So close! Better luck next time! 🎲",
      "Tough one! Don't worry about it! 💪",
      "Can't win 'em all! 🤷"
    ],
    streakBreak: [
      "The streak ends! That was a great run though! 📉",
      "All good things must come to an end! 🎭",
      "Streak over, but what a ride! 🎢"
    ]
  }
};

/**
 * Generate AI banter for a player's answer.
 * 
 * @param {Object} context - Answer context
 * @param {string} context.playerName - Player who answered
 * @param {string} context.question - The question text
 * @param {boolean} context.isCorrect - Whether answer was correct
 * @param {number} context.streak - Current streak (0 if wrong)
 * @param {number} context.timeRemaining - Seconds remaining when answered
 * @param {number} context.totalTime - Total question time
 * @returns {Promise<string>} Banter text (1-2 sentences)
 */
async function generateBanter(context) {
  const { playerName, question, isCorrect, streak, timeRemaining, totalTime } = context;
  
  // Calculate response speed
  const elapsed = totalTime - timeRemaining;
  const speed = elapsed < 5 ? 'fast' : elapsed < 15 ? 'medium' : 'slow';
  
  // Try AI generation first
  if (GROQ_API_KEY) {
    try {
      const prompt = buildBanterPrompt(context, speed);
      const banter = await callGroq(prompt);
      if (banter) {
        console.log(`[banter] 🎭 Generated for ${playerName}: "${banter.slice(0, 60)}..."`);
        return banter;
      }
    } catch (error) {
      console.warn('[banter] AI generation failed:', error.message);
    }
  }
  
  // Fallback to canned banter
  return getCannedBanter(isCorrect, streak, speed);
}

/**
 * Build a concise prompt for banter generation.
 */
function buildBanterPrompt(context, speed) {
  const { playerName, question, isCorrect, streak, timeRemaining } = context;
  
  let prompt = `You're a charismatic quiz master. Give a 1-2 sentence reaction to this answer:\n\n`;
  prompt += `Player: ${playerName}\n`;
  prompt += `Question: ${question.slice(0, 100)}${question.length > 100 ? '...' : ''}\n`;
  prompt += `Answer: ${isCorrect ? 'CORRECT' : 'WRONG'}\n`;
  
  if (isCorrect) {
    prompt += `Response time: ${speed}\n`;
    if (streak >= 3) {
      prompt += `Streak: ${streak} in a row!\n`;
    }
  } else if (streak > 0) {
    prompt += `Previous streak: ${streak} (now broken)\n`;
  }
  
  prompt += `\nReact with energy and personality. Be brief, fun, and encouraging. No emojis.`;
  
  return prompt;
}

/**
 * Call Groq API for fast banter generation.
 */
async function callGroq(prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000); // 3s timeout for banter
  
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
        temperature: 0.9,
        max_tokens: 60,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timer);
    
    if (!res.ok) {
      console.warn('[banter] Groq error:', res.status);
      return null;
    }
    
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (error) {
    clearTimeout(timer);
    if (error.name === 'AbortError') {
      console.warn('[banter] Groq timeout');
    }
    return null;
  }
}

/**
 * Get a canned banter response.
 */
function getCannedBanter(isCorrect, streak, speed) {
  if (isCorrect) {
    if (streak >= 3) {
      const options = CANNED_BANTER.correct.streak;
      return pick(options).replace('{streak}', streak);
    }
    const options = CANNED_BANTER.correct[speed] || CANNED_BANTER.correct.medium;
    return pick(options);
  } else {
    if (streak > 2) {
      return pick(CANNED_BANTER.wrong.streakBreak);
    }
    return pick(CANNED_BANTER.wrong.default);
  }
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

module.exports = {
  generateBanter,
  CANNED_BANTER,
};
