/**
 * LeaderboardScreen — Between-question interstitial.
 * Shows current scores and reveals the correct answer.
 * Auto-advances when next question_start arrives (handled by AppNavigator via phase).
 */

import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGame } from '../context/GameContext';
import { colors, typography, spacing, radius } from '../theme';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function LeaderboardScreen() {
  const { state } = useGame();
  const { leaderboard, correctAnswer, question, playerId } = state;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.container}>
        {/* Correct answer reveal */}
        {question && correctAnswer != null && (
          <View style={styles.answerReveal}>
            <Text style={styles.answerRevealLabel}>Correct answer</Text>
            <Text style={styles.answerRevealText}>
              {['A', 'B', 'C', 'D'][correctAnswer]}. {question.options?.[correctAnswer]}
            </Text>
          </View>
        )}

        <Text style={styles.heading}>Scores</Text>

        <FlatList
          data={leaderboard}
          keyExtractor={(p) => p.id}
          renderItem={({ item, index }) => (
            <View style={[styles.row, item.id === playerId && styles.rowMe]}>
              <Text style={styles.rank}>{MEDALS[index] || `${index + 1}`}</Text>
              <Text style={styles.playerName} numberOfLines={1}>
                {item.name}
                {item.id === playerId ? (
                  <Text style={styles.youTag}> (you)</Text>
                ) : null}
              </Text>
              <Text style={styles.score}>{item.score}</Text>
            </View>
          )}
          style={styles.list}
          scrollEnabled
        />

        <Text style={styles.hint}>⏭ Next question coming up…</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg },

  answerReveal: {
    backgroundColor: colors.successBg,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.success,
    alignItems: 'center',
  },
  answerRevealLabel: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: colors.success,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  answerRevealText: {
    fontSize: typography.md,
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },

  heading: {
    fontSize: typography.xl,
    fontWeight: typography.heavy,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },

  list: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.xl },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: spacing.md,
  },
  rowMe: { backgroundColor: colors.surfaceElevated },
  rank: { fontSize: typography.md, width: 32 },
  playerName: { flex: 1, fontSize: typography.base, color: colors.textPrimary, fontWeight: typography.medium },
  youTag: { color: colors.textMuted, fontSize: typography.sm, fontWeight: typography.regular },
  score: { fontSize: typography.md, fontWeight: typography.bold, color: colors.accent },

  hint: {
    marginTop: spacing.md,
    textAlign: 'center',
    fontSize: typography.sm,
    color: colors.textMuted,
  },
});
