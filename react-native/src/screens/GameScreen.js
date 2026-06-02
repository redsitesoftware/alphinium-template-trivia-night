/**
 * GameScreen — Active question view.
 * Features: question text, A/B/C/D option grid, animated timer bar,
 * answer feedback overlay, streak indicator, AI commentator bubble.
 */

import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, ScrollView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGame } from '../context/GameContext';
import { colors, typography, spacing, radius } from '../theme';
import useVoiceAnswers from '../hooks/useVoiceAnswers';

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export default function GameScreen() {
  const { state, submitAnswer, toggleMute, toggleMutePlayers, toggleSoundEffects } = useGame();
  const { question, timerRemaining, timerMax, answered, selectedAnswer, answerResult, correctAnswer,
          voiceMuted, soundEffectsMuted, isHost, mutePlayersOnStart, totalRounds, currentRound, voiceAnswers,
          currentStreak } = state;
  const { aiComment: comment } = useGame();

  const isMultiRound = totalRounds > 1;

  // ── Voice answer (STT) ─────────────────────────────────────────────────────
  const { listening, voiceStatus, micBlocked, startListening } = useVoiceAnswers({
    question,
    answered,
    onMatch: submitAnswer,
  });

  const timerAnim = useRef(new Animated.Value(1)).current;
  const feedbackAnim = useRef(new Animated.Value(0)).current;
  const commentAnim = useRef(new Animated.Value(0)).current;
  const scoreFloatY = useRef(new Animated.Value(0)).current;
  const scoreFloatOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!timerMax) return;
    Animated.timing(timerAnim, {
      toValue: timerRemaining / timerMax,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [timerRemaining, timerMax]);

  useEffect(() => {
    if (answerResult) {
      Animated.spring(feedbackAnim, { toValue: 1, useNativeDriver: true, bounciness: 8 }).start();
    } else {
      feedbackAnim.setValue(0);
    }
  }, [answerResult]);

  useEffect(() => {
    if (answerResult?.correct) {
      scoreFloatY.setValue(0);
      scoreFloatOpacity.setValue(1);
      Animated.parallel([
        Animated.timing(scoreFloatY, { toValue: -80, duration: 800, useNativeDriver: true }),
        Animated.timing(scoreFloatOpacity, { toValue: 0, duration: 800, useNativeDriver: true }),
      ]).start();
    } else if (!answerResult) {
      scoreFloatY.setValue(0);
      scoreFloatOpacity.setValue(0);
    }
  }, [answerResult]);

  useEffect(() => {
    if (comment) {
      Animated.spring(commentAnim, { toValue: 1, useNativeDriver: true, bounciness: 10 }).start();
    } else {
      commentAnim.setValue(0);
    }
  }, [comment]);

  if (!question) return null;

  const timerPct = timerMax > 0 ? timerRemaining / timerMax : 0;
  const timerColor = timerPct > 0.5 ? colors.accent : timerPct > 0.25 ? colors.accentYellow : colors.primary;

  function getOptionStyle(index) {
    if (!answered) return styles.optionDefault;
    if (answerResult) {
      // Show correct answer green AND player's wrong pick red simultaneously
      if (index === answerResult.correctAnswer) return styles.optionCorrect;
      if (index === selectedAnswer && !answerResult.correct) return styles.optionWrong;
    } else if (correctAnswer !== null) {
      // question_end path (time ran out — no answerResult)
      if (index === correctAnswer) return styles.optionCorrect;
    }
    if (index === selectedAnswer) return styles.optionSelected;
    return styles.optionDefault;
  }

  function getOptionBorderColor(index) {
    if (!answered || !answerResult) {
      return index === selectedAnswer ? '#6C63FF' : '#2E2E4A';
    }
    if (index === answerResult.correctAnswer) return '#00D4AA'; // green
    if (correctAnswer !== null && index === correctAnswer) return '#00D4AA';
    if (index === selectedAnswer && !answerResult.correct) return '#FF4D6D'; // red
    return '#2E2E4A';
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} scrollEnabled={false}>
        {/* Header: category + progress + mute */}
        <View style={styles.topBar}>
          <Text style={styles.category}>{question.category}</Text>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.progress}>
              {question.index + 1} / {question.total}
            </Text>
            {isMultiRound && (
              <Text style={styles.roundBadge}>Round {currentRound} of {totalRounds}</Text>
            )}
          </View>
          {isHost && (
            <TouchableOpacity onPress={toggleMutePlayers} style={styles.muteBtn} activeOpacity={0.7}>
              <Text style={styles.muteIcon}>{mutePlayersOnStart ? '🔇👥' : '🔊👥'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={toggleSoundEffects} style={styles.muteBtn} activeOpacity={0.7}>
            <Text style={styles.muteIcon}>{soundEffectsMuted ? '🔕' : '🔔'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleMute} style={styles.muteBtn} activeOpacity={0.7}>
            <Text style={styles.muteIcon}>{voiceMuted ? '🔇' : '🔊'}</Text>
          </TouchableOpacity>
        </View>

        {/* Timer */}
        <View style={styles.timerContainer}>
          <View style={styles.timerTrack}>
            <Animated.View
              testID="timer-bar"
              data-testid="timer-bar"
              style={[
                styles.timerBar,
                {
                  flex: timerAnim,
                  backgroundColor: timerColor,
                },
              ]}
            />
          </View>
          <Text style={[styles.timerText, { color: timerColor }]}>{timerRemaining}</Text>
        </View>

        {/* Question */}
        <View style={styles.questionCard}>
          <Text style={styles.questionText}>{question.question}</Text>
        </View>

        {/* Streak HUD — visible whenever streak >= 1 */}
        {currentStreak >= 1 && (
          <View
            testID="streak-hud"
            data-testid="streak-hud"
            style={styles.streakHud}
          >
            <Text style={styles.streakHudText}>🔥 {currentStreak}</Text>
          </View>
        )}

        {/* Answer options */}
        <View style={styles.optionsGrid}>
          {question.options.map((opt, i) => (
            <TouchableOpacity
              key={i}
              style={[
                styles.optionBtn,
                getOptionStyle(i),
                { borderColor: getOptionBorderColor(i) },
              ]}
              onPress={() => !answered && submitAnswer(i)}
              disabled={answered}
              activeOpacity={0.8}
            >
              <Text style={styles.optionLabel}>{OPTION_LABELS[i]}.</Text>
              <Text style={styles.optionText}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Floating score animation */}
        {answerResult?.correct && (
          <Animated.Text
            testID="score-animation"
            data-testid="score-animation"
            style={[
              styles.scoreFloat,
              { transform: [{ translateY: scoreFloatY }], opacity: scoreFloatOpacity },
            ]}
          >
            +{answerResult.points} pts
          </Animated.Text>
        )}

        {/* Voice answer mic button */}
        {voiceAnswers && !answered && Platform.OS === 'web' && (
          <View style={styles.voiceRow}>
            <TouchableOpacity
              style={[styles.micBtn, listening && styles.micBtnActive, micBlocked && styles.micBtnBlocked]}
              onPress={startListening}
              activeOpacity={0.8}
            >
              <Text style={styles.micIcon}>{micBlocked ? '🔒' : listening ? '🔴' : '🎙️'}</Text>
              <Text style={styles.micLabel}>
                {micBlocked ? 'Mic blocked' : listening ? 'Listening…' : 'Speak answer'}
              </Text>
            </TouchableOpacity>
            {voiceStatus !== '' && (
              <Text style={[styles.voiceStatus, micBlocked && styles.voiceStatusBlocked]}>{voiceStatus}</Text>
            )}
          </View>
        )}

        {/* Answer feedback */}
        {answerResult && (
          <Animated.View
            style={[
              styles.feedback,
              answerResult.correct ? styles.feedbackCorrect : styles.feedbackWrong,
              { transform: [{ scale: feedbackAnim }] },
            ]}
          >
            <Text style={styles.feedbackText}>
              {answerResult.correct
                ? isMultiRound
                  ? '✅ Correct!'
                  : `✅ Correct! +${answerResult.points} pts`
                : `❌ Wrong! The answer was ${OPTION_LABELS[answerResult.correctAnswer] ?? '?'}`}
            </Text>
          </Animated.View>
        )}

        {/* AI Commentator bubble */}
        {comment && (
          <Animated.View
            style={[
              styles.aiComment,
              { transform: [{ scale: commentAnim }] },
            ]}
          >
            <Text style={styles.aiCommentLabel}>🎙️ Quiz Master</Text>
            <Text style={styles.aiCommentText}>{comment}</Text>
          </Animated.View>
        )}
      </ScrollView>
      
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, padding: spacing.lg, paddingTop: spacing.md },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  muteBtn: { padding: 4 },
  muteIcon: { fontSize: 18 },
  category: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  progress: {
    fontSize: typography.sm,
    color: colors.textMuted,
    fontWeight: typography.medium,
  },
  roundBadge: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 1,
  },

  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  timerTrack: {
    flex: 1,
    height: 8,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.full,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  timerBar: { height: 8, borderRadius: radius.full },
  timerText: {
    width: 32,
    textAlign: 'right',
    fontSize: typography.md,
    fontWeight: typography.bold,
  },

  questionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    minHeight: 100,
    justifyContent: 'center',
  },
  questionText: {
    fontSize: typography.lg,
    fontWeight: typography.semibold,
    color: colors.textPrimary,
    lineHeight: 28,
    textAlign: 'center',
  },

  streakHud: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 100, 0, 0.18)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: '#FF6400',
  },
  streakHudText: {
    color: '#FF9A3C',
    fontWeight: typography.bold,
    fontSize: typography.base,
    letterSpacing: 0.5,
  },

  streakBadge: {
    alignSelf: 'center',
    backgroundColor: colors.errorBg,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  streakText: { color: colors.primary, fontWeight: typography.bold, fontSize: typography.sm },

  optionsGrid: { gap: spacing.sm },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 2,
    gap: spacing.sm,
  },
  optionDefault: { backgroundColor: '#1A1A2E' },
  optionSelected: { backgroundColor: '#2A2060' },
  optionCorrect:  { backgroundColor: 'rgba(0, 212, 170, 0.22)' },
  optionWrong:    { backgroundColor: 'rgba(255, 77, 109, 0.22)' },
  optionLabel: {
    fontSize: typography.base,
    fontWeight: typography.bold,
    color: colors.textSecondary,
    width: 22,
  },
  optionText: {
    fontSize: typography.base,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 22,
  },

  feedback: {
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    alignItems: 'center',
  },
  feedbackCorrect: { backgroundColor: colors.successBg, borderWidth: 1, borderColor: colors.success },
  feedbackWrong: { backgroundColor: colors.errorBg, borderWidth: 1, borderColor: colors.error },
  feedbackText: { fontSize: typography.base, fontWeight: typography.bold, color: colors.textPrimary },

  aiComment: {
    marginTop: spacing.md,
    backgroundColor: 'rgba(156,39,176,0.15)',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.accentPurple,
  },
  aiCommentLabel: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: colors.accentPurple,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  aiCommentText: {
    fontSize: typography.base,
    color: colors.textPrimary,
    fontStyle: 'italic',
  },

  voiceRow: {
    marginTop: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  micBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  micBtnActive: {
    backgroundColor: 'rgba(255,77,109,0.18)',
    borderColor: colors.error || '#ff4d6d',
  },
  micBtnBlocked: {
    backgroundColor: 'rgba(255,200,0,0.12)',
    borderColor: '#e67e22',
    opacity: 0.9,
  },
  micIcon: { fontSize: 20 },
  micLabel: { fontSize: typography.sm, color: colors.textSecondary, fontWeight: typography.semibold },
  voiceStatus: {
    fontSize: typography.xs,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
    maxWidth: 320,
  },
  voiceStatusBlocked: {
    color: '#e67e22',
    fontStyle: 'normal',
    fontWeight: typography.semibold,
  },

  scoreFloat: {
    position: 'absolute',
    alignSelf: 'center',
    fontSize: 28,
    fontWeight: typography.bold,
    color: '#00D4AA',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    pointerEvents: 'none',
  },
});
