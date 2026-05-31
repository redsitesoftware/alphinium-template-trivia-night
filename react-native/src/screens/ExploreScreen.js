import React, { useState } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  SafeAreaView, StatusBar, Linking, TextInput,
} from 'react-native';
import { colors, typography, spacing, radius, shadows } from '../theme';

// ─── Addon Catalogue ─────────────────────────────────────────────────────────

const ADDON_CATEGORIES = [
  {
    id: 'intelligence',
    title: '🤖 Intelligence',
    color: colors.addonAI,
    bg: colors.addonAIBg,
    addons: [
      {
        id: 'alphinium-ai',
        name: 'alphinium-ai',
        tagline: 'AI Chat & Assistant',
        description: 'Embed a GPT-4/Claude-powered assistant into your app. Supports streaming, function calling, and custom system prompts.',
        status: 'available',
        badge: 'NEW',
        docsUrl: 'https://github.com/redsitesoftware/alphinium-ai',
      },
      {
        id: 'alphinium-vision',
        name: 'alphinium-vision',
        tagline: 'Image Recognition & OCR',
        description: 'Scan documents, read barcodes, classify images, and extract text using Google Vision and OpenAI.',
        status: 'coming_soon',
        docsUrl: 'https://github.com/redsitesoftware/alphinium-vision',
      },
    ],
  },
  {
    id: 'data',
    title: '📊 Data & Analytics',
    color: colors.addonData,
    bg: colors.addonDataBg,
    addons: [
      {
        id: 'alphinium-analytics',
        name: 'alphinium-analytics',
        tagline: 'In-App Analytics Dashboard',
        description: 'Track user behaviour, screen views, events, and funnels. Integrates with Mixpanel, Amplitude, or your own backend.',
        status: 'available',
        badge: 'NEW',
        docsUrl: 'https://github.com/redsitesoftware/alphinium-analytics',
      },
      {
        id: 'alphinium-news',
        name: 'alphinium-news',
        tagline: 'News & Articles Feed',
        description: 'Fetch and display news articles from your CMS. Includes feed, cards, and article detail modal.',
        status: 'installed',
        docsUrl: 'https://github.com/redsitesoftware/alphinium-news',
      },
      {
        id: 'alphinium-maps',
        name: 'alphinium-maps',
        tagline: 'Interactive Maps',
        description: 'Embed interactive maps with markers, routes, and location search. Powered by Google Maps and Mapbox.',
        status: 'available',
        docsUrl: 'https://github.com/redsitesoftware/alphinium-maps',
      },
      {
        id: 'alphinium-weather',
        name: 'alphinium-weather',
        tagline: 'Weather Data & Widgets',
        description: 'Real-time weather data, forecasts, and beautiful weather widgets for any location.',
        status: 'available',
        docsUrl: 'https://github.com/redsitesoftware/alphinium-weather',
      },
    ],
  },
  {
    id: 'social',
    title: '💬 Social & Communication',
    color: colors.addonComm,
    bg: colors.addonCommBg,
    addons: [
      {
        id: 'alphinium-social',
        name: 'alphinium-social',
        tagline: 'Social Feed & Profiles',
        description: 'Add a Twitter/Instagram-style feed with likes, comments, follows, and user profiles.',
        status: 'available',
        badge: 'NEW',
        docsUrl: 'https://github.com/redsitesoftware/alphinium-social',
      },
      {
        id: 'alphinium-notifications',
        name: 'alphinium-notifications',
        tagline: 'Push Notifications',
        description: 'Universal notification system — push, in-app, and email. Event-driven with a clean subscription API.',
        status: 'available',
        docsUrl: 'https://github.com/redsitesoftware/alphinium-notifications',
      },
      {
        id: 'alphinium-chat',
        name: 'alphinium-chat',
        tagline: 'Real-time Chat',
        description: 'In-app messaging with threads, channels, reactions, and typing indicators via WebSockets.',
        status: 'coming_soon',
        docsUrl: 'https://github.com/redsitesoftware/alphinium-chat',
      },
    ],
  },
  {
    id: 'infrastructure',
    title: '⚙️ Infrastructure',
    color: colors.addonInfra,
    bg: colors.addonInfraBg,
    addons: [
      {
        id: 'alphinium-auth',
        name: 'alphinium-auth',
        tagline: 'Enhanced Auth & SSO',
        description: 'Add Apple Sign-In, SAML SSO, MFA, and magic links on top of the built-in OAuth.',
        status: 'available',
        badge: 'NEW',
        docsUrl: 'https://github.com/redsitesoftware/alphinium-auth',
      },
      {
        id: 'alphinium-storage',
        name: 'alphinium-storage',
        tagline: 'File Upload & Storage',
        description: 'S3-compatible file upload, image resizing, and a media library UI. Works with GCS, S3, and Cloudflare R2.',
        status: 'available',
        badge: 'NEW',
        docsUrl: 'https://github.com/redsitesoftware/alphinium-storage',
      },
      {
        id: 'alphinium-traffic',
        name: 'alphinium-traffic',
        tagline: 'Traffic Intelligence',
        description: 'Live traffic data, incident reports, and route optimisation for web and mobile.',
        status: 'available',
        docsUrl: 'https://github.com/redsitesoftware/alphinium-traffic',
      },
    ],
  },
];

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  installed: { label: 'Installed', color: colors.success, bg: colors.successBg, icon: '✓' },
  available: { label: 'Available', color: colors.info, bg: colors.infoBg, icon: '↓' },
  coming_soon: { label: 'Coming Soon', color: colors.textMuted, bg: colors.surface, icon: '⏳' },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExploreScreen({ navigation }) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});

  const toggleExpand = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const filteredCategories = ADDON_CATEGORIES.map((cat) => ({
    ...cat,
    addons: cat.addons.filter(
      (a) =>
        !search ||
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.tagline.toLowerCase().includes(search.toLowerCase()),
    ),
  })).filter((cat) => cat.addons.length > 0);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Add-ons</Text>
          <Text style={styles.headerSub}>
            Extend your app with pre-built modules. Install via{' '}
            <Text style={styles.mono}>alphinium forge addon install</Text>
          </Text>
        </View>

        {/* ── Search ── */}
        <View style={styles.searchRow}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search add-ons..."
            placeholderTextColor={colors.textMuted}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={styles.searchClear}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ── Categories ── */}
        {filteredCategories.map((cat) => (
          <View key={cat.id} style={styles.category}>
            <Text style={[styles.categoryTitle, { color: cat.color }]}>{cat.title}</Text>
            {cat.addons.map((addon) => (
              <AddonCard
                key={addon.id}
                addon={addon}
                isExpanded={!!expanded[addon.id]}
                onToggle={() => toggleExpand(addon.id)}
                catColor={cat.color}
              />
            ))}
          </View>
        ))}

        {/* ── Footer note ── */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            More add-ons at{' '}
            <Text
              style={styles.footerLink}
              onPress={() => Linking.openURL('https://alphinium.com/addons')}
            >
              alphinium.com/addons
            </Text>
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── AddonCard ────────────────────────────────────────────────────────────────

function AddonCard({ addon, isExpanded, onToggle, catColor }) {
  const status = STATUS_CONFIG[addon.status] || STATUS_CONFIG.available;

  return (
    <TouchableOpacity
      style={styles.addonCard}
      onPress={onToggle}
      activeOpacity={0.8}
    >
      <View style={styles.addonHeader}>
        <View style={styles.addonMeta}>
          <View style={styles.addonNameRow}>
            <Text style={styles.addonName}>{addon.name}</Text>
            {addon.badge && (
              <View style={styles.addonBadge}>
                <Text style={styles.addonBadgeText}>{addon.badge}</Text>
              </View>
            )}
          </View>
          <Text style={styles.addonTagline}>{addon.tagline}</Text>
        </View>
        <View style={[styles.addonStatus, { backgroundColor: status.bg }]}>
          <Text style={[styles.addonStatusIcon, { color: status.color }]}>{status.icon}</Text>
          <Text style={[styles.addonStatusLabel, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>

      {isExpanded && (
        <View style={styles.addonExpanded}>
          <Text style={styles.addonDesc}>{addon.description}</Text>
          <View style={styles.addonActions}>
            {addon.status === 'available' && (
              <View style={styles.addonInstallCmd}>
                <Text style={styles.addonInstallText}>
                  {'$ alphinium forge addon install ' + addon.id}
                </Text>
              </View>
            )}
            {addon.status === 'installed' && (
              <View style={[styles.addonInstallCmd, { borderColor: colors.success + '40' }]}>
                <Text style={[styles.addonInstallText, { color: colors.success }]}>
                  ✓ Installed in this project
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.addonDocsBtn}
              onPress={() => Linking.openURL(addon.docsUrl)}
            >
              <Text style={styles.addonDocsBtnText}>View docs →</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: spacing['3xl'] },

  header: {
    padding: spacing.xl,
    paddingTop: spacing['2xl'],
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: typography['2xl'],
    fontWeight: typography.heavy,
    marginBottom: spacing.xs,
  },
  headerSub: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    lineHeight: 20,
  },
  mono: {
    color: colors.accent,
    fontFamily: 'monospace',
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.base,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    gap: spacing.sm,
  },
  searchIcon: { fontSize: 16, opacity: 0.5 },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.base,
    paddingVertical: spacing.md,
  },
  searchClear: { color: colors.textMuted, fontSize: 16, padding: 4 },

  category: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  categoryTitle: {
    fontSize: typography.sm,
    fontWeight: typography.bold,
    letterSpacing: 0.5,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
  },

  addonCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  addonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    gap: spacing.sm,
  },
  addonMeta: { flex: 1 },
  addonNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 3 },
  addonName: {
    color: colors.textPrimary,
    fontSize: typography.base,
    fontWeight: typography.semibold,
    fontFamily: 'monospace',
  },
  addonBadge: {
    backgroundColor: 'rgba(108,99,255,0.2)',
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  addonBadgeText: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: typography.bold,
    letterSpacing: 0.5,
  },
  addonTagline: {
    color: colors.textSecondary,
    fontSize: typography.sm,
  },
  addonStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    gap: 4,
    flexShrink: 0,
  },
  addonStatusIcon: { fontSize: 11, fontWeight: typography.bold },
  addonStatusLabel: { fontSize: 11, fontWeight: typography.semibold },

  addonExpanded: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    padding: spacing.base,
  },
  addonDesc: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  addonActions: { gap: spacing.sm },
  addonInstallCmd: {
    backgroundColor: 'rgba(0,212,170,0.06)',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(0,212,170,0.2)',
  },
  addonInstallText: {
    color: colors.accent,
    fontFamily: 'monospace',
    fontSize: typography.sm,
  },
  addonDocsBtn: { alignSelf: 'flex-start' },
  addonDocsBtnText: { color: colors.primary, fontSize: typography.sm, fontWeight: typography.semibold },

  footer: { padding: spacing.xl, alignItems: 'center' },
  footerText: { color: colors.textMuted, fontSize: typography.sm, textAlign: 'center' },
  footerLink: { color: colors.primary },
});
