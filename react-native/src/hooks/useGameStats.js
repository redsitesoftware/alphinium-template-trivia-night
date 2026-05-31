/**
 * useGameStats — persists game history and stats locally via AsyncStorage.
 * Works for both guests and logged-in users.
 */
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STATS_KEY  = 'trivia_game_stats';
const HISTORY_KEY = 'trivia_game_history';

const DEFAULT_STATS = { gamesPlayed: 0, wins: 0, totalScore: 0, bestScore: 0 };

export function useGameStats() {
  const [stats, setStats] = useState(DEFAULT_STATS);

  const loadStats = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STATS_KEY);
      if (raw) setStats(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  /**
   * Call after a game ends.
   * @param {{ score: number, rank: number, totalPlayers: number, subject: string }} result
   * @returns {{ isPersonalBest: boolean, isWin: boolean }}
   */
  async function saveResult({ score, rank, totalPlayers, subject }) {
    const isWin = rank === 0;
    const isPersonalBest = score > stats.bestScore;

    const newStats = {
      gamesPlayed: stats.gamesPlayed + 1,
      wins: stats.wins + (isWin ? 1 : 0),
      totalScore: stats.totalScore + score,
      bestScore: Math.max(stats.bestScore, score),
    };
    setStats(newStats);
    await AsyncStorage.setItem(STATS_KEY, JSON.stringify(newStats));

    // Append to history (keep last 50)
    try {
      const histRaw = await AsyncStorage.getItem(HISTORY_KEY);
      const history = histRaw ? JSON.parse(histRaw) : [];
      history.unshift({
        score,
        rank: rank + 1,
        totalPlayers,
        subject: subject || 'General Knowledge',
        date: new Date().toISOString(),
      });
      if (history.length > 50) history.splice(50);
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {}

    return { isPersonalBest, isWin };
  }

  const winRate = stats.gamesPlayed > 0
    ? Math.round((stats.wins / stats.gamesPlayed) * 100)
    : 0;

  const avgScore = stats.gamesPlayed > 0
    ? Math.round(stats.totalScore / stats.gamesPlayed)
    : 0;

  return { stats, winRate, avgScore, saveResult, reload: loadStats };
}
