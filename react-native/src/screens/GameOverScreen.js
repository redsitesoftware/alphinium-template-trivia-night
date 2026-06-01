/**
 * GameOverScreen — Final podium + full leaderboard.
 * Celebrates the winners and lets players return to Home.
 */

import React, { useEffect, useRef, useState, useContext } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, Animated, ScrollView, Image,
} from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGame } from '../context/GameContext';
import { useAgent } from '../hooks/useAgent';
import { useGameStats } from '../hooks/useGameStats';
import { AuthContext } from '../context/AuthContext';
import { colors, typography, spacing, radius } from '../theme';
import ShareSheet from '../components/ShareSheet';
import { getWebBaseUrl } from '../config';

const MEDALS = ['🥇', '🥈', '🥉'];
const PODIUM_ORDER = [1, 0, 2]; // 2nd, 1st, 3rd for visual effect
const PODIUM_HEIGHTS = [80, 110, 60];

export default function GameOverScreen() {
  const { state, disconnect } = useGame();
  const { leaderboard, playerId, roomCode, subject, playerName: gamePlayerName } = state;
  const { saveResult, stats } = useGameStats();
  const { user } = useContext(AuthContext) || {};
  const [resultFlags, setResultFlags] = useState(null);

  // Resolve best display name: login first name > game name > fallback
  const firstName = user?.firstname || user?.username?.split(' ')[0] || null;
  const displayName = firstName || gamePlayerName || 'You';

  const myRank = leaderboard.findIndex((p) => p.id === playerId);
  const myEntry = myRank >= 0 ? leaderboard[myRank] : null;

  const { comment, sendEvent } = useAgent({
    roomCode,
    playerName: gamePlayerName,
    leaderboard,
  });

  const confettiRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const podiumAnims = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  const top3 = leaderboard.slice(0, 3);
  const podium = PODIUM_ORDER.map((i) => top3[i]).filter(Boolean);

  useEffect(() => {
    sendEvent({
      type: 'game_over',
      playerName: gamePlayerName,
      rank: myRank + 1,
      score: myEntry?.score,
      totalPlayers: leaderboard.length,
    });

    if (myRank >= 0) {
      const myScore = myEntry?.score ?? 0;
      saveResult({
        score: myScore,
        rank: myRank,
        totalPlayers: leaderboard.length,
        subject: subject || 'General Knowledge',
      }).then(setResultFlags).catch(() => {});
    }

    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.stagger(200, podiumAnims.map((a) =>
        Animated.spring(a, { toValue: 1, bounciness: 10, useNativeDriver: true })
      )),
    ]).start(() => {
      if (myRank === 0 && confettiRef.current) {
        confettiRef.current.start();
      }
    });
  }, []);

  function handlePlayAgain() {
    disconnect();
  }

  const shareUrl = getWebBaseUrl() || 'https://trivia.user-pods.alphinium.io';
  const rankLabel = myRank === 0 ? '🥇 1st' : myRank === 1 ? '🥈 2nd' : myRank === 2 ? '🥉 3rd' : `#${myRank + 1}`;
  const playersBeaten = leaderboard.length > 1 ? ` — beat ${leaderboard.length - 1 - myRank} of ${leaderboard.length - 1} player${leaderboard.length > 2 ? 's' : ''}` : '';
  const scoreBlurb = myEntry
    ? `${displayName} finished ${rankLabel} in Trivia Night${subject ? ` (${subject})` : ''} with ${myEntry.score} pts${playersBeaten}! Can you beat that? 🎮`
    : `${displayName} just played Trivia Night${subject ? ` — ${subject}` : ''}! 🎮 Incredibly fun.`;
  const shareText = comment ? `${scoreBlurb}\n\n"${comment}" — AI Host` : scoreBlurb;


  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Animated.View style={{ opacity: fadeAnim }}>
          <View style={styles.logoHeader}>
            <Image
              source={require('../assets/logo-transparent.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.title}>🏁 Game Over!</Text>

          {myRank >= 0 && (
            <View style={styles.myRankBadge}>
              <Text style={styles.myRankText}>
                You finished {myRank === 0 ? '🥇 1st' : myRank === 1 ? '🥈 2nd' : myRank === 2 ? '🥉 3rd' : `#${myRank + 1}`}
                {' '}with {leaderboard[myRank]?.score} pts
              </Text>
              {resultFlags?.isPersonalBest && (
                <Text style={styles.personalBest}>🏆 New Personal Best!</Text>
              )}
              {user && (
                <Text style={styles.savedBadge}>✅ Saved to your history</Text>
              )}
            </View>
          )}

          {/* Podium */}
          <View style={styles.podiumRow}>
            {podium.map((player, podiumIdx) => {
              const rank = leaderboard.indexOf(player);
              return (
                <Animated.View
                  key={player.id}
                  style={[
                    styles.podiumPlace,
                    { transform: [{ scale: podiumAnims[podiumIdx] }] },
                  ]}
                >
                  <Text style={styles.podiumEmoji}>{MEDALS[rank] || ''}</Text>
                  <Text style={styles.podiumName} numberOfLines={1}>{player.name}</Text>
                  <Text style={styles.podiumScore}>{player.score} pts</Text>
                  <View style={[styles.podiumBlock, { height: PODIUM_HEIGHTS[podiumIdx] }]} />
                </Animated.View>
              );
            })}
          </View>

          {/* AI comment */}
          {comment && (
            <View style={styles.aiComment}>
              <Text style={styles.aiCommentLabel}>🤖 AI Host</Text>
              <Text style={styles.aiCommentText}>{comment}</Text>
            </View>
          )}

          {/* Full leaderboard */}
          <Text style={styles.fullLbTitle}>Full Results</Text>
          <View style={styles.fullLb}>
            {leaderboard.map((p, i) => (
              <View key={p.id} style={[styles.lbRow, p.id === playerId && styles.lbRowMe]}>
                <Text style={styles.lbRank}>{MEDALS[i] || `${i + 1}`}</Text>
                <Text style={styles.lbName} numberOfLines={1}>
                  {p.name}{p.id === playerId ? ' (you)' : ''}
                </Text>
                <Text style={styles.lbScore}>{p.score}</Text>
              </View>
            ))}
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={handlePlayAgain} activeOpacity={0.8}>
              <Text style={styles.actionBtnText}>Play Again 🎮</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnSecondary]}
              onPress={() => { disconnect(); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>New Room 🏠</Text>
            </TouchableOpacity>
          </View>

          <ShareSheet
            title="Trivia Night"
            text={shareText}
            url={shareUrl}
            label="Share Result 🎉"
            style={styles.shareSheet}
          />
        </Animated.View>
      </ScrollView>
      {myRank === 0 && (
        <ConfettiCannon
          ref={confettiRef}
          count={200}
          origin={{ x: -20, y: 0 }}
          autoStart={false}
          fadeOut
          style={styles.confettiOverlay}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },

  logoHeader: { alignItems: 'center', marginBottom: spacing.sm, marginTop: spacing.sm },
  logoImage: { width: 64, height: 64 },

  title: {
    fontSize: typography.xxl,
    fontWeight: typography.heavy,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },

  myRankBadge: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.xl,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    gap: spacing.xs,
  },
  myRankText: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.textPrimary,
  },
  personalBest: {
    fontSize: typography.sm,
    fontWeight: typography.bold,
    color: colors.warning,
  },
  savedBadge: {
    fontSize: typography.xs,
    color: colors.accent,
  },

  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  podiumPlace: { alignItems: 'center', flex: 1 },
  podiumEmoji: { fontSize: 32, marginBottom: spacing.xs },
  podiumName: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  podiumScore: { fontSize: typography.xs, color: colors.textSecondary, marginBottom: spacing.xs },
  podiumBlock: {
    width: '100%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },

  aiComment: {
    backgroundColor: 'rgba(156,39,176,0.15)',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.accentPurple,
    marginBottom: spacing.lg,
  },
  aiCommentLabel: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: colors.accentPurple,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  aiCommentText: { fontSize: typography.base, color: colors.textPrimary, fontStyle: 'italic' },

  fullLbTitle: {
    fontSize: typography.lg,
    fontWeight: typography.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  fullLb: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  lbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: spacing.md,
  },
  lbRowMe: { backgroundColor: colors.surfaceElevated },
  lbRank: { fontSize: typography.md, width: 32 },
  lbName: { flex: 1, fontSize: typography.base, color: colors.textPrimary },
  lbScore: { fontSize: typography.md, fontWeight: typography.bold, color: colors.accent },

  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  actionBtnPrimary: { backgroundColor: colors.primary },
  actionBtnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  actionBtnText: { color: colors.white, fontSize: typography.md, fontWeight: typography.bold },
  actionBtnTextSecondary: { color: colors.primary },
  shareSheet: { marginTop: spacing.sm },
  confettiOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
});
