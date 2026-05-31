/**
 * BuzzerScreen - Buzzer Round mode
 * 
 * Features:
 * - Fastest finger first - tap to buzz in
 * - First buzzer locks the question
 * - Correct: +10 points, Wrong: -5 points + question unlocks
 * - Elimination mode: lowest scorer each round eliminated
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Vibration } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGame } from '../context/GameContext';
import { colors, typography, spacing } from '../theme';
import soundManager from '../services/soundManager';

export default function BuzzerScreen() {
  const { state, send } = useGame();
  const { currentQuestion, timerRemaining, modeState, players, playerId } = state;
  
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  
  const question = state.question;  // correct: current question object, not state.questions[idx]
  const buzzOrder = modeState?.buzzOrder || [];
  const lockedPlayer = modeState?.lockedPlayer;
  const isLocked = lockedPlayer && lockedPlayer !== playerId;
  const isBuzzed = buzzOrder.some(b => b.playerId === playerId);
  
  if (!question) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loading}>Loading question...</Text>
      </SafeAreaView>
    );
  }
  
  const handleBuzz = () => {
    if (isBuzzed || isLocked) return;
    
    soundManager.unlockAudioFromGesture();
    Vibration.vibrate(100);
    soundManager.play('tick'); // Use tick as buzz sound
    send({ type: 'buzz' });
  };
  
  const handleAnswer = (optionIndex) => {
    if (lockedPlayer !== playerId || selectedAnswer !== null) return;
    setSelectedAnswer(optionIndex);
    send({ type: 'submit_answer', answer: optionIndex });
  };
  
  const canAnswer = lockedPlayer === playerId;
  
  return (
    <SafeAreaView style={styles.container}>
      {/* Buzz Area - take up most of screen */}
      {!canAnswer && (
        <TouchableOpacity
          style={[
            styles.buzzArea,
            isBuzzed && styles.buzzAreaBuzzed,
            isLocked && styles.buzzAreaLocked,
          ]}
          onPress={handleBuzz}
          disabled={isBuzzed || isLocked}
          activeOpacity={0.9}
        >
          <Text style={styles.buzzIcon}>🔔</Text>
          <Text style={styles.buzzText}>
            {isLocked ? 'LOCKED' : isBuzzed ? 'BUZZED IN!' : 'TAP TO BUZZ'}
          </Text>
          
          {buzzOrder.length > 0 && (
            <View style={styles.buzzOrder}>
              <Text style={styles.buzzOrderTitle}>Buzz Order:</Text>
              {buzzOrder.map((buzz, idx) => {
                const player = players.find(p => p.id === buzz.playerId);
                return (
                  <Text key={idx} style={styles.buzzOrderItem}>
                    {idx + 1}. {player?.name || 'Player'}
                  </Text>
                );
              })}
            </View>
          )}
        </TouchableOpacity>
      )}
      
      {/* Question & Options - shown when player has buzzed in */}
      {canAnswer && (
        <View style={styles.questionArea}>
          <View style={styles.questionBox}>
            <Text style={styles.lockedText}>🔒 YOU'RE IN!</Text>
            <Text style={styles.questionText}>{question.question}</Text>
            <Text style={styles.timer}>⏱️ {timerRemaining}s</Text>
          </View>
          
          <View style={styles.options}>
            {question.options.map((option, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.option,
                  selectedAnswer === index && styles.optionSelected,
                ]}
                onPress={() => handleAnswer(index)}
                disabled={selectedAnswer !== null}
                activeOpacity={0.7}
              >
                <Text style={styles.optionLetter}>
                  {String.fromCharCode(65 + index)}:
                </Text>
                <Text style={styles.optionText}>{option}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
      
      {/* Scores */}
      <View style={styles.scores}>
        {players
          .sort((a, b) => b.score - a.score)
          .map((player, idx) => (
            <View key={player.id} style={styles.scoreRow}>
              <Text style={styles.scoreRank}>#{idx + 1}</Text>
              <Text style={styles.scoreName}>{player.name}</Text>
              <Text style={styles.scorePoints}>{player.score}</Text>
            </View>
          ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a2e',
  },
  buzzArea: {
    flex: 1,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    margin: spacing.lg,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: '#ffd700',
  },
  buzzAreaBuzzed: {
    backgroundColor: '#ffd700',
  },
  buzzAreaLocked: {
    backgroundColor: '#3a3a5e',
    opacity: 0.6,
  },
  buzzIcon: {
    fontSize: 100,
    marginBottom: spacing.lg,
  },
  buzzText: {
    fontSize: 48,
    color: colors.white,
    fontWeight: '900',
    textAlign: 'center',
  },
  buzzOrder: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
  },
  buzzOrderTitle: {
    fontSize: typography.lg,
    color: colors.white,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  buzzOrderItem: {
    fontSize: typography.md,
    color: colors.white,
    marginVertical: spacing.xs,
  },
  questionArea: {
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
  lockedText: {
    fontSize: typography.lg,
    color: '#ffd700',
    fontWeight: '800',
    marginBottom: spacing.md,
    textAlign: 'center',
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
    marginTop: spacing.lg,
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
  scores: {
    backgroundColor: '#1a1a3e',
    padding: spacing.md,
    borderTopWidth: 2,
    borderTopColor: '#ffd700',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  scoreRank: {
    fontSize: typography.md,
    color: '#ffd700',
    fontWeight: '700',
    width: 40,
  },
  scoreName: {
    fontSize: typography.md,
    color: colors.white,
    flex: 1,
  },
  scorePoints: {
    fontSize: typography.lg,
    color: colors.white,
    fontWeight: '700',
  },
  loading: {
    fontSize: typography.lg,
    color: colors.white,
    textAlign: 'center',
    marginTop: 100,
  },
});
