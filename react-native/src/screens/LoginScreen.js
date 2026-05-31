import React, { useState, useEffect, useContext } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator, Linking, Image,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { STRAPI_URL, APP_NAME } from '../config';
import { AuthContext } from '../context/AuthContext';
import { colors, typography, spacing, radius, shadows } from '../theme';

// Required for expo-web-browser redirect handling on native
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen({ navigation, onLoginSuccess, onClose }) {
  const { login } = useContext(AuthContext) || {};

  const [mode, setMode]           = useState('login');   // 'login' | 'register'
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [username, setUsername]   = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  // Handle deep link callback from /auth-popup on native (trivianight://auth?jwt=...)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const handleUrl = async ({ url }) => {
      if (!url || !url.startsWith('trivianight://auth')) return;
      try {
        const params = new URLSearchParams(url.split('?')[1] || '');
        const jwt = params.get('jwt');
        if (jwt) {
          setLoading(true);
          await login(jwt);
          onLoginSuccess?.();
          onClose?.();
          navigation?.goBack?.();
        }
      } catch (e) {
        setError('Login failed. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub.remove();
  }, [login, onLoginSuccess, onClose, navigation]);

  async function handleEmailAuth() {
    setError('');
    if (!email || !password) { setError('Email and password are required.'); return; }
    if (mode === 'register' && !username) { setError('Username is required.'); return; }
    setLoading(true);
    try {
      const endpoint = mode === 'register'
        ? `${STRAPI_URL}/api/auth/local/register`
        : `${STRAPI_URL}/api/auth/local`;
      const body = mode === 'register'
        ? { email, password, username }
        : { identifier: email, password };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error?.message || data?.message?.[0]?.messages?.[0]?.message || 'Authentication failed.';
        setError(msg);
        return;
      }
      await login(data.jwt);
      onLoginSuccess?.();
      onClose?.();
      navigation?.goBack?.();
    } catch (e) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleFacebook() {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof FB !== 'undefined') {
      // Web: use FB JS SDK popup — no redirect URI registration needed
      setLoading(true);
      setError('');
      window.FB.login(function(response) {
        if (response.authResponse && response.authResponse.accessToken) {
          const fbToken = response.authResponse.accessToken;
          fetch(`${STRAPI_URL}/api/auth/facebook/callback?access_token=${fbToken}`)
            .then(r => r.json())
            .then(async data => {
              if (data.jwt) {
                await login(data.jwt);
                onLoginSuccess?.();
                onClose?.();
              } else {
                setError(data?.error?.message || 'Facebook login failed.');
              }
            })
            .catch(() => setError('Network error. Please try again.'))
            .finally(() => setLoading(false));
        } else {
          setLoading(false);
          if (response.status !== 'unknown') setError('Facebook login cancelled.');
        }
      }, { scope: 'email,public_profile' });
    } else {
      // Native (iOS/Android): open /auth-popup in system browser
      // The page uses FB JS SDK and redirects back via trivianight://auth?jwt=...
      const popupUrl = 'https://trivia.user-pods.alphinium.io/auth-popup';
      setLoading(true);
      setError('');
      WebBrowser.openAuthSessionAsync(popupUrl, 'trivianight://auth')
        .then((result) => {
          if (result.type === 'success' && result.url) {
            // Deep link handler (useEffect above) processes the JWT
            Linking.openURL(result.url).catch(() => {});
          } else if (result.type === 'cancel' || result.type === 'dismiss') {
            setLoading(false);
          }
        })
        .catch(() => { setLoading(false); setError('Could not open browser.'); });
    }
  }

  function handleGoogle() {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Web: redirect directly to Strapi Google OAuth
      const redirectUrl = `${window.location.origin}/auth/callback`;
      window.location.href = `${STRAPI_URL}/api/connect/google?redirect=${encodeURIComponent(redirectUrl)}`;
    } else {
      // Native (iOS/Android): open /auth-popup in system browser
      // The page redirects to Strapi OAuth and back via trivianight://auth?jwt=...
      const popupUrl = 'https://trivia.user-pods.alphinium.io/auth-popup';
      setLoading(true);
      setError('');
      WebBrowser.openAuthSessionAsync(popupUrl, 'trivianight://auth')
        .then((result) => {
          if (result.type === 'success' && result.url) {
            // Deep link handler (useEffect above) processes the JWT
            Linking.openURL(result.url).catch(() => {});
          } else if (result.type === 'cancel' || result.type === 'dismiss') {
            setLoading(false);
          }
        })
        .catch(() => { setLoading(false); setError('Could not open browser.'); });
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.container}>
          {onClose && (
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          )}
          {!onClose && navigation?.canGoBack?.() && (
            <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
              <Text style={styles.backText}>‹ Back</Text>
            </TouchableOpacity>
          )}

          {/* Branding */}
          <View style={styles.brand}>
            <Image
              source={require('../assets/logo-transparent.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.appName}>{APP_NAME}</Text>
            <Text style={styles.tagline}>{mode === 'register' ? 'Create your account' : 'Sign in to save credits'}</Text>
          </View>

          {/* Social buttons */}
          <TouchableOpacity style={styles.facebookBtn} onPress={handleFacebook} activeOpacity={0.85}>
            <Text style={styles.facebookEmoji}>📘</Text>
            <Text style={styles.facebookLabel}>Continue with Facebook</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.googleBtn} onPress={handleGoogle} activeOpacity={0.85}>
            <Text style={styles.googleEmoji}>🔵</Text>
            <Text style={styles.googleLabel}>Continue with Google</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Mode toggle */}
          <View style={styles.modeRow}>
            <TouchableOpacity onPress={() => { setMode('login'); setError(''); }} style={[styles.modeTab, mode === 'login' && styles.modeTabActive]}>
              <Text style={[styles.modeTabText, mode === 'login' && styles.modeTabTextActive]}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setMode('register'); setError(''); }} style={[styles.modeTab, mode === 'register' && styles.modeTabActive]}>
              <Text style={[styles.modeTabText, mode === 'register' && styles.modeTabTextActive]}>Register</Text>
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {mode === 'register' && (
              <TextInput
                style={styles.input}
                placeholder="Username"
                placeholderTextColor={colors.textMuted}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity style={styles.submitBtn} onPress={handleEmailAuth} activeOpacity={0.85} disabled={loading}>
              {loading
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.submitLabel}>{mode === 'register' ? 'Create Account' : 'Sign In'}</Text>
              }
            </TouchableOpacity>
          </View>

          <Text style={styles.terms}>
            By signing in you agree to our Terms of Service and Privacy Policy.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: spacing.xl, paddingVertical: spacing['2xl'], justifyContent: 'center' },
  closeBtn: { position: 'absolute', top: spacing.xl, right: spacing.xl, padding: spacing.sm },
  closeText: { color: colors.textMuted, fontSize: 20, fontWeight: '600' },
  back: { position: 'absolute', top: spacing.xl, left: spacing.xl },
  backText: { color: colors.primary, fontSize: typography.base, fontWeight: typography.semibold },

  brand: { alignItems: 'center', marginBottom: spacing['2xl'] },
  logoImage: { width: 80, height: 80, marginBottom: spacing.base },
  appName: { color: colors.textPrimary, fontSize: typography['2xl'], fontWeight: typography.heavy, marginBottom: spacing.xs },
  tagline: { color: colors.textSecondary, fontSize: typography.base },

  facebookBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.base, borderRadius: radius.lg, backgroundColor: '#1877F2', ...shadows.sm, marginBottom: spacing.sm },
  facebookEmoji: { fontSize: 20 },
  facebookLabel: { color: colors.white, fontSize: typography.base, fontWeight: typography.semibold },

  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.base, borderRadius: radius.lg, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#dadce0', ...shadows.sm, marginBottom: spacing.md },
  googleEmoji: { fontSize: 20 },
  googleLabel: { color: '#3c4043', fontSize: typography.base, fontWeight: typography.semibold },

  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.md, gap: spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.divider },
  dividerText: { color: colors.textMuted, fontSize: typography.sm },

  modeRow: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: spacing.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.surfaceBorder },
  modeTab: { flex: 1, padding: spacing.sm, alignItems: 'center' },
  modeTabActive: { backgroundColor: colors.primary },
  modeTabText: { color: colors.textMuted, fontWeight: typography.medium },
  modeTabTextActive: { color: colors.white, fontWeight: typography.semibold },

  form: { gap: spacing.md },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: radius.md, padding: spacing.base, color: colors.textPrimary, fontSize: typography.base },
  errorText: { color: colors.error, fontSize: typography.sm, textAlign: 'center' },
  submitBtn: { backgroundColor: colors.primary, padding: spacing.base, borderRadius: radius.lg, alignItems: 'center', ...shadows.glow },
  submitLabel: { color: colors.white, fontSize: typography.base, fontWeight: typography.semibold },

  terms: { color: colors.textMuted, fontSize: typography.xs, textAlign: 'center', marginTop: spacing.xl, lineHeight: 18 },
});
