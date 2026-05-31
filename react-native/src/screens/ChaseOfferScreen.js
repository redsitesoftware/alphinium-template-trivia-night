/**
 * ChaseOfferScreen - Shown after cash builder round ends.
 * Contestant (host) picks from 3 offers: High, Safe, Low.
 * Non-host players see a waiting screen.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGame } from '../context/GameContext';
import { colors, typography, spacing } from '../theme';

export default function ChaseOfferScreen() {
  const { state, send } = useGame();
  const { modeState, isHost } = state;

  const cashBuilt = modeState?.cashBuilt ?? 0;
  const offers = modeState?.offers || { high: 0, safe: 0, low: 0 };

  const handleAccept = (offerType) => {
    send({ type: 'chase_accept_offer', offerType });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>💰 The Offer</Text>
        <Text style={styles.subtitle}>
          You built{' '}
          <Text style={styles.cashHighlight}>£{cashBuilt.toLocaleString()}</Text>
          {' '}in the cash builder
        </Text>
      </View>

      <View style={styles.chaser}>
        <Text style={styles.chaserIcon}>🦁</Text>
        <Text style={styles.chaserLabel}>The Chaser has made three offers</Text>
      </View>

      <View style={styles.offers}>
        {/* High offer */}
        <TouchableOpacity
          style={[styles.offerCard, styles.offerHigh]}
          onPress={() => handleAccept('high')}
          disabled={!isHost}
          activeOpacity={isHost ? 0.8 : 1}
        >
          <Text style={styles.offerLabel}>HIGH OFFER</Text>
          <Text style={styles.offerAmount}>£{offers.high.toLocaleString()}</Text>
          <View style={styles.offerMeta}>
            <Text style={styles.offerMetaText}>🟡 Start 4 steps back from chaser</Text>
            <Text style={styles.offerMetaText}>Higher risk, higher reward</Text>
          </View>
        </TouchableOpacity>

        {/* Safe offer */}
        <TouchableOpacity
          style={[styles.offerCard, styles.offerSafe]}
          onPress={() => handleAccept('safe')}
          disabled={!isHost}
          activeOpacity={isHost ? 0.8 : 1}
        >
          <Text style={styles.offerLabel}>SAFE OFFER</Text>
          <Text style={styles.offerAmount}>£{offers.safe.toLocaleString()}</Text>
          <View style={styles.offerMeta}>
            <Text style={styles.offerMetaText}>🟢 Start 3 steps back from chaser</Text>
            <Text style={styles.offerMetaText}>What you actually won</Text>
          </View>
        </TouchableOpacity>

        {/* Low offer */}
        <TouchableOpacity
          style={[styles.offerCard, styles.offerLow]}
          onPress={() => handleAccept('low')}
          disabled={!isHost}
          activeOpacity={isHost ? 0.8 : 1}
        >
          <Text style={styles.offerLabel}>LOW OFFER</Text>
          <Text style={styles.offerAmount}>£{offers.low.toLocaleString()}</Text>
          <View style={styles.offerMeta}>
            <Text style={styles.offerMetaText}>🔴 Start 2 steps back from chaser</Text>
            <Text style={styles.offerMetaText}>Lower risk, but lose winnings</Text>
          </View>
        </TouchableOpacity>
      </View>

      {!isHost && (
        <View style={styles.waiting}>
          <Text style={styles.waitingText}>Waiting for host to choose an offer…</Text>
        </View>
      )}

      {isHost && (
        <Text style={styles.hostHint}>Tap an offer to accept and start the Chase!</Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a2e' },

  header: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  title: { color: '#ffd700', fontSize: 32, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: colors.textSecondary, fontSize: typography.md, textAlign: 'center', marginTop: spacing.sm },
  cashHighlight: { color: '#ffd700', fontWeight: '700' },

  chaser: { alignItems: 'center', marginBottom: spacing.lg },
  chaserIcon: { fontSize: 64 },
  chaserLabel: { color: colors.textSecondary, fontSize: typography.sm, marginTop: spacing.xs },

  offers: { paddingHorizontal: spacing.lg, gap: spacing.md },

  offerCard: {
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 3,
    alignItems: 'center',
  },
  offerHigh: { backgroundColor: '#1c1a05', borderColor: '#ffd700' },
  offerSafe: { backgroundColor: '#052010', borderColor: '#22c55e' },
  offerLow:  { backgroundColor: '#1c0505', borderColor: '#ef4444' },

  offerLabel: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: spacing.xs,
  },
  offerAmount: { color: colors.white, fontSize: 36, fontWeight: '900' },
  offerMeta: { marginTop: spacing.sm, alignItems: 'center' },
  offerMetaText: { color: colors.textSecondary, fontSize: typography.xs, marginTop: 2 },

  waiting: {
    margin: spacing.xl,
    padding: spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    alignItems: 'center',
  },
  waitingText: { color: colors.textSecondary, fontSize: typography.md },

  hostHint: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
