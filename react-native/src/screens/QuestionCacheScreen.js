/**
 * QuestionCacheScreen — Admin view of the question bank
 *
 * Shows:
 *  - Total stats (questions, avg usage, bank files)
 *  - Per-bank stats (subject, difficulty, count, last updated)
 *  - Full browseable question list per bank with usage counts
 *  - Clear cache button
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, TextInput, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius } from '../theme';
import { getWebBaseUrl } from '../config';

const DIFF_COLORS = { easy: '#27ae60', medium: '#e67e22', hard: '#e74c3c' };

export default function QuestionCacheScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedBank, setExpandedBank] = useState(null);
  const [search, setSearch] = useState('');
  const [clearing, setClearing] = useState(false);

  // Pull userId/name from localStorage (admin identity)
  const getUserParams = () => {
    try {
      const saved = JSON.parse(localStorage.getItem('trivia_settings') || '{}');
      const uid = localStorage.getItem('trivia_user_id') || '';
      return `userId=${encodeURIComponent(uid)}&name=${encodeURIComponent(saved.userFullName || 'Dan Woods')}`;
    } catch { return 'name=Dan%20Woods'; }
  };

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const base = getWebBaseUrl() || window.location.origin;
      const res = await fetch(`${base}/api/admin/question-cache?${getUserParams()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const clearCache = async () => {
    if (!confirm('Clear ALL cached questions? This cannot be undone.')) return;
    setClearing(true);
    try {
      const base = getWebBaseUrl() || window.location.origin;
      const saved = JSON.parse(localStorage.getItem('trivia_settings') || '{}');
      const uid = localStorage.getItem('trivia_user_id') || '';
      const res = await fetch(`${base}/api/admin/clear-question-cache`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, name: saved.userFullName || 'Dan Woods' }),
      });
      const json = await res.json();
      if (res.ok) { await load(); } else { alert(`❌ ${json.error}`); }
    } catch (e) { alert(`❌ ${e.message}`); }
    setClearing(false);
  };

  const filteredBanks = (data?.banks || []).map(bank => ({
    ...bank,
    questions: search.trim()
      ? bank.questions.filter(q =>
          q.question.toLowerCase().includes(search.toLowerCase()) ||
          (q.category || '').toLowerCase().includes(search.toLowerCase())
        )
      : bank.questions,
  })).filter(b => !search.trim() || b.questions.length > 0);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 80 }} />
        <Text style={styles.loadingText}>Loading question bank…</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>⚠️ Error</Text>
          <Text style={styles.errorMsg}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header stats */}
        <View style={styles.statRow}>
          <StatCard emoji="📚" value={data?.totalQuestions ?? 0} label="Questions" />
          <StatCard emoji="🗂️" value={data?.banks?.length ?? 0} label="Banks" />
          <StatCard emoji="🔄" value={data?.totalUsage ?? 0} label="Total Uses" />
        </View>

        {/* Search */}
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search questions…"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={styles.clearSearch}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Banks */}
        {filteredBanks.length === 0 && (
          <Text style={styles.empty}>{search ? 'No questions match your search.' : 'No questions cached yet.'}</Text>
        )}

        {filteredBanks.map((bank) => {
          const isExpanded = expandedBank === bank.file;
          const diffColor = DIFF_COLORS[bank.difficulty] || colors.textMuted;

          return (
            <View key={bank.file} style={styles.bankCard}>
              {/* Bank header — tap to expand */}
              <TouchableOpacity
                style={styles.bankHeader}
                onPress={() => setExpandedBank(isExpanded ? null : bank.file)}
                activeOpacity={0.7}
              >
                <View style={styles.bankHeaderLeft}>
                  <Text style={styles.bankSubject}>
                    {bank.subject === 'general' ? '🌐 General' : `📂 ${bank.subject}`}
                  </Text>
                  <View style={styles.bankMeta}>
                    <View style={[styles.diffBadge, { backgroundColor: diffColor + '22', borderColor: diffColor }]}>
                      <Text style={[styles.diffBadgeText, { color: diffColor }]}>{bank.difficulty}</Text>
                    </View>
                    <Text style={styles.bankStat}>{bank.count} Qs</Text>
                    <Text style={styles.bankStat}>avg {bank.avgUsage} uses</Text>
                    {bank.lastUpdated && (
                      <Text style={styles.bankDate}>
                        {new Date(bank.lastUpdated).toLocaleDateString()}
                      </Text>
                    )}
                  </View>
                </View>
                <Text style={styles.chevron}>{isExpanded ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {/* Question list (expanded) */}
              {isExpanded && (
                <View style={styles.questionList}>
                  {bank.questions.length === 0 && (
                    <Text style={styles.noResults}>No matching questions.</Text>
                  )}
                  {bank.questions.map((q, idx) => (
                    <View key={q.id || idx} style={styles.questionItem}>
                      <View style={styles.questionHeader}>
                        <Text style={styles.questionNum}>Q{idx + 1}</Text>
                        <View style={styles.usageBadge}>
                          <Text style={styles.usageText}>×{q.usageCount}</Text>
                        </View>
                        {q.category && (
                          <Text style={styles.categoryTag}>{q.category}</Text>
                        )}
                      </View>
                      <Text style={styles.questionText}>{q.question}</Text>
                      <View style={styles.options}>
                        {(q.options || []).map((opt, i) => (
                          <View
                            key={i}
                            style={[styles.option, i === q.answer && styles.optionCorrect]}
                          >
                            <Text style={[styles.optionLetter, i === q.answer && styles.optionLetterCorrect]}>
                              {String.fromCharCode(65 + i)}
                            </Text>
                            <Text style={[styles.optionText, i === q.answer && styles.optionTextCorrect]}>
                              {opt}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {/* Clear cache */}
        <TouchableOpacity
          style={[styles.clearBtn, clearing && styles.clearBtnDisabled]}
          onPress={clearCache}
          disabled={clearing}
          activeOpacity={0.8}
        >
          {clearing ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={styles.clearBtnText}>🗑️  Clear All Cached Questions</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ emoji, value, label }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statEmoji}>{emoji}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md, paddingBottom: spacing.xxl || 40 },
  loadingText: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.md },

  // Stats row
  statRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, alignItems: 'center',
    borderWidth: 1, borderColor: colors.surfaceBorder,
  },
  statEmoji: { fontSize: 24, marginBottom: 4 },
  statValue: { fontSize: typography.xl || 22, fontWeight: typography.bold, color: colors.textPrimary },
  statLabel: { fontSize: typography.xs, color: colors.textMuted, marginTop: 2 },

  // Search
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.surfaceBorder,
    paddingHorizontal: spacing.sm, marginBottom: spacing.md,
  },
  searchIcon: { fontSize: 16, marginRight: 6 },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: typography.base, paddingVertical: spacing.sm },
  clearSearch: { color: colors.textMuted, fontSize: 16, paddingLeft: spacing.sm },

  // Empty
  empty: { textAlign: 'center', color: colors.textMuted, marginVertical: spacing.xl, fontSize: typography.sm },

  // Bank card
  bankCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.surfaceBorder,
    marginBottom: spacing.sm, overflow: 'hidden',
  },
  bankHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.md, gap: spacing.sm,
  },
  bankHeaderLeft: { flex: 1 },
  bankSubject: { fontSize: typography.base, fontWeight: typography.bold, color: colors.textPrimary, marginBottom: 4 },
  bankMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  diffBadge: {
    borderWidth: 1, borderRadius: radius.sm,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  diffBadgeText: { fontSize: typography.xs, fontWeight: typography.semibold || '600', textTransform: 'capitalize' },
  bankStat: { fontSize: typography.xs, color: colors.textMuted },
  bankDate: { fontSize: typography.xs, color: colors.textMuted },
  chevron: { color: colors.textMuted, fontSize: 12 },

  // Question list
  questionList: { borderTopWidth: 1, borderTopColor: colors.surfaceBorder },
  noResults: { color: colors.textMuted, textAlign: 'center', padding: spacing.md, fontSize: typography.sm },
  questionItem: {
    padding: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.surfaceBorder,
  },
  questionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 6 },
  questionNum: { fontSize: typography.xs, color: colors.textMuted, fontWeight: typography.bold },
  usageBadge: {
    backgroundColor: colors.primary + '22', borderRadius: radius.sm,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  usageText: { fontSize: typography.xs, color: colors.primary, fontWeight: typography.semibold || '600' },
  categoryTag: {
    fontSize: typography.xs, color: colors.textMuted,
    backgroundColor: colors.surfaceElevated || colors.surface,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm,
  },
  questionText: { fontSize: typography.sm, color: colors.textPrimary, marginBottom: spacing.sm, lineHeight: 20 },

  // Options
  options: { gap: 4 },
  option: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: colors.surfaceElevated || colors.surface,
    borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: 'transparent',
  },
  optionCorrect: {
    backgroundColor: '#27ae6018',
    borderColor: '#27ae60',
  },
  optionLetter: { fontSize: typography.xs, color: colors.textMuted, fontWeight: typography.bold, width: 18 },
  optionLetterCorrect: { color: '#27ae60' },
  optionText: { flex: 1, fontSize: typography.xs, color: colors.textSecondary || colors.textPrimary },
  optionTextCorrect: { color: '#27ae60', fontWeight: typography.semibold || '600' },

  // Clear button
  clearBtn: {
    backgroundColor: '#c0392b', borderRadius: radius.lg,
    padding: spacing.md, alignItems: 'center',
    marginTop: spacing.lg,
  },
  clearBtnDisabled: { opacity: 0.5 },
  clearBtnText: { color: colors.white, fontWeight: typography.bold, fontSize: typography.sm },

  // Error
  errorBox: { margin: spacing.xl, alignItems: 'center' },
  errorTitle: { fontSize: typography.lg, fontWeight: typography.bold, color: colors.textPrimary, marginBottom: spacing.sm },
  errorMsg: { color: colors.textMuted, textAlign: 'center', marginBottom: spacing.lg },
  retryBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  retryText: { color: colors.white, fontWeight: typography.bold },
});
