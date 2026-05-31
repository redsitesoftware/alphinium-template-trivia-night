/**
 * HomeScreen — Create room / Join room
 * Mirrors web client: host enters name → creates room
 *                     player enters name + code → joins room
 */

import React, { useState, useEffect, useContext } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGame } from '../context/GameContext';
import { AuthContext } from '../context/AuthContext';
import { useGameStats } from '../hooks/useGameStats';
import { colors, typography, spacing, radius } from '../theme';
import { ConnectionState } from '../services/websocket';
import { APP_NAME, WS_URL, getWebBaseUrl } from '../config';
import AppFooter from '../components/AppFooter';
import LoginScreen from './LoginScreen';
import { stripeService } from '../services/stripe';

const TABS = ['Create', 'Join'];

// Module-level flag: welcome audio plays at most once per page/session load,
// regardless of how many times HomeScreen remounts (e.g. due to nav.reset() between questions).
let _welcomePlayedThisSession = false;

const DIFFICULTY_EMOJI = { easy: '😊', medium: '🧠', hard: '🔥' };

function getApiBase() {
  const base = getWebBaseUrl();
  if (base) return base;
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return '';
}

const ADMIN_NAMES = ['Dan Woods'];
const SETTINGS_KEY = 'trivia_host_settings';

export default function HomeScreen() {
  const { state, connect, send, disconnect } = useGame();
  const { login, user, logout } = useContext(AuthContext) || {};
  const { stats } = useGameStats();
  const [activeTab, setActiveTab] = useState('Join');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [publicRooms, setPublicRooms] = useState([]);
  const [creditsBanner, setCreditsBanner] = useState(false);
  const [authBanner, setAuthBanner] = useState('');

  const isConnecting = state.connectionState === ConnectionState.CONNECTING;
  const userFullName = user
    ? `${user.firstname || ''}${user.lastname ? ' ' + user.lastname : ''}`.trim() || user.username || null
    : null;
  const isAdminLocally = userFullName && ADMIN_NAMES.some(n => n.toLowerCase() === userFullName.toLowerCase());

  // Auto-open Host tab for admins and paid users (if no ?join= param in URL)
  useEffect(() => {
    if (!user) return;
    // Don't override if URL has a join code
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('join')) return;
    }
    if (isAdminLocally) { setActiveTab('Create'); return; }
    const userId = user?.id ? String(user.id) : null;
    if (!userId) return;
    stripeService.getCreditBalance(userId)
      .then(data => { if ((data?.balance ?? 0) > 0) setActiveTab('Create'); })
      .catch(() => {});
  }, [user?.id, isAdminLocally]);

  // Fetch public rooms on mount and every 10s
  useEffect(() => {
    const apiBase = getApiBase();
    if (!apiBase) return;
    function fetchPublic() {
      fetch(`${apiBase}/api/rooms/public`)
        .then((r) => r.json())
        .then((data) => Array.isArray(data) && setPublicRooms(data))
        .catch(() => {});
    }
    fetchPublic();
    const interval = setInterval(fetchPublic, 10000);
    return () => clearInterval(interval);
  }, []);

  // Pre-fill name from logged-in user (e.g. after Facebook OAuth)
  useEffect(() => {
    if (user && !name.trim()) {
      const displayName = user.firstname
        ? `${user.firstname}${user.lastname ? ' ' + user.lastname : ''}`.trim()
        : user.username || '';
      if (displayName) setName(displayName);
    }
  }, [user]);

  // Play personalized welcome message using TTS
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (_welcomePlayedThisSession) return;
    
    _welcomePlayedThisSession = true;
    
    // Check if user has been here before
    const hasVisitedBefore = localStorage.getItem('trivia_has_visited') === 'true';
    const userName = userFullName || name.trim();
    
    // Mark as visited
    localStorage.setItem('trivia_has_visited', 'true');
    
    // Check if voice is muted
    const muted = localStorage.getItem('trivia_voice_muted') === 'true';
    if (muted) return;
    
    // Import ttsPlayer dynamically to avoid issues
    import('../services/ttsPlayer').then(({ default: ttsPlayer }) => {
      setTimeout(() => {
        let greeting;
        if (hasVisitedBefore && userName) {
          greeting = `Welcome back, ${userName}! Ready for some trivia?`;
        } else if (userName) {
          greeting = `Welcome, ${userName}! Let's play some trivia.`;
        } else if (hasVisitedBefore) {
          greeting = `Welcome back! Ready for another trivia night?`;
        } else {
          const greetings = [
            "Welcome to Trivia Night! Let's test your knowledge.",
            "Hey there! Ready for some trivia fun?",
            "Welcome! Think you've got what it takes?",
            "Let's play! Trivia Night starts now."
          ];
          greeting = greetings[Math.floor(Math.random() * greetings.length)];
        }
        
        // Use TTS to play greeting (requires voice to be enabled and unlocked)
        ttsPlayer.playStatic(greeting, false, 'nPczCjzI2devNBz1zQrb', true); // Brian voice, dynamic=true
      }, 800); // Short delay to let page settle
    }).catch(() => {
      // Fallback: silent if TTS fails to load
    });
  }, [user, userFullName, name]);

  // On web: read ?join=CODE from URL and pre-fill the join tab
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join');
    if (joinCode && joinCode.length === 6) {
      setCode(joinCode.toUpperCase());
      setActiveTab('Join');
      // Clean the URL so refreshing doesn't re-trigger
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
    }
    if (params.get('credits') === 'success') {
      setCreditsBanner(true);
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => setCreditsBanner(false), 5000);
    }
    // OAuth callback: ?access_token=xxx (Facebook, Google via Strapi)
    const oauthToken = params.get('access_token');
    if (oauthToken) {
      window.history.replaceState({}, '', window.location.pathname);
      login?.(oauthToken)
        .then(() => { setAuthBanner('✅ Signed in!'); setTimeout(() => setAuthBanner(''), 4000); })
        .catch(() => { setAuthBanner('⚠️ Sign-in failed — try email/password'); setTimeout(() => setAuthBanner(''), 5000); });
    }
  }, []);

  async function handleCreate() {
    if (!name.trim()) { setFormError('Please enter your name before creating a room.'); return; }
    if (!WS_URL) { setFormError('Config missing: EXPO_PUBLIC_WS_URL not set.'); return; }
    setFormError('');
    setLoading(true);
    try {
      disconnect();
      await connect();
      send({ type: 'create_room', name: name.trim(), adsEnabled: true });
    } catch (e) {
      setFormError(`Connection failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    const trimCode = code.trim().toUpperCase();
    if (!name.trim()) { setFormError('Please enter your name before joining.'); return; }
    if (!trimCode || trimCode.length !== 6) { setFormError('Enter a valid 6-character room code.'); return; }
    if (!WS_URL) { setFormError('Config missing: EXPO_PUBLIC_WS_URL not set.'); return; }
    setFormError('');
    setLoading(true);
    try {
      disconnect();
      await connect();
      send({ type: 'join_room', code: trimCode, name: name.trim() });
    } catch (e) {
      setFormError(`Connection failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinPublic(roomCode) {
    if (!name.trim()) {
      setFormError('Enter your name above, then tap a room to join.');
      return;
    }
    if (!WS_URL) { setFormError('Config missing: EXPO_PUBLIC_WS_URL not set.'); return; }
    setFormError('');
    setLoading(true);
    setCode(roomCode);
    try {
      disconnect();
      await connect();
      send({ type: 'join_room', code: roomCode, name: name.trim() });
    } catch (e) {
      setFormError(`Connection failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  const busy = loading || isConnecting;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        {creditsBanner && (
          <View style={styles.creditsBanner}>
            <Text style={styles.creditsBannerText}>🎮 Credits added! Your balance has been updated.</Text>
          </View>
        )}
        {authBanner ? (
          <View style={[styles.creditsBanner, { backgroundColor: authBanner.startsWith('✅') ? 'rgba(52,211,153,0.15)' : 'rgba(239,68,68,0.15)' }]}>
            <Text style={[styles.creditsBannerText, { color: authBanner.startsWith('✅') ? '#34d399' : '#f87171' }]}>{authBanner}</Text>
          </View>
        ) : null}
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <Image
              source={require('../assets/logo-transparent.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.title}>{APP_NAME}</Text>
            <Text style={styles.subtitle}>Multiplayer trivia for everyone</Text>

            {/* Stats row — shown when user has played at least one game */}
            {stats.gamesPlayed > 0 && (
              <View style={styles.statsRow}>
                <View style={styles.statPill}>
                  <Text style={styles.statValue}>{stats.gamesPlayed}</Text>
                  <Text style={styles.statLabel}>Games</Text>
                </View>
                <View style={[styles.statPill, styles.statPillAccent]}>
                  <Text style={[styles.statValue, styles.statValueAccent]}>{stats.bestScore}</Text>
                  <Text style={styles.statLabel}>Best</Text>
                </View>
                <View style={styles.statPill}>
                  <Text style={styles.statValue}>{stats.wins}</Text>
                  <Text style={styles.statLabel}>Wins</Text>
                </View>
              </View>
            )}
          </View>

          {/* Tab switcher */}
          <View style={styles.tabRow}>
            {TABS.map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
                  {tab === 'Create' ? '👑 Host' : '🎮 Join'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Card */}
          <View style={styles.card}>
            {(state.error || formError) ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>⚠️ {formError || state.error}</Text>
              </View>
            ) : null}

            <Text style={styles.label}>Your name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Alex"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={(v) => { setName(v); if (formError) setFormError(''); }}
              autoCorrect={false}
              maxLength={20}
              returnKeyType="next"
            />

            {/* Auth row — sign in nudge or logged-in indicator */}
            {user ? (
              <View style={styles.authRow}>
                <View style={styles.authRowLeft}>
                  <Text style={styles.authRowAvatar}>
                    {(user.firstname || user.username || '?')[0].toUpperCase()}
                  </Text>
                  <View>
                    <Text style={styles.authRowName}>{user.firstname || user.username}</Text>
                    <Text style={styles.authRowSub}>Signed in · scores saved</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={logout}>
                  <Text style={styles.authRowLink}>Sign out</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.signInBanner} onPress={() => setShowLogin(true)} activeOpacity={0.85}>
                <View style={styles.signInBannerLeft}>
                  <Text style={styles.signInBannerIcon}>📘</Text>
                  <View>
                    <Text style={styles.signInBannerTitle}>Sign in to play</Text>
                    <Text style={styles.signInBannerSub}>Save scores · compete on leaderboards · earn badges</Text>
                  </View>
                </View>
                <Text style={styles.signInBannerCta}>Sign in →</Text>
              </TouchableOpacity>
            )}

            {activeTab === 'Join' && (
              <>
                <Text style={styles.label}>Room code</Text>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  placeholder="ABC123"
                  placeholderTextColor={colors.textMuted}
                  value={code}
                  onChangeText={(v) => setCode(v.toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={6}
                  returnKeyType="go"
                  onSubmitEditing={handleJoin}
                />
              </>
            )}

            <TouchableOpacity
              style={[styles.btn, busy && styles.btnDisabled]}
              onPress={activeTab === 'Create' ? handleCreate : handleJoin}
              disabled={busy}
              activeOpacity={0.8}
            >
              {busy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.btnText}>
                  {activeTab === 'Create' ? 'Create Room' : 'Join Room'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {!WS_URL && (
            <View style={styles.configWarning}>
              <Text style={styles.configWarningText}>
                ⚠️ EXPO_PUBLIC_WS_URL not set.{'\n'}
                Add it to react-native/.env to connect to your server.
              </Text>
            </View>
          )}

          {/* Public rooms */}
          {publicRooms.length > 0 && (
            <View style={styles.publicSection}>
              <Text style={styles.publicSectionTitle}>🌐 Open Rooms</Text>
              {publicRooms.map((room) => (
                <TouchableOpacity
                  key={room.code}
                  style={styles.publicRoomCard}
                  onPress={() => handleJoinPublic(room.code)}
                  activeOpacity={0.8}
                >
                  <View style={styles.publicRoomLeft}>
                    <Text style={styles.publicRoomSubject}>
                      {room.subject || 'General Knowledge'}
                    </Text>
                    <Text style={styles.publicRoomMeta}>
                      {DIFFICULTY_EMOJI[room.difficulty] || '🧠'} {room.difficulty}
                      {'  ·  '}👥 {room.playerCount} player{room.playerCount !== 1 ? 's' : ''}
                      {'  ·  '}hosted by {room.hostName}
                    </Text>
                  </View>
                  <View style={styles.publicJoinBadge}>
                    <Text style={styles.publicJoinText}>Join</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <AppFooter style={styles.footer} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Login modal */}
      <Modal visible={showLogin} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowLogin(false)}>
        <LoginScreen onClose={() => setShowLogin(false)} onLoginSuccess={() => setShowLogin(false)} />
      </Modal>
      
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    ...Platform.select({ web: { height: '100vh', overflow: 'hidden' } }),
  },
  flex: { flex: 1, minHeight: 0 },
  scroll: { flexGrow: 1, padding: spacing.lg, justifyContent: 'center' },

  header: { alignItems: 'center', marginBottom: spacing.xl },
  logoImage: {
    width: 100,
    height: 100,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typography.xxxl,
    fontWeight: typography.heavy,
    color: colors.textPrimary,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: typography.base,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },

  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  statPill: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    minWidth: 64,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  statPillAccent: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(108,99,255,0.12)',
  },
  statValue: {
    fontSize: typography.lg,
    fontWeight: typography.heavy,
    color: colors.textPrimary,
  },
  statValueAccent: { color: colors.primary },
  statLabel: {
    fontSize: typography.xs,
    color: colors.textMuted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 4,
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.primary },
  tabLabel: { fontSize: typography.base, fontWeight: typography.semibold, color: colors.textMuted },
  tabLabelActive: { color: colors.white },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },

  errorBanner: {
    backgroundColor: colors.errorBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  errorText: { color: colors.error, fontSize: typography.sm, fontWeight: typography.medium },

  creditsBanner: {
    backgroundColor: 'rgba(124,58,237,0.15)',
    borderBottomWidth: 1,
    borderBottomColor: '#7c3aed',
    padding: spacing.md,
    alignItems: 'center',
  },
  creditsBannerText: {
    color: '#a78bfa',
    fontSize: typography.sm,
    fontWeight: '600',
  },

  label: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    color: colors.textPrimary,
    fontSize: typography.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  authRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(24,119,242,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(24,119,242,0.2)',
  },
  signInBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(24,119,242,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(24,119,242,0.4)',
  },
  signInBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  signInBannerIcon: { fontSize: 26 },
  signInBannerTitle: { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary },
  signInBannerSub: { fontSize: typography.xs, color: colors.textMuted, marginTop: 2 },
  signInBannerCta: { fontSize: typography.sm, fontWeight: typography.bold, color: '#1877F2', marginLeft: spacing.sm },
  authRowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  authRowAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    color: colors.white,
    fontSize: typography.md,
    fontWeight: typography.bold,
    textAlign: 'center',
    lineHeight: 34,
    overflow: 'hidden',
  },
  authRowName: { fontSize: typography.sm, fontWeight: typography.semibold, color: colors.textPrimary },
  authRowSub: { fontSize: typography.xs, color: colors.textMuted },
  authRowText: { fontSize: typography.sm, color: colors.textSecondary, flex: 1 },
  authRowLink: { fontSize: typography.sm, color: '#1877F2', fontWeight: typography.semibold, marginLeft: spacing.sm },
  codeInput: {
    letterSpacing: 8,
    textAlign: 'center',
    fontSize: typography.xl,
    fontWeight: typography.bold,
  },

  btn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: colors.white, fontSize: typography.md, fontWeight: typography.bold },

  configWarning: {
    marginTop: spacing.lg,
    backgroundColor: colors.warningBg,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  configWarningText: { color: colors.warning, fontSize: typography.sm, textAlign: 'center', lineHeight: 20 },

  publicSection: { marginTop: spacing.xl },
  publicSectionTitle: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  publicRoomCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  publicRoomLeft: { flex: 1 },
  publicRoomSubject: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  publicRoomMeta: {
    fontSize: typography.xs,
    color: colors.textMuted,
  },
  publicJoinBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  publicJoinText: {
    color: colors.white,
    fontSize: typography.sm,
    fontWeight: typography.bold,
  },

  footer: { marginTop: spacing.lg },
});
