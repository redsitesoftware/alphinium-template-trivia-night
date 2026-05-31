import React from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { useGame } from '../context/GameContext';
import { colors, spacing, typography, radius } from '../theme';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function RoundBreakScreen() {
  const { state } = useGame();
  const { currentRound, totalRounds, leaderboard = [] } = state;

  const nextRound = currentRound + 1;

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🏆</Text>
      <Text style={styles.title}>Round {currentRound} of {totalRounds} Complete!</Text>
      <Text style={styles.subtitle}>Leaderboard</Text>

      <FlatList
        data={leaderboard}
        keyExtractor={item => item.id || item.name}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <View style={[styles.row, index === 0 && styles.rowFirst]}>
            <Text style={styles.medal}>{MEDALS[index] || `${index + 1}.`}</Text>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.score}>{item.score.toLocaleString()}</Text>
          </View>
        )}
      />

      {nextRound <= totalRounds && (
        <View style={styles.nextRoundBox}>
          <ActivityIndicator color={colors.primary} size="small" style={{ marginBottom: spacing.sm }} />
          <Text style={styles.preparingText}>Preparing Round {nextRound}…</Text>
          <Text style={styles.preparingHint}>Get ready! The next round starts automatically.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    paddingTop: spacing.xl * 2,
    paddingHorizontal: spacing.lg,
  },
  emoji: {
    fontSize: 56,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typography.xl,
    fontWeight: typography.bold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.base,
    color: colors.textSecondary,
    fontWeight: typography.semibold,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  list: {
    width: '100%',
    flexGrow: 0,
    maxHeight: 340,
  },
  listContent: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  rowFirst: {
    borderColor: '#f0a500',
    backgroundColor: 'rgba(240,165,0,0.08)',
  },
  medal: {
    fontSize: 22,
    width: 34,
    textAlign: 'center',
  },
  name: {
    flex: 1,
    color: colors.text,
    fontSize: typography.base,
    fontWeight: typography.semibold,
    marginLeft: spacing.xs,
  },
  score: {
    color: colors.primary,
    fontSize: typography.base,
    fontWeight: typography.bold,
  },
  nextRoundBox: {
    marginTop: spacing.xl,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    width: '100%',
  },
  preparingText: {
    fontSize: typography.lg,
    fontWeight: typography.bold,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  preparingHint: {
    fontSize: typography.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
