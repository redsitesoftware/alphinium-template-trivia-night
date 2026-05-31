import React, { useContext, useState } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  SafeAreaView, StatusBar, Linking,
} from 'react-native';
import { AuthContext } from '../context/AuthContext';
import { APP_NAME } from '../config';
import { colors, typography, spacing, radius, shadows } from '../theme';

// ─── Quick Action Cards ───────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  {
    emoji: '🔐',
    label: 'Auth',
    description: 'Login & sessions',
    color: colors.primary,
    bg: 'rgba(108, 99, 255, 0.12)',
    screen: 'Login',
  },
  {
    emoji: '💳',
    label: 'Payments',
    description: 'Stripe billing',
    color: colors.success,
    bg: colors.successBg,
    screen: 'Pricing',
  },
  {
    emoji: '📰',
    label: 'CMS',
    description: 'Content feed',
    color: colors.info,
    bg: colors.infoBg,
    screen: 'Home',
  },
  {
    emoji: '🧩',
    label: 'Add-ons',
    description: 'Extend your app',
    color: colors.warning,
    bg: colors.warningBg,
    screen: 'Explore',
    tab: true,
  },
];

// ─── Feature Highlights ───────────────────────────────────────────────────────

const FEATURES = [
  {
    emoji: '⚡',
    title: 'Built with Expo + React Native',
    body: 'Ships to iOS, Android, and web from a single codebase.',
    color: colors.primary,
  },
  {
    emoji: '🔐',
    title: 'Auth out of the box',
    body: 'GitHub, Google, and email login via OAuth — no backend code required.',
    color: colors.accent,
  },
  {
    emoji: '💳',
    title: 'Stripe payments included',
    body: 'Subscriptions, one-time charges, and billing portal — ready to go.',
    color: colors.success,
  },
  {
    emoji: '🚀',
    title: 'alphinium forge build',
    body: 'One CLI command triggers a full iOS + Android build via the Mac agent.',
    color: colors.warning,
  },
  {
    emoji: '🧩',
    title: 'Add-on ecosystem',
    body: 'Install alphinium-ai, alphinium-maps, alphinium-analytics and more via forge.',
    color: colors.info,
  },
  {
    emoji: '📦',
    title: 'Forked per project',
    body: 'Every Alphinium project gets its own repo, bundle ID, and build pipeline.',
    color: colors.addonAI,
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardScreen({ navigation }) {
  const { user } = useContext(AuthContext) || {};
  const [expandedFeature, setExpandedFeature] = useState(null);

  const greeting = user?.username
    ? `Hey, ${user.username} 👋`
    : `Welcome to ${APP_NAME} 👋`;

  function handleQuickAction(action) {
    if (action.tab) {
      navigation.navigate('Explore');
    } else {
      navigation.navigate(action.screen);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Banner ── */}
        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>🛠  FORGE TEMPLATE</Text>
          </View>
          <Text style={styles.heroGreeting}>{greeting}</Text>
          <Text style={styles.heroSub}>
            Your app is live. Explore the built-in features below, or install add-ons to extend it.
          </Text>
          <View style={styles.heroStats}>
            <Stat label="Platform" value="iOS + Android" />
            <View style={styles.statDivider} />
            <Stat label="Stack" value="Expo 52 · RN 0.76" />
            <View style={styles.statDivider} />
            <Stat label="Build" value="forge build" />
          </View>
        </View>

        {/* ── Quick Actions ── */}
        <Section title="Quick Access">
          <View style={styles.quickGrid}>
            {QUICK_ACTIONS.map((action) => (
              <TouchableOpacity
                key={action.label}
                style={[styles.quickCard, { backgroundColor: action.bg, borderColor: action.color + '30' }]}
                onPress={() => handleQuickAction(action)}
                activeOpacity={0.75}
              >
                <Text style={styles.quickEmoji}>{action.emoji}</Text>
                <Text style={[styles.quickLabel, { color: action.color }]}>{action.label}</Text>
                <Text style={styles.quickDesc}>{action.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        {/* ── What's included ── */}
        <Section title="What's included">
          {FEATURES.map((feature, i) => (
            <TouchableOpacity
              key={feature.title}
              style={styles.featureRow}
              onPress={() => setExpandedFeature(expandedFeature === i ? null : i)}
              activeOpacity={0.8}
            >
              <View style={[styles.featureIcon, { backgroundColor: feature.color + '18' }]}>
                <Text style={styles.featureEmoji}>{feature.emoji}</Text>
              </View>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                {expandedFeature === i && (
                  <Text style={styles.featureBody}>{feature.body}</Text>
                )}
              </View>
              <Text style={styles.featureChevron}>{expandedFeature === i ? '▲' : '▼'}</Text>
            </TouchableOpacity>
          ))}
        </Section>

        {/* ── Get started CTA ── */}
        <View style={styles.cta}>
          <Text style={styles.ctaTitle}>Ready to customise?</Text>
          <Text style={styles.ctaSub}>
            Fork this template, set your bundle ID, and run{' '}
            <Text style={styles.ctaCode}>alphinium forge build ios</Text>
          </Text>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => Linking.openURL('https://alphinium.com/docs')}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaButtonText}>Read the Docs →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing['3xl'],
  },

  // Hero
  hero: {
    padding: spacing.xl,
    paddingTop: spacing['2xl'],
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(108,99,255,0.15)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.3)',
  },
  heroBadgeText: {
    color: colors.primary,
    fontSize: typography.xs,
    fontWeight: typography.bold,
    letterSpacing: 1,
  },
  heroGreeting: {
    color: colors.textPrimary,
    fontSize: typography['2xl'],
    fontWeight: typography.heavy,
    marginBottom: spacing.sm,
  },
  heroSub: {
    color: colors.textSecondary,
    fontSize: typography.base,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    marginBottom: 2,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: typography.xs,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.surfaceBorder,
  },

  // Quick grid
  section: {
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontWeight: typography.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.base,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  quickCard: {
    width: '47%',
    borderRadius: radius.lg,
    padding: spacing.base,
    borderWidth: 1,
  },
  quickEmoji: {
    fontSize: 28,
    marginBottom: spacing.sm,
  },
  quickLabel: {
    fontSize: typography.md,
    fontWeight: typography.bold,
    marginBottom: 2,
  },
  quickDesc: {
    color: colors.textMuted,
    fontSize: typography.xs,
  },

  // Features
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: spacing.md,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureEmoji: {
    fontSize: 20,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    color: colors.textPrimary,
    fontSize: typography.base,
    fontWeight: typography.semibold,
    paddingTop: 10,
  },
  featureBody: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  featureChevron: {
    color: colors.textMuted,
    fontSize: 10,
    paddingTop: 14,
  },

  // CTA
  cta: {
    margin: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.3)',
    alignItems: 'center',
    ...shadows.md,
  },
  ctaTitle: {
    color: colors.textPrimary,
    fontSize: typography.xl,
    fontWeight: typography.heavy,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  ctaSub: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  ctaCode: {
    color: colors.accent,
    fontFamily: 'monospace',
    backgroundColor: 'rgba(0,212,170,0.1)',
  },
  ctaButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    ...shadows.glow,
  },
  ctaButtonText: {
    color: colors.white,
    fontSize: typography.base,
    fontWeight: typography.bold,
  },
});
