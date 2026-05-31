import React, { useContext } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  SafeAreaView, StatusBar, Alert, Linking,
} from 'react-native';
import { AuthContext } from '../context/AuthContext';
import { APP_NAME } from '../config';
import { colors, typography, spacing, radius, shadows } from '../theme';

// ─── Menu items ───────────────────────────────────────────────────────────────

function buildMenuSections(navigation, user, logout) {
  return [
    {
      title: 'App',
      items: [
        {
          emoji: '💳',
          label: 'Subscription',
          description: user ? 'Manage your plan' : 'View pricing plans',
          onPress: () => navigation.navigate(user ? 'SubscriptionManagement' : 'Pricing'),
        },
        {
          emoji: '🔐',
          label: 'OAuth Settings',
          description: 'Connected accounts',
          onPress: () => navigation.navigate('OAuthSettings'),
        },
        {
          emoji: '📰',
          label: 'News Feed',
          description: 'Browse CMS content',
          onPress: () => navigation.navigate('Home'),
        },
      ],
    },
    {
      title: 'Resources',
      items: [
        {
          emoji: '📚',
          label: 'Documentation',
          description: 'alphinium.com/docs',
          onPress: () => Linking.openURL('https://alphinium.com/docs'),
        },
        {
          emoji: '🧩',
          label: 'Add-on Catalogue',
          description: 'Browse & install add-ons',
          onPress: () => navigation.navigate('Explore'),
        },
        {
          emoji: '🐛',
          label: 'Report an Issue',
          description: 'GitHub Issues',
          onPress: () => Linking.openURL('https://github.com/redsitesoftware/alphinium-app/issues'),
        },
      ],
    },
    user && {
      title: 'Account',
      items: [
        {
          emoji: '🚪',
          label: 'Sign Out',
          description: `Logged in as ${user.username || user.email}`,
          onPress: () => {
            Alert.alert('Sign Out', 'Are you sure?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign Out', style: 'destructive', onPress: logout },
            ]);
          },
          danger: true,
        },
      ],
    },
  ].filter(Boolean);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AccountScreen({ navigation }) {
  const { user, logout } = useContext(AuthContext) || {};

  const menuSections = buildMenuSections(navigation, user, logout);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile card ── */}
        {user ? (
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(user.username || user.email || 'U')[0].toUpperCase()}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user.username || 'User'}</Text>
              <Text style={styles.profileEmail}>{user.email}</Text>
              <View style={styles.planBadge}>
                <Text style={styles.planBadgeText}>✓ Free Plan</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.loginPrompt}>
            <Text style={styles.loginPromptEmoji}>👤</Text>
            <Text style={styles.loginPromptTitle}>Not signed in</Text>
            <Text style={styles.loginPromptSub}>
              Sign in to access your subscription, projects, and settings.
            </Text>
            <TouchableOpacity
              style={styles.loginBtn}
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.85}
            >
              <Text style={styles.loginBtnText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Menu sections ── */}
        {menuSections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionCard}>
              {section.items.map((item, i) => (
                <TouchableOpacity
                  key={item.label}
                  style={[
                    styles.menuItem,
                    i < section.items.length - 1 && styles.menuItemBorder,
                  ]}
                  onPress={item.onPress}
                  activeOpacity={0.75}
                >
                  <View style={styles.menuItemIcon}>
                    <Text style={styles.menuItemEmoji}>{item.emoji}</Text>
                  </View>
                  <View style={styles.menuItemText}>
                    <Text style={[styles.menuItemLabel, item.danger && styles.menuItemDanger]}>
                      {item.label}
                    </Text>
                    <Text style={styles.menuItemDesc}>{item.description}</Text>
                  </View>
                  <Text style={styles.menuItemChevron}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* ── App version ── */}
        <Text style={styles.version}>
          {APP_NAME} · v1.0.0 · alphinium forge template
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: spacing['3xl'] },

  // Profile
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xl,
    paddingTop: spacing['2xl'],
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: spacing.base,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.glow,
  },
  avatarText: {
    color: colors.white,
    fontSize: typography.xl,
    fontWeight: typography.heavy,
  },
  profileInfo: { flex: 1 },
  profileName: {
    color: colors.textPrimary,
    fontSize: typography.lg,
    fontWeight: typography.bold,
    marginBottom: 2,
  },
  profileEmail: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    marginBottom: spacing.sm,
  },
  planBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.successBg,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
  planBadgeText: {
    color: colors.success,
    fontSize: typography.xs,
    fontWeight: typography.semibold,
  },

  // Login prompt
  loginPrompt: {
    padding: spacing.xl,
    paddingTop: spacing['3xl'],
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  loginPromptEmoji: { fontSize: 48, marginBottom: spacing.md },
  loginPromptTitle: {
    color: colors.textPrimary,
    fontSize: typography.xl,
    fontWeight: typography.bold,
    marginBottom: spacing.sm,
  },
  loginPromptSub: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  loginBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
    ...shadows.glow,
  },
  loginBtnText: {
    color: colors.white,
    fontSize: typography.base,
    fontWeight: typography.bold,
  },

  // Sections
  section: { padding: spacing.xl, paddingBottom: 0 },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: typography.xs,
    fontWeight: typography.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    gap: spacing.md,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  menuItemIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemEmoji: { fontSize: 18 },
  menuItemText: { flex: 1 },
  menuItemLabel: {
    color: colors.textPrimary,
    fontSize: typography.base,
    fontWeight: typography.medium,
    marginBottom: 1,
  },
  menuItemDanger: { color: colors.error },
  menuItemDesc: {
    color: colors.textMuted,
    fontSize: typography.sm,
  },
  menuItemChevron: {
    color: colors.textMuted,
    fontSize: 22,
    lineHeight: 24,
  },

  version: {
    color: colors.textMuted,
    fontSize: typography.xs,
    textAlign: 'center',
    padding: spacing.xl,
    marginTop: spacing.md,
  },
});
