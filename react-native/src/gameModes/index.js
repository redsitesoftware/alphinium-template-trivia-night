/**
 * Game Mode Framework
 * 
 * Abstract interface for implementing different trivia game show modes.
 * Each mode defines its own rules, UI, and server logic.
 */

/**
 * Base Game Mode Interface
 * 
 * All game modes must implement these properties and methods.
 */
export const GameModes = {
  CLASSIC: 'classic',
  MILLIONAIRE: 'millionaire',
  BUZZER: 'buzzer',
  CHASE: 'chase',
};

export const GameModeConfig = {
  classic: {
    id: 'classic',
    name: 'Classic Trivia',
    description: 'Traditional trivia with rounds and leaderboards',
    icon: '🎯',
    minPlayers: 1,
    maxPlayers: 20,
    supportsRounds: true,
    supportsVoice: true,
    supportsBanter: true,
  },
  millionaire: {
    id: 'millionaire',
    name: 'Millionaire',
    description: '15-question ladder with lifelines',
    icon: '💰',
    minPlayers: 1,
    maxPlayers: 1,
    supportsRounds: false,
    supportsVoice: true,
    supportsBanter: false,
    features: ['Lifelines', 'Safe Havens', 'Walk Away'],
  },
  buzzer: {
    id: 'buzzer',
    name: 'Buzzer Round',
    description: 'Fastest finger first',
    icon: '🔔',
    minPlayers: 2,
    maxPlayers: 10,
    supportsRounds: true,
    supportsVoice: true,
    supportsBanter: true,
    features: ['Buzz-in', 'Elimination', 'Sudden Death'],
  },
  chase: {
    id: 'chase',
    name: 'The Chase',
    description: 'Beat the Chaser',
    icon: '🏃',
    minPlayers: 1,
    maxPlayers: 4,
    supportsRounds: false,
    supportsVoice: true,
    supportsBanter: false,
    features: ['Cash Builder', 'The Chase', 'Offers'],
  },
};

/**
 * Get mode configuration by ID
 */
export function getModeConfig(modeId) {
  return GameModeConfig[modeId] || GameModeConfig.classic;
}

/**
 * Validate if a mode can be played with given player count
 */
export function canPlayMode(modeId, playerCount) {
  const config = getModeConfig(modeId);
  return playerCount >= config.minPlayers && playerCount <= config.maxPlayers;
}

/**
 * Get all available modes for a given player count
 */
export function getAvailableModes(playerCount) {
  return Object.values(GameModeConfig).filter(mode => 
    canPlayMode(mode.id, playerCount)
  );
}

/**
 * Mode-specific state initialization
 * Returns default state object for each mode
 */
export function getInitialModeState(modeId) {
  switch (modeId) {
    case GameModes.MILLIONAIRE:
      return {
        currentLevel: 0,
        safeHaven: 0,
        lifelines: {
          fiftyFifty: true,
          audience: true,
          phone: true,
        },
        moneyLadder: [
          100, 200, 300, 500, 1000,      // Questions 1-5 (Easy)
          2000, 4000, 8000, 16000, 32000, // Questions 6-10 (Medium)
          64000, 125000, 250000, 500000, 1000000 // Questions 11-15 (Hard)
        ],
      };
      
    case GameModes.BUZZER:
      return {
        buzzOrder: [],
        lockedPlayer: null,
        eliminatedPlayers: new Set(),
        suddenDeath: false,
        eliminationMode: false,
      };
      
    case GameModes.CHASE:
      return {
        phase: 'cash_builder', // cash_builder | offer | chase | result
        pot: 0,
        position: 0, // Player position relative to chaser
        questionsRemaining: 5,
        offers: { high: 0, safe: 0, low: 0 },
        chaserAccuracy: 0.7,
      };
      
    case GameModes.CLASSIC:
    default:
      return {};
  }
}

export default {
  GameModes,
  GameModeConfig,
  getModeConfig,
  canPlayMode,
  getAvailableModes,
  getInitialModeState,
};
