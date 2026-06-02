/**
 * AppFooter — Shown at the bottom of lobby and game-over screens.
 * Contains:
 *   - Dedication line
 *   - "Built with Alphinium.com" branding (placeholder for alphinium-ads)
 *   - App version number
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { colors, typography, spacing } from '../theme';

const APP_VERSION = 'v1.0.0';

export default function AppFooter({ style }) {
  return (
    <View style={[styles.footer, style]}>
      <Text style={styles.dedication}>
        🤍 Trivia Night is dedicated to Shane and Sally
      </Text>
      <TouchableOpacity onPress={() => Linking.openURL('https://alphinium.com')} activeOpacity={0.7}>
        <Text style={styles.branding}>
          Built with{' '}
          <Text style={styles.brandingLink}>Alphinium.com</Text>
        </Text>
      </TouchableOpacity>
      <Text style={styles.version}>{APP_VERSION}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  dedication: {
    fontSize: typography.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
  branding: {
    fontSize: typography.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
  brandingLink: {
    color: colors.primary,
    fontWeight: typography.semibold,
    textDecorationLine: 'underline',
  },
  version: {
    fontSize: typography.xs,
    color: colors.textMuted,
    opacity: 0.6,
    textAlign: 'center',
    marginTop: 2,
  },
});
