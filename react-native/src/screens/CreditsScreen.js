/**
 * CreditsScreen — purchase AI game credits for Trivia Night.
 *
 * Opens Stripe Checkout in an external browser (works on web, iOS, Android).
 * No App Store IAP needed — purchase happens on payments-api.alphinium.com.
 *
 * userId: Strapi user ID when logged in, otherwise device UUID fallback.
 */

import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ActivityIndicator, ScrollView, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { stripeService } from '../services/stripe';
import { AuthContext } from '../context/AuthContext';
import LoginScreen from './LoginScreen';
import { colors, typography, spacing, radius } from '../theme';

// ── Device pseudo-user ID fallback (used when not logged in) ─────────────────
function getDeviceUserId() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'native-user';
  let id = localStorage.getItem('trivia_device_user_id');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('trivia_device_user_id', id);
  }
  return id;
}

const SUCCESS_URL = Platform.OS === 'web' && typeof window !== 'undefined'
  ? `${window.location.origin}/?credits=success`
  : 'https://trivia.user-pods.alphinium.io/?credits=success';

const CANCEL_URL = Platform.OS === 'web' && typeof window !== 'undefined'
  ? `${window.location.origin}/?credits=cancel`
  : 'https://trivia.user-pods.alphinium.io/';

export default function CreditsScreen({ onClose }) {
  const { user, token, logout } = useContext(AuthContext) || {};
  const [bundles, setBundles]       = useState([]);
  const [balance, setBalance]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [error, setError]           = useState(null);
  const [showLogin, setShowLogin]   = useState(false);

  // Prefer Strapi user ID; fall back to device UUID
  const userId = user?.id ? String(user.id) : getDeviceUserId();
  const userEmail = user?.email || null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansData, balanceData] = await Promise.all([
        stripeService.getCreditBundles(),
        stripeService.getCreditBalance(userId),
      ]);
      setBundles(plansData.bundles || []);
      setBalance(balanceData.balance ?? 0);
    } catch (e) {
      setError('Failed to load plans. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handlePurchase = async (bundle) => {
    try {
      setPurchasing(bundle.key);
      const { url } = await stripeService.createCreditSession(
        bundle.key, userId, userEmail, SUCCESS_URL, CANCEL_URL
      );
      await Linking.openURL(url);
    } catch (e) {
      setError(e.message || 'Payment failed. Please try again.');
    } finally {
      setPurchasing(null);
    }
  };

  return (
    <>
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>🎮 AI Game Credits</Text>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.subtitle}>
          Each credit unlocks one AI-powered game — custom questions and Brian's voice narration.
          Classic question games are always free.
        </Text>

        {/* Auth status — nudge to login for persistent credits */}
        {user ? (
          <View style={styles.authRow}>
            <Text style={styles.authText}>✅ Signed in as {user.email || user.username}</Text>
            <TouchableOpacity onPress={logout}>
              <Text style={styles.authAction}>Sign out</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.loginNudge} onPress={() => setShowLogin(true)}>
            <Text style={styles.loginNudgeText}>🔐 Sign in to keep credits across devices</Text>
            <Text style={styles.loginNudgeAction}>Sign in →</Text>
          </TouchableOpacity>
        )}

        {/* Credit balance */}
        {balance !== null && (
          <View style={styles.balanceBox}>
            <Text style={styles.balanceLabel}>Your balance</Text>
            <Text style={styles.balanceValue}>{balance} {balance === 1 ? 'credit' : 'credits'}</Text>
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={load}><Text style={styles.retryText}>Retry</Text></TouchableOpacity>
          </View>
        )}

        {/* Bundles */}
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          bundles.map((bundle, i) => {
            const isBest = bundle.key === 'standard';
            const dollars = Math.floor(bundle.amount / 100);
            const cents = bundle.amount % 100;
            const perGame = (bundle.amount / bundle.games / 100).toFixed(2);
            return (
              <View key={bundle.key} style={[styles.card, isBest && styles.cardBest]}>
                {isBest && <Text style={styles.bestBadge}>BEST VALUE</Text>}
                <Text style={styles.cardName}>{bundle.name}</Text>
                <Text style={styles.cardDesc}>{bundle.description}</Text>
                <Text style={styles.cardPrice}>
                  ${dollars}.{String(cents).padStart(2, '0')}
                  <Text style={styles.cardPerGame}> · ${perGame}/game</Text>
                </Text>
                <TouchableOpacity
                  style={[styles.buyBtn, !bundle.available && styles.buyBtnDisabled]}
                  onPress={() => bundle.available && handlePurchase(bundle)}
                  disabled={!bundle.available || !!purchasing}
                >
                  {purchasing === bundle.key
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.buyBtnText}>
                        {bundle.available ? `Buy ${bundle.games} Credits` : 'Coming Soon'}
                      </Text>
                  }
                </TouchableOpacity>
              </View>
            );
          })
        )}

        <Text style={styles.note}>
          Payment processed securely by Stripe. Credits are added to this device automatically after purchase.
          {Platform.OS !== 'web' ? ' You\'ll be taken to your browser to complete payment.' : ''}
        </Text>
      </ScrollView>
    </SafeAreaView>

    {/* Login modal */}
    <Modal visible={showLogin} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowLogin(false)}>
      <LoginScreen onClose={() => { setShowLogin(false); load(); }} />
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background || '#0a0a1a' },
  container: { padding: spacing.lg || 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '800', color: '#fff' },
  closeBtn: { padding: 8 },
  closeText: { fontSize: 18, color: '#aaa' },
  subtitle: { fontSize: 14, color: '#aaa', marginBottom: 20, lineHeight: 20 },
  balanceBox: {
    backgroundColor: '#1a1a2e', borderRadius: radius.md || 12,
    padding: 16, alignItems: 'center', marginBottom: 20,
    borderWidth: 1, borderColor: '#2a2a4a',
  },
  balanceLabel: { fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 1 },
  balanceValue: { fontSize: 32, fontWeight: '800', color: '#7c3aed', marginTop: 4 },
  errorBox: { backgroundColor: '#2a0a0a', borderRadius: 8, padding: 12, marginBottom: 16, flexDirection: 'row', gap: 12 },
  errorText: { color: '#ff6b6b', flex: 1 },
  retryText: { color: '#7c3aed', fontWeight: '600' },
  card: {
    backgroundColor: '#141428', borderRadius: radius.md || 12,
    padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: '#2a2a4a',
  },
  cardBest: { borderColor: '#7c3aed', borderWidth: 2 },
  bestBadge: {
    backgroundColor: '#7c3aed', color: '#fff',
    fontSize: 10, fontWeight: '800', letterSpacing: 1.5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
    alignSelf: 'flex-start', marginBottom: 8,
  },
  cardName: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 4 },
  cardDesc: { fontSize: 13, color: '#888', marginBottom: 12 },
  cardPrice: { fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 16 },
  cardPerGame: { fontSize: 14, fontWeight: '400', color: '#888' },
  buyBtn: {
    backgroundColor: '#7c3aed', borderRadius: 8,
    paddingVertical: 14, alignItems: 'center',
  },
  buyBtnDisabled: { backgroundColor: '#444' },
  buyBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  note: { fontSize: 11, color: '#555', textAlign: 'center', marginTop: 16, lineHeight: 16 },

  // Auth status
  authRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(52,211,153,0.1)', borderRadius: 8, padding: spacing.sm, marginBottom: spacing.md },
  authText: { fontSize: typography.sm, color: '#34d399' },
  authAction: { fontSize: typography.sm, color: colors.textMuted },
  loginNudge: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(124,58,237,0.1)', borderRadius: 8, padding: spacing.sm, marginBottom: spacing.md, borderWidth: 1, borderColor: 'rgba(124,58,237,0.3)' },
  loginNudgeText: { fontSize: typography.sm, color: '#a78bfa', flex: 1 },
  loginNudgeAction: { fontSize: typography.sm, color: '#7c3aed', fontWeight: '600', marginLeft: spacing.sm },
});
