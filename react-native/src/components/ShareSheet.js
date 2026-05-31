/**
 * ShareSheet — multi-channel share UI.
 *
 * On mobile web: "Share" triggers navigator.share (iOS/Android share sheet → SMS, WhatsApp, etc.)
 * On desktop web: shows Copy + WhatsApp + Facebook inline buttons.
 * On native (iOS/Android): uses RN Share.share() sheet.
 *
 * Props:
 *   title   {string}  Share dialog title
 *   text    {string}  Body text
 *   url     {string}  URL to share
 *   label   {string}  Button label (default: "Share 🎉")
 *   style   {object}  Container style override
 */

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Linking, Platform, Share,
} from 'react-native';
import { colors, typography, spacing, radius } from '../theme';

function canUseNavigatorShare() {
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && !!navigator.share;
}

function copyToClipboard(text) {
  if (Platform.OS === 'web' && navigator?.clipboard) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  }
  return Promise.resolve(false);
}

function openUrl(url) {
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener');
  } else {
    Linking.openURL(url).catch(() => {});
  }
}

export default function ShareSheet({ title, text, url, label = 'Share 🎉', style }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const shareText = url ? `${text}\n${url}` : text;

  async function handleNativeShare() {
    if (Platform.OS === 'web') {
      try {
        await navigator.share({ title, text, url: url || undefined });
      } catch {}
    } else {
      try {
        await Share.share({ message: shareText, url: url || undefined });
      } catch {}
    }
  }

  async function handleCopy() {
    const ok = await copyToClipboard(url || shareText);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  function handleWhatsApp() {
    openUrl(`https://wa.me/?text=${encodeURIComponent(shareText)}`);
  }

  function handleSMS() {
    const body = encodeURIComponent(shareText);
    openUrl(Platform.OS === 'ios' ? `sms:&body=${body}` : `sms:?body=${body}`);
  }

  function handleFacebook() {
    if (Platform.OS === 'web' && typeof FB !== 'undefined') {
      FB.ui({ method: 'share', href: url || window.location.href }, () => {});
    } else {
      openUrl(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url || '')}&quote=${encodeURIComponent(text)}`);
    }
  }

  function handleMessenger() {
    if (Platform.OS === 'web' && typeof FB !== 'undefined') {
      FB.ui({ method: 'send', link: url || window.location.href }, () => {});
    } else {
      // Deep-link to Messenger app with share
      openUrl(`fb-messenger://share?link=${encodeURIComponent(url || '')}`);
    }
  }

  // On mobile web: single "Share" button that opens the OS share sheet.
  // On desktop web or native without navigator.share: show expanded options.
  const isMobileWeb = Platform.OS === 'web' && canUseNavigatorShare();
  const isNative = Platform.OS !== 'web';

  if (isMobileWeb || isNative) {
    return (
      <View style={[styles.row, style]}>
        <TouchableOpacity style={styles.primaryBtn} onPress={handleNativeShare} activeOpacity={0.8}>
          <Text style={styles.primaryText}>{label}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={handleMessenger} activeOpacity={0.7}>
          <Text style={styles.iconText}>📨</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={handleCopy} activeOpacity={0.7}>
          <Text style={styles.iconText}>{copied ? '✅' : '📋'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Desktop web — show expanded or collapsed buttons
  if (!expanded) {
    return (
      <TouchableOpacity style={[styles.primaryBtn, style]} onPress={() => setExpanded(true)} activeOpacity={0.8}>
        <Text style={styles.primaryText}>{label}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.panel, style]}>
      <Text style={styles.panelTitle}>Share via</Text>
      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.channelBtn} onPress={handleCopy} activeOpacity={0.8}>
          <Text style={styles.channelIcon}>{copied ? '✅' : '📋'}</Text>
          <Text style={styles.channelLabel}>{copied ? 'Copied!' : 'Copy'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.channelBtn} onPress={handleWhatsApp} activeOpacity={0.8}>
          <Text style={styles.channelIcon}>💬</Text>
          <Text style={styles.channelLabel}>WhatsApp</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.channelBtn} onPress={handleMessenger} activeOpacity={0.8}>
          <Text style={styles.channelIcon}>📨</Text>
          <Text style={styles.channelLabel}>Messenger</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.channelBtn} onPress={handleSMS} activeOpacity={0.8}>
          <Text style={styles.channelIcon}>📱</Text>
          <Text style={styles.channelLabel}>SMS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.channelBtn} onPress={handleFacebook} activeOpacity={0.8}>
          <Text style={styles.channelIcon}>📘</Text>
          <Text style={styles.channelLabel}>Facebook</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  primaryText: {
    color: colors.white,
    fontWeight: typography.bold,
    fontSize: typography.base,
  },
  iconBtn: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  iconText: { fontSize: 18 },

  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  panelTitle: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  channelBtn: {
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: 4,
    minWidth: 72,
  },
  channelIcon: { fontSize: 22 },
  channelLabel: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    fontWeight: typography.semibold,
  },
});
