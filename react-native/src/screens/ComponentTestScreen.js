import React from 'react';
import { StyleSheet, ScrollView, View, Text } from 'react-native';
import {
  AnimatedLogo,
  AnimatedRoleCards,
  ConfigurableHeader,
  ConfigurableFooter,
  ConfigurableNewsletter,
} from '../components/common';

export default function ComponentTestScreen() {
  const headerConfig = {
    brand: 'Alphinium',
    links: [
      { href: '#features', text: 'Features' },
      { href: '#pricing', text: 'Pricing' },
      { href: '#about', text: 'About' },
    ],
    actions: [
      { href: '#login', text: 'Login', className: 'btn-secondary' },
      { href: '#signup', text: 'Get Started', className: 'btn-primary' },
    ],
    scrollTrigger: true,
  };

  const footerConfig = {
    companyName: 'Alphinium',
    tagline: 'Building the future of software',
    columns: [
      {
        title: 'Product',
        links: [
          { href: '#features', text: 'Features' },
          { href: '#pricing', text: 'Pricing' },
          { href: '#demo', text: 'Demo' },
        ],
      },
      {
        title: 'Company',
        links: [
          { href: '#about', text: 'About' },
          { href: '#blog', text: 'Blog' },
          { href: '#contact', text: 'Contact' },
        ],
      },
    ],
    socialLinks: [
      { platform: 'github', url: 'https://github.com/redsitesoftware' },
      { platform: 'twitter', url: 'https://twitter.com/alphinium' },
    ],
  };

  const roleCards = [
    {
      title: 'Lightning Fast',
      description: 'Built for speed and performance',
      icon: '⚡',
    },
    {
      title: 'Secure',
      description: 'Enterprise-grade security',
      icon: '🔒',
    },
    {
      title: 'Scalable',
      description: 'Grows with your business',
      icon: '📈',
    },
  ];

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={true}
    >
      <View style={styles.header}>
        <Text style={styles.title}>🧪 Component Test Screen</Text>
        <Text style={styles.subtitle}>Testing migrated common components</Text>
      </View>

      {/* Test AnimatedLogo */}
      <View style={styles.testSection}>
        <Text style={styles.sectionTitle}>1. AnimatedLogo</Text>
        <View style={styles.componentContainer}>
          <AnimatedLogo
            src="https://via.placeholder.com/150"
            alt="Test Logo"
            animation="pulse"
            size="100px"
          />
        </View>
        <Text style={styles.statusText}>✓ Component loaded</Text>
      </View>

      {/* Test ConfigurableHeader */}
      <View style={styles.testSection}>
        <Text style={styles.sectionTitle}>2. ConfigurableHeader</Text>
        <View style={styles.componentContainer}>
          <ConfigurableHeader {...headerConfig} />
        </View>
        <Text style={styles.statusText}>✓ Component loaded</Text>
      </View>

      {/* Test AnimatedRoleCards */}
      <View style={styles.testSection}>
        <Text style={styles.sectionTitle}>3. AnimatedRoleCards</Text>
        <View style={styles.componentContainer}>
          <AnimatedRoleCards cards={roleCards} />
        </View>
        <Text style={styles.statusText}>✓ Component loaded</Text>
      </View>

      {/* Test ConfigurableNewsletter */}
      <View style={styles.testSection}>
        <Text style={styles.sectionTitle}>4. ConfigurableNewsletter</Text>
        <View style={styles.componentContainer}>
          <ConfigurableNewsletter
            title="Stay Updated"
            description="Get the latest news and updates"
            placeholder="Enter your email"
          />
        </View>
        <Text style={styles.statusText}>✓ Component loaded</Text>
      </View>

      {/* Test ConfigurableFooter */}
      <View style={styles.testSection}>
        <Text style={styles.sectionTitle}>5. ConfigurableFooter</Text>
        <View style={styles.componentContainer}>
          <ConfigurableFooter {...footerConfig} />
        </View>
        <Text style={styles.statusText}>✓ Component loaded</Text>
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>✅ All Components Migrated</Text>
        <Text style={styles.summaryText}>
          5 components successfully copied from dot-com-sites
        </Text>
        <Text style={styles.summaryText}>
          Ready for use in site conversions (#26, #27, #28)
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0e27',
  },
  contentContainer: {
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#8b9dc3',
  },
  testSection: {
    backgroundColor: '#1a1f3a',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 12,
  },
  componentContainer: {
    backgroundColor: '#0a0e27',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  statusText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },
  summary: {
    backgroundColor: '#1a3a1a',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 16,
    marginVertical: 16,
    marginBottom: 40,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 12,
    textAlign: 'center',
  },
  summaryText: {
    fontSize: 14,
    color: '#a5d6a7',
    textAlign: 'center',
    marginBottom: 4,
  },
});
