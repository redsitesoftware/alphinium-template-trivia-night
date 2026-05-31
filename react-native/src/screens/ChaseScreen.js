/**
 * ChaseScreen - The Chase game mode question screen.
 * Used during both cash_builder and chase phases.
 * Shows question, options, timer, and chase board.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGame } from '../context/GameContext';
import { colors, typography, spacing } from '../theme';
import soundManager from '../services/soundManager';
import useVoiceAnswers from '../hooks/useVoiceAnswers';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

export default function ChaseScreen() {
  const { state, send, submitAnswer } = useGame();
  const { question, timerRemaining, timerMax, modeState, answered, answerResult, playerId, isHost, voiceAnswers } = state;

  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [submittedRef] = useState({ current: false });
  const [shake] = useState(new Animated.Value(0));

  const { listening, voiceStatus, micBlocked, startListening } = useVoiceAnswers({
    question,
    answered,
    onMatch: submitAnswer,
  });

  const phase = modeState?.phase || 'cash_builder';
  const cashBuilt = modeState?.cashBuilt ?? 0;
  const contestantSteps = modeState?.contestantSteps ?? 0;
  const chaserSteps = modeState?.chaserSteps ?? 0;
  const totalSteps = modeState?.totalSteps ?? 6;
  const chaserAnswered = modeState?.chaserAnswered;

  // Reset per question
  useEffect(() => {
    setSelectedAnswer(null);
    submittedRef.current = false;
  }, [question?.index]);

  const handleAnswer = useCallback((optionIndex) => {
    if (submittedRef.current || selectedAnswer !== null) return;
    submittedRef.current = true;
    setSelectedAnswer(optionIndex);
    soundManager.unlockAudioFromGesture();
    send({ type: 'submit_answer', answer: optionIndex });
  }, [selectedAnswer, send]);

  if (!question) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.loadingText}>Loading question...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const timerPct = timerMax > 0 ? timerRemaining / timerMax : 1;
  const timerColor = timerPct > 0.5 ? '#22c55e' : timerPct > 0.25 ? '#f59e0b' : '#ef4444';

  const isCorrect = answerResult?.correct === true;
  const isWrong   = answerResult?.correct === false;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.phaseLabel}>
            {phase === 'cash_builder' ? '💰 Cash Builder' : '🏃 The Chase'}
          </Text>
          {phase === 'cash_builder' && (
            <Text style={styles.cashBuilt}>Built: £{cashBuilt.toLocaleString()}</Text>
          )}
        </View>
        <View style={styles.timerWrap}>
          <Text style={[styles.timer, { color: timerColor }]}>{timerRemaining}</Text>
          <Text style={styles.timerLabel}>sec</Text>
        </View>
      </View>

      {/* Chase board (chase phase only) */}
      {phase === 'chase' && (
        <View style={styles.board}>
          {Array.from({ length: totalSteps + 1 }).map((_, i) => {
            const step = totalSteps - i; // 6 down to 0
            const isContestant = step === contestantSteps;
            const isChaser     = step === chaserSteps;
            return (
              <View
                key={i}
                style={[
                  styles.boardCell,
                  step === 0 && styles.boardCellCaught,
                  step === totalSteps && styles.boardCellHome,
                ]}
              >
                {isChaser && isContestant
                  ? <Text style={styles.boardEmoji}>💥</Text>
                  : isContestant
                  ? <Text style={styles.boardEmoji}>🧑</Text>
                  : isChaser
                  ? <Text style={styles.boardEmoji}>🦁</Text>
                  : step === 0
                  ? <Text style={styles.boardLabel}>OUT</Text>
                  : step === totalSteps
                  ? <Text style={styles.boardLabel}>HOME</Text>
                  : null
                }
              </View>
            );
          })}
        </View>
      )}

      {/* Question */}
      <View style={styles.questionBox}>
        <Text style={styles.questionMeta}>
          Q{question.index + 1}/{question.total}
        </Text>
        <Text style={styles.questionText}>{question.question}</Text>
      </View>

      {/* Options */}
      <View style={styles.options}>
        {question.options.map((option, index) => {
          const isSelected = selectedAnswer === index;
          const showResult = answerResult !== null;
          const isAnswerCorrect = index === answerResult?.correctIndex;
          let bg = styles.option;
          let extra = {};
          if (showResult) {
            if (isSelected && isCorrect) extra = styles.optionCorrect;
            else if (isSelected && isWrong) extra = styles.optionWrong;
            else if (isAnswerCorrect) extra = styles.optionReveal;
          } else if (isSelected) {
            extra = styles.optionSelected;
          }
          return (
            <TouchableOpacity
              key={index}
              style={[bg, extra]}
              onPress={() => handleAnswer(index)}
              disabled={selectedAnswer !== null}
              activeOpacity={0.8}
            >
              <Text style={styles.optionLetter}>{OPTION_LETTERS[index]}</Text>
              <Text style={styles.optionText}>{option}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Chaser status */}
      {phase === 'chase' && chaserAnswered !== undefined && (
        <View style={styles.chaserStatus}>
          <Text style={styles.chaserStatusText}>
            {chaserAnswered === true
              ? '🦁 Chaser answered correctly!'
              : chaserAnswered === false
              ? '✅ Chaser got it wrong!'
              : '🦁 Chaser is answering...'}
          </Text>
        </View>
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
            <Text style={styles.micLabel}>{micBlocked ? 'Mic blocked' : listening ? 'Listening…' : 'Speak answer'}</Text>
          </TouchableOpacity>
          {voiceStatus !== '' && (
            <Text style={[styles.voiceStatus, micBlocked && styles.voiceStatusBlocked]}>{voiceStatus}</Text>
          )}
        </View>
      )}

      {/* Answer result */}
      {answerResult && (
        <View style={[styles.resultBanner, isCorrect ? styles.resultBannerCorrect : styles.resultBannerWrong]}>
          <Text style={styles.resultText}>
            {isCorrect
              ? phase === 'cash_builder'
                ? `✅ +£1,000 → £${cashBuilt.toLocaleString()}`
                : '✅ Correct! Step forward!'
              : '❌ Wrong!'}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a2e' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: colors.textPrimary, fontSize: typography.lg },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: '#1a1a3e',
    borderBottomWidth: 2,
    borderBottomColor: '#ffd700',
  },
  phaseLabel: { color: '#ffd700', fontSize: typography.md, fontWeight: '700' },
  cashBuilt: { color: colors.textSecondary, fontSize: typography.sm, marginTop: 2 },
  timerWrap: { alignItems: 'center' },
  timer: { fontSize: 36, fontWeight: '900', lineHeight: 38 },
  timerLabel: { color: colors.textSecondary, fontSize: typography.xs },

  board: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: 4,
  },
  boardCell: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#1a1a5e',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a6e',
  },
  boardCellHome: { backgroundColor: '#166534', borderColor: '#22c55e' },
  boardCellCaught: { backgroundColor: '#7f1d1d', borderColor: '#ef4444' },
  boardEmoji: { fontSize: 20 },
  boardLabel: { color: colors.white, fontSize: 8, fontWeight: '700' },

  questionBox: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: '#1a1a3e',
    borderRadius: 12,
    padding: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: '#ffd700',
  },
  questionMeta: { color: colors.textSecondary, fontSize: typography.xs, marginBottom: spacing.xs },
  questionText: { color: colors.white, fontSize: typography.lg, fontWeight: '600', lineHeight: 26 },

  options: { paddingHorizontal: spacing.lg, gap: spacing.sm, marginTop: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e3a8a',
    borderRadius: 10,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionSelected:  { borderColor: '#ffd700', backgroundColor: '#2563eb' },
  optionCorrect:   { borderColor: '#22c55e', backgroundColor: '#166534' },
  optionWrong:     { borderColor: '#ef4444', backgroundColor: '#7f1d1d' },
  optionReveal:    { borderColor: '#22c55e', backgroundColor: '#14532d' },
  optionLetter: { color: '#ffd700', fontSize: typography.lg, fontWeight: '800', marginRight: spacing.md, minWidth: 24 },
  optionText: { color: colors.white, fontSize: typography.md, flex: 1 },

  chaserStatus: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderRadius: 8,
    alignItems: 'center',
  },
  chaserStatusText: { color: '#ffd700', fontSize: typography.sm },

  resultBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 10,
    alignItems: 'center',
  },
  resultBannerCorrect: { backgroundColor: '#166534' },
  resultBannerWrong:   { backgroundColor: '#7f1d1d' },
  resultText: { color: colors.white, fontSize: typography.lg, fontWeight: '700' },

  voiceRow: { alignItems: 'center', paddingVertical: spacing.sm },
  micBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1e3a8a', paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
    borderRadius: 24, borderWidth: 2, borderColor: 'transparent',
  },
  micBtnActive:   { borderColor: '#ef4444', backgroundColor: '#7f1d1d' },
  micBtnBlocked:  { opacity: 0.5 },
  micIcon:  { fontSize: 20, marginRight: spacing.sm },
  micLabel: { color: colors.white, fontSize: typography.sm },
  voiceStatus:        { color: colors.textSecondary, fontSize: typography.xs, marginTop: 4, textAlign: 'center' },
  voiceStatusBlocked: { color: '#ef4444' },
});
