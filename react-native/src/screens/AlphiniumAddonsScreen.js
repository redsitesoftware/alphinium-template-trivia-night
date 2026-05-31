import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, ScrollView,
  TouchableOpacity, Linking,
} from 'react-native';
import { STRAPI_URL, STRAPI_API_TOKEN } from '../config';
import AlphiniumNewsCard from '../components/AlphiniumNewsCard';

/**
 * AlphiniumAddonsScreen
 * Showcases available Alphinium add-on packages that can be installed
 * into this Forge project via: alphinium forge addon install <package-name>
 */

const ADDONS = [
  {
    id: 'alphinium-news',
    name: 'alphinium-news',
    emoji: '📰',
    tagline: 'News & Articles Feed',
    description: 'Fetch and display news articles from your Strapi CMS. Includes feed, cards, and article detail modal. Installed in this project.',
    installed: true,
    docsUrl: 'https://github.com/redsitesoftware/alphinium-news',
  },
  {
    id: 'alphinium-maps',
    name: 'alphinium-maps',
    emoji: '🗺️',
    tagline: 'Interactive Maps',
    description: 'Embed interactive maps with markers, routes, and location search. Powered by Google Maps and Mapbox.',
    installed: false,
    docsUrl: 'https://github.com/redsitesoftware/alphinium-maps',
  },
  {
    id: 'alphinium-weather',
    name: 'alphinium-weather',
    emoji: '🌤️',
    tagline: 'Weather Data & Widgets',
    description: 'Real-time weather data, forecasts, and beautiful weather widgets for any location.',
    installed: false,
    docsUrl: 'https://github.com/redsitesoftware/alphinium-weather',
  },
  {
    id: 'alphinium-traffic',
    name: 'alphinium-traffic',
    emoji: '🚦',
    tagline: 'Traffic Intelligence',
    description: 'Live traffic data, incident reports, and route optimization for web and mobile.',
    installed: false,
    docsUrl: 'https://github.com/redsitesoftware/alphinium-traffic',
  },
  {
    id: 'alphinium-notifications',
    name: 'alphinium-notifications',
    emoji: '🔔',
    tagline: 'Push Notifications',
    description: 'Universal notification system — push, in-app, and email. Event-driven with a clean subscription API.',
    installed: false,
    docsUrl: 'https://github.com/redsitesoftware/alphinium-notifications',
  },
  {
    id: 'alphinium-leaflet',
    name: 'alphinium-leaflet',
    tagline: '2D Interactive Maps (Leaflet)',
    emoji: '🗺️',
    description: 'Lightweight 2D mapping with Leaflet.js. Ideal for custom overlays, heatmaps, and vector layers.',
    installed: false,
    docsUrl: 'https://github.com/redsitesoftware/alphinium-leaflet',
  },
];

export default function AlphiniumAddonsScreen() {
  const [newsArticles, setNewsArticles] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState(null);

  useEffect(() => {
    if (STRAPI_URL) {
      fetchNewsPreview();
    }
  }, []);

  async function fetchNewsPreview() {
    setNewsLoading(true);
    try {
      const headers = {};
      if (STRAPI_API_TOKEN) headers['Authorization'] = `Bearer ${STRAPI_API_TOKEN}`;
      const res = await fetch(`${STRAPI_URL}/api/articles?pagination[pageSize]=3&sort=createdAt:desc`, { headers });
      const json = await res.json();
      setNewsArticles(json.data || []);
    } catch (e) {
      setNewsError(e.message);
    } finally {
      setNewsLoading(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={true}
    >
      <View style={styles.header}>
        <Text style={styles.title}>📦 Alphinium Add-ons</Text>
        <Text style={styles.subtitle}>
          Extend your Forge project with add-on packages
        </Text>
        <View style={styles.installHint}>
          <Text style={styles.installHintText}>
            alphinium forge addon install {'<package-name>'}
          </Text>
        </View>
      </View>

      {ADDONS.map((addon) => (
        <View key={addon.id} style={[styles.card, addon.installed && styles.cardInstalled]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardEmoji}>{addon.emoji}</Text>
              <View style={styles.cardTitleBlock}>
                <Text style={styles.cardName}>{addon.name}</Text>
                <Text style={styles.cardTagline}>{addon.tagline}</Text>
              </View>
              {addon.installed && (
                <View style={styles.installedBadge}>
                  <Text style={styles.installedBadgeText}>✓ installed</Text>
                </View>
              )}
            </View>
          </View>

          <Text style={styles.cardDesc}>{addon.description}</Text>

          {/* Live preview for installed alphinium-news */}
          {addon.id === 'alphinium-news' && (
            <View style={styles.preview}>
              <Text style={styles.previewLabel}>Live preview:</Text>
              {newsLoading && <Text style={styles.previewLoading}>Loading articles...</Text>}
              {newsError && <Text style={styles.previewError}>⚠ {newsError}</Text>}
              {!newsLoading && newsArticles.map((a) => (
                <AlphiniumNewsCard key={a.id} article={a} />
              ))}
              {!newsLoading && !newsError && newsArticles.length === 0 && (
                <Text style={styles.previewEmpty}>No articles yet — create one on the home screen.</Text>
              )}
            </View>
          )}

          {/* Install snippet for not-yet-installed packages */}
          {!addon.installed && (
            <View style={styles.installSnippet}>
              <Text style={styles.installSnippetText}>
                alphinium forge addon install {addon.name}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.docsBtn}
            onPress={() => Linking.openURL(addon.docsUrl)}
          >
            <Text style={styles.docsBtnText}>📄 View Docs</Text>
          </TouchableOpacity>
        </View>
      ))}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Browse all add-ons at alphinium.io/forge/addons
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0e27' },
  content: { paddingBottom: 48 },
  header: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  title: { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#8b9dc3', textAlign: 'center', marginBottom: 16, lineHeight: 22 },
  installHint: {
    backgroundColor: '#1a1f3a',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a3550',
  },
  installHintText: { color: '#4285F4', fontFamily: 'monospace', fontSize: 13 },
  card: {
    backgroundColor: '#1a1f3a',
    borderRadius: 12,
    padding: 18,
    marginHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2a3550',
  },
  cardInstalled: { borderColor: '#4285F4', borderWidth: 2 },
  cardHeader: { marginBottom: 10 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  cardEmoji: { fontSize: 28, marginRight: 12, marginTop: 2 },
  cardTitleBlock: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: '#fff', fontFamily: 'monospace' },
  cardTagline: { fontSize: 13, color: '#8b9dc3', marginTop: 2 },
  installedBadge: {
    backgroundColor: '#0d2f0d',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4CAF50',
    marginLeft: 8,
  },
  installedBadgeText: { color: '#4CAF50', fontSize: 11, fontWeight: '700' },
  cardDesc: { color: '#b4c1d8', fontSize: 13, lineHeight: 20, marginBottom: 14 },
  preview: {
    backgroundColor: '#0a0e27',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a3550',
  },
  previewLabel: { color: '#4285F4', fontSize: 11, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 },
  previewLoading: { color: '#8b9dc3', fontSize: 13, fontStyle: 'italic' },
  previewError: { color: '#ff5252', fontSize: 13 },
  previewEmpty: { color: '#6b7a94', fontSize: 13, fontStyle: 'italic' },
  installSnippet: {
    backgroundColor: '#0a1628',
    padding: 10,
    borderRadius: 6,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1e3050',
  },
  installSnippetText: { color: '#8b9dc3', fontSize: 12, fontFamily: 'monospace' },
  docsBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#12193a',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2a3550',
  },
  docsBtnText: { color: '#8b9dc3', fontSize: 13, fontWeight: '600' },
  footer: { alignItems: 'center', paddingVertical: 24 },
  footerText: { color: '#4b5b74', fontSize: 12 },
});
