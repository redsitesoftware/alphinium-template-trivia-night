/**
 * MillionaireScreen - Who Wants to Be a Millionaire mode
 * 
 * Features:
 * - 15-question money ladder with increasing difficulty
 * - 3 lifelines: 50:50, Ask the Audience, Phone a Friend
 * - Safe havens at $1,000 (Q5) and $32,000 (Q10)
 * - Walk away option
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGame } from '../context/GameContext';
import { colors, typography, spacing } from '../theme';

const MONEY_LADDER = [
  { level: 15, amount: '$1,000,000', isSafe: false },
  { level: 14, amount: '$500,000', isSafe: false },
  { level: 13, amount: '$250,000', isSafe: false },
  { level: 12, amount: '$125,000', isSafe: false },
  { level: 11, amount: '$64,000', isSafe: false },
  { level: 10, amount: '$32,000', isSafe: true },
  { level: 9, amount: '$16,000', isSafe: false },
  { level: 8, amount: '$8,000', isSafe: false },
  { level: 7, amount: '$4,000', isSafe: false },
  { level: 6, amount: '$2,000', isSafe: false },
  { level: 5, amount: '$1,000', isSafe: true },
  { level: 4, amount: '$500', isSafe: false },
  { level: 3, amount: '$300', isSafe: false },
  { level: 2, amount: '$200', isSafe: false },
  { level: 1, amount: '$100', isSafe: false },
];

export default function MillionaireScreen() {
  const { state, send } = useGame();
  const { question, timerRemaining, modeState } = state;
  
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showWalkAway, setShowWalkAway] = useState(false);
  const [removedOptions, setRemovedOptions] = useState([]);
  
  // question index is 0-based; level is 1-based
  const currentLevel = (modeState?.currentLevel || 0) + 1;
  const lifelines = modeState?.lifelines || { fiftyFifty: true, audience: true, phone: true };
  const safeHaven = modeState?.safeHaven || 0;
  
  // Reset per-question state when question changes
  useEffect(() => {
    setSelectedAnswer(null);
    setRemovedOptions([]);
  }, [question?.index]);

  if (!question) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loading}>Loading question...</Text>
      </SafeAreaView>
    );
  }
  
  const handleAnswer = (optionIndex) => {
    if (selectedAnswer !== null || removedOptions.includes(optionIndex)) return;
    setSelectedAnswer(optionIndex);
    send({ type: 'submit_answer', answer: optionIndex });
  };
  
  const handleLifeline = (lifeline) => {
    if (!lifelines[lifeline]) return;
    send({ type: 'use_lifeline', lifeline });
    
    // Client-side effects for immediate feedback
    if (lifeline === 'fiftyFifty') {
      const correctAnswer = question.answer;
      const wrongOptions = question.options
        .map((_, i) => i)
        .filter(i => i !== correctAnswer);
      
      // Remove 2 random wrong answers
      const toRemove = [];
      while (toRemove.length < 2 && wrongOptions.length > 0) {
        const idx = Math.floor(Math.random() * wrongOptions.length);
        toRemove.push(wrongOptions[idx]);
        wrongOptions.splice(idx, 1);
      }
      setRemovedOptions(toRemove);
    }
  };
  
  const handleWalkAway = () => {
    send({ type: 'walk_away' });
  };
  
  return (
    <SafeAreaView style={styles.container}>
      {/* Money Ladder */}
      <View style={styles.ladder}>
        <ScrollView 
          style={styles.ladderScroll}
          contentContainerStyle={styles.ladderContent}
        >
          {MONEY_LADDER.map((step) => {
            const isActive = step.level === currentLevel;
            const isPassed = step.level < currentLevel;
            
            return (
              <View
                key={step.level}
                style={[
                  styles.ladderStep,
                  isActive && styles.ladderStepActive,
                  isPassed && styles.ladderStepPassed,
                  step.isSafe && styles.ladderStepSafe,
                ]}
              >
                <Text style={[styles.ladderAmount, isActive && styles.ladderAmountActive]}>
                  {step.amount}
                </Text>
                {step.isSafe && <Text style={styles.safeIcon}>🛡️</Text>}
              </View>
            );
          })}
        </ScrollView>
      </View>
      
      {/* Main Game Area */}
      <View style={styles.gameArea}>
        {/* Question */}
        <View style={styles.questionBox}>
          <Text style={styles.questionLevel}>Question {currentLevel} of 15</Text>
          <Text style={styles.questionText}>{question.question}</Text>
          <Text style={styles.timer}>⏱️ {timerRemaining}s</Text>
        </View>
        
        {/* Options */}
        <View style={styles.options}>
          {question.options.map((option, index) => {
            const isRemoved = removedOptions.includes(index);
            const isSelected = selectedAnswer === index;
            
            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.option,
                  isSelected && styles.optionSelected,
                  isRemoved && styles.optionRemoved,
                ]}
                onPress={() => handleAnswer(index)}
                disabled={isRemoved || selectedAnswer !== null}
                activeOpacity={0.7}
              >
                <Text style={[styles.optionLetter, isRemoved && styles.optionRemovedText]}>
                  {String.fromCharCode(65 + index)}:
                </Text>
                <Text style={[styles.optionText, isRemoved && styles.optionRemovedText]}>
                  {option}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        
        {/* Lifelines */}
        <View style={styles.lifelines}>
          <TouchableOpacity
            style={[styles.lifeline, !lifelines.fiftyFifty && styles.lifelineUsed]}
            onPress={() => handleLifeline('fiftyFifty')}
            disabled={!lifelines.fiftyFifty}
          >
            <Text style={styles.lifelineText}>50:50</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.lifeline, !lifelines.audience && styles.lifelineUsed]}
            onPress={() => handleLifeline('audience')}
            disabled={!lifelines.audience}
          >
            <Text style={styles.lifelineText}>👥</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.lifeline, !lifelines.phone && styles.lifelineUsed]}
            onPress={() => handleLifeline('phone')}
            disabled={!lifelines.phone}
          >
            <Text style={styles.lifelineText}>📞</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.walkAwayBtn}
            onPress={() => setShowWalkAway(true)}
          >
            <Text style={styles.walkAwayText}>Walk Away</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Walk Away Confirmation */}
      <Modal visible={showWalkAway} transparent animationType="fade">
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Walk Away?</Text>
            <Text style={styles.modalText}>
              You'll leave with {MONEY_LADDER[15 - currentLevel + 1]?.amount || '$0'}
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setShowWalkAway(false)}
              >
                <Text style={styles.modalButtonText}>Keep Playing</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleWalkAway}
              >
                <Text style={[styles.modalButtonText, styles.modalButtonTextConfirm]}>
                  Walk Away
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a2e',
    flexDirection: 'row',
  },
  ladder: {
    width: 140,
    backgroundColor: '#1a1a3e',
    borderRightWidth: 2,
    borderRightColor: '#ffd700',
  },
  ladderScroll: {
    flex: 1,
  },
  ladderContent: {
    padding: spacing.sm,
    flexDirection: 'column-reverse',
  },
  ladderStep: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginVertical: 2,
    backgroundColor: '#2a2a4e',
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ladderStepActive: {
    backgroundColor: '#ffd700',
  },
  ladderStepPassed: {
    backgroundColor: '#3a3a5e',
    opacity: 0.6,
  },
  ladderStepSafe: {
    borderWidth: 2,
    borderColor: '#00ff00',
  },
  ladderAmount: {
    fontSize: typography.sm,
    color: colors.white,
    fontWeight: '600',
  },
  ladderAmountActive: {
    color: '#0a0a2e',
    fontWeight: '800',
  },
  safeIcon: {
    fontSize: 12,
  },
  gameArea: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  questionBox: {
    backgroundColor: '#1a1a3e',
    padding: spacing.lg,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ffd700',
  },
  questionLevel: {
    fontSize: typography.sm,
    color: '#ffd700',
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  questionText: {
    fontSize: typography.lg,
    color: colors.white,
    fontWeight: '600',
    lineHeight: 28,
  },
  timer: {
    fontSize: typography.md,
    color: colors.white,
    marginTop: spacing.md,
    textAlign: 'right',
  },
  options: {
    gap: spacing.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563eb',
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionSelected: {
    borderColor: '#ffd700',
    backgroundColor: '#ffd700',
  },
  optionRemoved: {
    backgroundColor: '#3a3a5e',
    opacity: 0.3,
  },
  optionLetter: {
    fontSize: typography.lg,
    color: colors.white,
    fontWeight: '800',
    marginRight: spacing.md,
    minWidth: 24,
  },
  optionText: {
    fontSize: typography.md,
    color: colors.white,
    flex: 1,
  },
  optionRemovedText: {
    textDecorationLine: 'line-through',
  },
  lifelines: {
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'center',
  },
  lifeline: {
    backgroundColor: '#ffd700',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  lifelineUsed: {
    backgroundColor: '#3a3a5e',
    opacity: 0.5,
  },
  lifelineText: {
    fontSize: typography.lg,
    color: '#0a0a2e',
    fontWeight: '800',
  },
  walkAwayBtn: {
    backgroundColor: '#ef4444',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
  },
  walkAwayText: {
    fontSize: typography.md,
    color: colors.white,
    fontWeight: '700',
  },
  loading: {
    fontSize: typography.lg,
    color: colors.white,
    textAlign: 'center',
    marginTop: 100,
  },
  modal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1a1a3e',
    padding: spacing.xl,
    borderRadius: 12,
    minWidth: 300,
    borderWidth: 2,
    borderColor: '#ffd700',
  },
  modalTitle: {
    fontSize: typography.xl,
    color: '#ffd700',
    fontWeight: '800',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  modalText: {
    fontSize: typography.lg,
    color: colors.white,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    padding: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonConfirm: {
    backgroundColor: '#ef4444',
  },
  modalButtonText: {
    color: colors.white,
    fontWeight: '700',
  },
  modalButtonTextConfirm: {
    color: colors.white,
  },
});
