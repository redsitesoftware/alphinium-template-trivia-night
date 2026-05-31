import React, { useRef, useState } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView,
  SafeAreaView, StatusBar, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, typography, spacing, radius, shadows } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ONBOARDING_KEY = 'alphinium_onboarding_done';

const SLIDES = [
  {
    emoji: '⚡',
    emojiColor: colors.primary,
    title: 'Welcome to your\nForge app',
    body: 'This is your starting point — a fully-featured React Native template built and deployed by Alphinium.',
    badge: 'STEP 1 OF 3',
  },
  {
    emoji: '🧩',
    emojiColor: colors.accent,
    title: 'Batteries included',
    body: 'Auth, Stripe payments, a CMS feed, and an add-on ecosystem — all wired up and ready to ship.',
    badge: 'STEP 2 OF 3',
  },
  {
    emoji: '🚀',
    emojiColor: colors.warning,
    title: 'Build with one command',
    body: 'Run alphinium forge build ios or forge build android to trigger a full native build via the Mac agent.',
    badge: 'STEP 3 OF 3',
    final: true,
  },
];

export async function hasSeenOnboarding() {
  try {
    return !!(await AsyncStorage.getItem(ONBOARDING_KEY));
  } catch {
    return false;
  }
}

export async function markOnboardingDone() {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, '1');
  } catch {}
}

export default function OnboardingScreen({ onDone }) {
  const scrollRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  function goToNext() {
    if (currentIndex < SLIDES.length - 1) {
      const nextIndex = currentIndex + 1;
      scrollRef.current?.scrollTo({ x: nextIndex * SCREEN_WIDTH, animated: true });
      setCurrentIndex(nextIndex);
    } else {
      handleDone();
    }
  }

  async function handleDone() {
    await markOnboardingDone();
    onDone?.();
  }

  function handleScroll(e) {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentIndex(page);
  }

  const slide = SLIDES[currentIndex];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Skip button */}
      <TouchableOpacity style={styles.skip} onPress={handleDone}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={styles.slideScroll}
      >
        {SLIDES.map((s, i) => (
          <View key={i} style={styles.slide}>
            {/* Badge */}
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{s.badge}</Text>
            </View>

            {/* Emoji */}
            <View style={[styles.emojiCircle, { shadowColor: s.emojiColor }]}>
              <Text style={styles.emoji}>{s.emoji}</Text>
            </View>

            {/* Text */}
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>

            {/* Mono code snippet on last slide */}
            {s.final && (
              <View style={styles.codeBlock}>
                <Text style={styles.codeText}>$ alphinium forge build ios</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Dots */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === currentIndex && styles.dotActive]}
          />
        ))}
      </View>

      {/* CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.cta}
          onPress={goToNext}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>
            {currentIndex < SLIDES.length - 1 ? 'Next →' : "Let's go ⚡"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  skip: {
    position: 'absolute',
    top: spacing.xl + 8,
    right: spacing.xl,
    zIndex: 10,
    padding: spacing.xs,
  },
  skipText: {
    color: colors.textMuted,
    fontSize: typography.sm,
    fontWeight: typography.medium,
  },

  slideScroll: { flex: 1 },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['3xl'],
  },

  badge: {
    backgroundColor: 'rgba(108,99,255,0.12)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.25)',
  },
  badgeText: {
    color: colors.primary,
    fontSize: typography.xs,
    fontWeight: typography.bold,
    letterSpacing: 1,
  },

  emojiCircle: {
    width: 120,
    height: 120,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing['2xl'],
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  emoji: { fontSize: 56 },

  title: {
    color: colors.textPrimary,
    fontSize: typography['2xl'],
    fontWeight: typography.heavy,
    textAlign: 'center',
    marginBottom: spacing.base,
    lineHeight: 34,
  },
  body: {
    color: colors.textSecondary,
    fontSize: typography.base,
    textAlign: 'center',
    lineHeight: 24,
  },

  codeBlock: {
    marginTop: spacing.xl,
    backgroundColor: 'rgba(0,212,170,0.08)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(0,212,170,0.2)',
  },
  codeText: {
    color: colors.accent,
    fontFamily: 'monospace',
    fontSize: typography.sm,
  },

  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceBorder,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 20,
  },

  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['2xl'],
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.base,
    alignItems: 'center',
    ...shadows.glow,
  },
  ctaText: {
    color: colors.white,
    fontSize: typography.md,
    fontWeight: typography.bold,
  },
});
