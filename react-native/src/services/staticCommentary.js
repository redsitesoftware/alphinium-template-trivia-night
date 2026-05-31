/**
 * staticCommentary.js — pre-recorded Quiz Master commentary
 *
 * All clips are served from /voice/*.mp3 (bundled in public/, zero ElevenLabs
 * credits at runtime). Commentary is randomly picked from pools by event type.
 *
 * Entries with `dynamic: true` contain a {name} placeholder — these are
 * generated via /api/tts/commentary with the player's name substituted.
 * Entries without `dynamic` use pre-cached static MP3s.
 */

// Each pool maps to an array of { text, clip?, dynamic? } objects.
// clip → filename under /voice/ (no extension needed — playStatic handles it)
// dynamic: true → text has {name} placeholder, fetched from TTS API with name param
const POOLS = {
  question: [
    { text: "Here we go! Think carefully on this one.", clip: 'q-intro-1' },
    { text: "Ooh, this is a good one. No peeking!",     clip: 'q-intro-2' },
    { text: "Focus up! Points are on the line.",        clip: 'q-intro-3' },
  ],
  correct: [
    { text: "Brilliant! You knew that one cold.",          clip: 'correct-1' },
    { text: "Yes! Get in! That's the one.",               clip: 'correct-2' },
    { text: "Spot on! The crowd goes wild!",              clip: 'correct-3' },
    { text: "Brilliant answer, {name}!",                  dynamic: true },
    { text: "Spot on, {name}! The crowd goes wild!",      dynamic: true },
    { text: "{name} with the correct answer — well done!", dynamic: true },
  ],
  wrong: [
    { text: "Ooh, unlucky! So close though.",                     clip: 'wrong-1' },
    { text: "Oof! Don't worry, plenty more questions to go.",     clip: 'wrong-2' },
    { text: "Nope! Shake it off — next one's yours.",             clip: 'wrong-3' },
    { text: "Unlucky, {name}! Shake it off.",                     dynamic: true },
    { text: "Oh {name}, so close! The answer slips away.",        dynamic: true },
  ],
  streak: [
    { text: "On fire! Absolutely unstoppable!",           clip: 'streak-1' },
    { text: "What a streak! Can anyone stop them?",       clip: 'streak-2' },
    { text: "{name} is on fire! Absolutely unstoppable!", dynamic: true },
    { text: "Can anyone stop {name}? What a streak!",     dynamic: true },
  ],
  gameover: [
    { text: "And that is game! What a performance from everyone tonight.", clip: 'gameover-1' },
    { text: "That's all folks! The scores are in — let's see who came out on top!", clip: 'gameover-2' },
  ],
  round_break: [
    { text: "That's the end of the round! Catch your breath — the next round is coming right up.", clip: 'round_break-1' },
    { text: "Round complete! Check the leaderboard and get ready — we're not done yet!", clip: 'round_break-2' },
    { text: "Great effort everyone! Take a breather while we prepare the next round.", clip: 'round_break-3' },
  ],
};

// Track last-used index per pool to avoid repeating the same clip back-to-back
const _lastIndex = {};

/**
 * Pick a random item from a pool, avoiding immediate repeats.
 * If playerName is given, dynamic entries (with {name}) are eligible ~40% of the time;
 * without a name only static (clip) entries are selected.
 * @param {'question'|'correct'|'wrong'|'streak'|'gameover'|'round_break'} event
 * @param {string|null} [playerName]
 * @returns {{ text: string, clip?: string, dynamic?: boolean }}
 */
export function pick(event, playerName = null) {
  const allEntries = POOLS[event];
  if (!allEntries || allEntries.length === 0) return null;

  // 40% chance to use a named dynamic variant when we have a player name
  const useNamed = playerName && Math.random() < 0.4;
  const pool = useNamed ? allEntries : allEntries.filter(e => !e.dynamic);
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];

  let idx;
  do { idx = Math.floor(Math.random() * pool.length); }
  while (pool.length > 1 && idx === _lastIndex[event]);
  _lastIndex[event] = idx;

  const entry = pool[idx];
  if (entry.dynamic && playerName) {
    return { ...entry, text: entry.text.replace(/\{name\}/g, playerName) };
  }
  return entry;
}
