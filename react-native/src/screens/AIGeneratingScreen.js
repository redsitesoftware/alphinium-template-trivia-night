/**
 * AIGeneratingScreen — shown while AI generates questions (all game modes now use AI).
 * Shows escalating status messages and a cancel button if taking too long.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius } from '../theme';
import { useGame } from '../context/GameContext';

const QM_MESSAGES = [
  '🎙️ The Quiz Master is warming up...',
  '🧠 Cooking up fiendishly clever questions...',
  '😈 Preparing personalised roasts for each player...',
  '📚 Consulting the ancient trivia scrolls...',
  '🎲 Shuffling categories for maximum chaos...',
  '✨ Crafting the perfect hint for each question...',
  '🔥 Almost there — the Quiz Master is on fire...',
  '🎊 Final touches on your epic game...',
];

const QUESTIONS_MESSAGES = [
  '🎲 Picking fresh questions just for you...',
  '📡 Scanning the trivia universe...',
  '🌍 Drawing from all corners of knowledge...',
  '🧩 Assembling your question set...',
  '⚡ Nearly ready...',
];

const DIFFICULTY_BADGE = {
  easy:   { label: '😊 Easy', color: '#4caf50' },
  medium: { label: '🧠 Medium', color: '#ff9800' },
  hard:   { label: '🔥 Hard',  color: '#f44336' },
};

// Escalation thresholds (aligned with server timeouts)
// Both modes now generate ~400-500 tokens (simplified full AI Master JSON).
// Empirical: ~179s at 2-3 tok/s on 2 CPU. Client auto-cancel: 240s.
const SLOW_THRESHOLD_MS  = 120000; // 2min — show "still working"
const VERY_SLOW_MS       = 200000; // 3m20s — show warning (only if approaching auto-cancel)

export default function AIGeneratingScreen() {
  const { state, send } = useGame();
  const { aiSubject, aiDifficulty, aiMode } = state;
  const progressAnim  = useRef(new Animated.Value(0)).current;
  const pulseAnim     = useRef(new Animated.Value(1)).current;
  const [msgIndex, setMsgIndex]   = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef(Date.now());

  const messages = aiMode ? QM_MESSAGES : QUESTIONS_MESSAGES;
  // Simplified JSON structure: both modes ~400-500 tokens → 160-200s at 2-3 tok/s
  const estimatedMs   = 180000;   // 3min progress bar target
  const autoCancelMs  = 240000;   // 4min hard cancel (well above 280s server timeout)

  // Track elapsed time for escalation
  useEffect(() => {
    startRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startRef.current);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Animate progress bar
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: estimatedMs,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [progressAnim, estimatedMs]);

  // Pulse the icon
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0,  duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  // Auto-cancel if server never responded (past server timeout)
  useEffect(() => {
    const t = setTimeout(() => {
      console.warn('[AIGeneratingScreen] Auto-cancel: server timeout exceeded');
      send({ type: 'cancel_game_start' });
    }, autoCancelMs);
    return () => clearTimeout(t);
  }, [autoCancelMs, send]);

  // Cycle through messages (pause escalation messages when slow)
  useEffect(() => {
    if (elapsedMs >= SLOW_THRESHOLD_MS) return; // stop cycling once slow msg shows
    const interval = setInterval(() => {
      setMsgIndex(i => (i + 1) % messages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [messages, elapsedMs]);

  const progressWidth = progressAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0%', '100%'],
  });

  const diffBadge = DIFFICULTY_BADGE[aiDifficulty] || DIFFICULTY_BADGE.medium;

  const isVerySlow = elapsedMs >= VERY_SLOW_MS;
  const isSlow     = elapsedMs >= SLOW_THRESHOLD_MS;

  function handleCancel() {
    // Tell server to cancel; server will respond with ai_mode_failed or we reset locally
    send({ type: 'cancel_game_start' });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Animated.Text style={[styles.icon, { transform: [{ scale: pulseAnim }] }]}>
          {isVerySlow ? '😬' : aiMode ? '🎙️' : '🎲'}
        </Animated.Text>

        <Text style={styles.title}>
          {isVerySlow
            ? 'AI is taking unusually long...'
            : isSlow
              ? 'Still working on it...'
              : aiMode
                ? 'Quiz Master is preparing your game'
                : 'Generating fresh questions...'}
        </Text>

        {/* Subject & difficulty badges */}
        <View style={styles.badges}>
          {aiSubject ? (
            <View style={styles.subjectBadge}>
              <Text style={styles.subjectBadgeText}>🎯 {aiSubject}</Text>
            </View>
          ) : null}
          <View style={[styles.diffBadge, { backgroundColor: diffBadge.color + '33', borderColor: diffBadge.color }]}>
            <Text style={[styles.diffBadgeText, { color: diffBadge.color }]}>{diffBadge.label}</Text>
          </View>
        </View>

        <Text style={[styles.subtitle, isVerySlow && styles.subtitleWarn]}>
          {isVerySlow
            ? '⚠️ Taking longer than usual — hang tight!'
            : isSlow
              ? '⏳ Still generating — usually takes 2-3 minutes'
              : aiMode
                ? 'This takes about 2–3 minutes — sit tight!'
                : 'This takes about 2–3 minutes — sit tight!'}
        </Text>

        <View style={styles.progressTrack}>
          <Animated.View style={[
            styles.progressFill,
            isVerySlow && { backgroundColor: colors.error || '#f44336' },
            { width: progressWidth },
          ]} />
        </View>

        {!isSlow && (
          <Text style={styles.loadingMsg}>{messages[msgIndex]}</Text>
        )}

        <Text style={styles.elapsed}>
          {Math.floor(elapsedMs / 1000)}s elapsed
        </Text>

        {/* Cancel button — shown after 20s */}
        {elapsedMs >= 20000 && (
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} activeOpacity={0.7}>
            <Text style={styles.cancelBtnText}>✕ Cancel & return to lobby</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  icon: {
    fontSize: 72,
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: typography.xl,
    fontWeight: typography.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.sm,
    color: colors.textMuted,
    marginBottom: spacing.xl,
  },

  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  subjectBadge: {
    backgroundColor: colors.primary + '22',
    borderRadius: radius.full ?? 99,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  subjectBadgeText: { color: colors.primary, fontWeight: typography.semibold, fontSize: typography.sm },
  diffBadge: {
    borderRadius: radius.full ?? 99,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
  },
  diffBadgeText: { fontWeight: typography.bold, fontSize: typography.sm },

  progressTrack: {
    width: '100%',
    height: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.full ?? 99,
    overflow: 'hidden',
    marginBottom: spacing.xl,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.full ?? 99,
  },
  loadingMsg: {
    fontSize: typography.base,
    color: colors.textSecondary,
    textAlign: 'center',
    minHeight: 28,
    marginBottom: spacing.sm,
  },
  subtitleWarn: {
    color: '#f44336',
    fontWeight: typography.semibold,
    textAlign: 'center',
  },
  elapsed: {
    fontSize: typography.xs || 11,
    color: colors.textMuted,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  cancelBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder || '#444',
    backgroundColor: colors.surface,
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: typography.medium,
  },
});
