/**
 * MockAlphiniumAd — "Built with Alphinium" branded mock advertisement.
 *
 * Used in development and as the default alphinium-managed ad in apps
 * that haven't configured their own ad network credentials yet.
 *
 * Replace with real ad network SDK calls (AdMob / MAX / Meta) in production.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
  Linking,
  Image,
} from 'react-native';

// Gradient colors from alphinium.com hero
const GRADIENT_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626'];
const BRAND_TEXT   = '#ffffff';
const BRAND_MUTED  = '#e5e7eb';

export default function MockAlphiniumAd({ duration = 15, skipAfter = 10, onComplete }) {
  const [remaining, setRemaining] = useState(duration);
  const [canSkip, setCanSkip]     = useState(false);
  const progressAnim              = useRef(new Animated.Value(1)).current;
  const gradientAnim              = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Progress bar countdown
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: duration * 1000,
      useNativeDriver: false,
    }).start();

    // Animated gradient shift (like alphinium.com hero)
    Animated.loop(
      Animated.sequence([
        Animated.timing(gradientAnim, {
          toValue: 1,
          duration: 6000,
          useNativeDriver: false,
        }),
        Animated.timing(gradientAnim, {
          toValue: 0,
          duration: 6000,
          useNativeDriver: false,
        }),
      ])
    ).start();

    const interval = setInterval(() => {
      setRemaining(r => {
        const next = r - 1;
        if (next <= duration - skipAfter) setCanSkip(true);
        if (next <= 0) { clearInterval(interval); onComplete?.(); return 0; }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Animated gradient background colors
  const backgroundColor = gradientAnim.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [
      GRADIENT_COLORS[0], // Blue
      GRADIENT_COLORS[1], // Purple
      GRADIENT_COLORS[2], // Green
      GRADIENT_COLORS[3], // Orange
      GRADIENT_COLORS[0], // Back to blue
    ],
  });

  return (
    <Animated.View style={[styles.container, { backgroundColor }]}>
      <View style={styles.adLabelRow}>
        <Text style={styles.adLabel}>ADVERTISEMENT</Text>
      </View>

      <View style={styles.content}>
        <Image 
          source={require('../../assets/alphinium-logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.headline}>Deploy AI Development Teams</Text>
        <Text style={styles.tagline}>Coordinated agents for your codebase · From $14/month</Text>
        <Pressable 
          style={styles.ctaButton}
          onPress={() => Linking.openURL('https://alphinium.com')}
        >
          <Text style={styles.ctaText}>Learn More →</Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressBar,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>

        {canSkip ? (
          <Pressable style={styles.skipBtn} onPress={onComplete}>
            <Text style={styles.skipText}>Skip Ad ›</Text>
          </Pressable>
        ) : (
          <Text style={styles.timer}>
            Ad closes in <Text style={styles.timerNum}>{remaining}s</Text>
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 48,
    paddingHorizontal: 28,
  },
  adLabelRow: {
    alignItems: 'flex-end',
  },
  adLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  logo: {
    width: 280,
    height: 80,
    marginBottom: 20,
  },
  headline: {
    fontSize: 32,
    fontWeight: '800',
    color: BRAND_TEXT,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    paddingHorizontal: 20,
  },
  tagline: {
    fontSize: 18,
    color: BRAND_MUTED,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  ctaButton: {
    marginTop: 30,
    paddingVertical: 16,
    paddingHorizontal: 40,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  ctaText: {
    color: '#2563eb',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: 0.5,
  },
  footer: {
    alignItems: 'center',
    gap: 16,
  },
  progressTrack: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 2,
  },
  skipBtn: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  skipText: {
    color: BRAND_TEXT,
    fontWeight: '700',
    fontSize: 15,
  },
  timer: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  timerNum: {
    color: BRAND_TEXT,
    fontWeight: '700',
  },
});
