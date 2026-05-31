/**
 * DebugLog — On-screen console log viewer for iOS Safari debugging.
 * Shows recent console.log/warn/error messages in a floating overlay.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';

const MAX_LOGS = 50;
const logs = [];

// Intercept console methods
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args) => {
    logs.push({ type: 'log', msg: args.map(a => String(a)).join(' '), time: Date.now() });
    if (logs.length > MAX_LOGS) logs.shift();
    originalLog.apply(console, args);
  };

  console.warn = (...args) => {
    logs.push({ type: 'warn', msg: args.map(a => String(a)).join(' '), time: Date.now() });
    if (logs.length > MAX_LOGS) logs.shift();
    originalWarn.apply(console, args);
  };

  console.error = (...args) => {
    logs.push({ type: 'error', msg: args.map(a => String(a)).join(' '), time: Date.now() });
    if (logs.length > MAX_LOGS) logs.shift();
    originalError.apply(console, args);
  };
}

export default function DebugLog() {
  const [visible, setVisible] = useState(false);
  const [logState, setLogState] = useState([]);
  const [filter, setFilter] = useState('audio'); // 'all' or 'audio'

  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      const filtered = filter === 'audio' 
        ? logs.filter(log => 
            log.msg.includes('[ttsPlayer]') || 
            log.msg.includes('[audio]') ||
            log.msg.includes('🔊') ||
            log.msg.includes('✅ Audio')
          )
        : logs;
      setLogState([...filtered]);
    }, 500);
    return () => clearInterval(interval);
  }, [visible, filter]);

  if (Platform.OS !== 'web') return null;

  return (
    <>
      {/* Toggle button */}
      <TouchableOpacity
        style={styles.toggleBtn}
        onPress={() => setVisible(!visible)}
        activeOpacity={0.7}
      >
        <Text style={styles.toggleText}>{visible ? '✕' : '🔊'}</Text>
      </TouchableOpacity>

      {/* Log overlay */}
      {visible && (
        <View style={styles.overlay}>
          <View style={styles.header}>
            <Text style={styles.title}>Audio Log ({logState.length})</Text>
            <TouchableOpacity
              onPress={() => setFilter(filter === 'audio' ? 'all' : 'audio')}
              style={styles.filterBtn}
            >
              <Text style={styles.filterText}>{filter === 'audio' ? '🔊' : '📋'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                logs.length = 0;
                setLogState([]);
              }}
              style={styles.clearBtn}
            >
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.logScroll}>
            {logState.map((entry, idx) => (
              <View key={idx} style={styles.logEntry}>
                <Text style={[styles.logText, styles[entry.type]]}>
                  {entry.type === 'error' ? '❌' : entry.type === 'warn' ? '⚠️' : 'ℹ️'} {entry.msg}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  toggleBtn: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    bottom: 120,  // Up from bottom so it's always visible on mobile Safari
    left: 10,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,100,100,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    // Add shadow so it stands out
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 8,
  },
  toggleText: {
    fontSize: 18,
    color: '#fff',
  },
  overlay: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    bottom: 180,  // Above toggle button
    left: 10,
    right: 10,
    height: 250,  // Bigger for better readability
    backgroundColor: 'rgba(0,0,0,0.95)',
    borderRadius: 8,
    overflow: 'hidden',
    zIndex: 9998,
    ...(Platform.OS === 'web' && {
      position: 'fixed',
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    gap: 8,
  },
  title: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    flex: 1,
  },
  filterBtn: {
    padding: 4,
  },
  filterText: {
    fontSize: 14,
  },
  clearBtn: {
    padding: 4,
  },
  clearText: {
    color: '#ff6b6b',
    fontSize: 11,
  },
  logScroll: {
    flex: 1,
  },
  logEntry: {
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    padding: 6,
  },
  logText: {
    fontSize: 10,
    fontFamily: Platform.OS === 'web' ? 'Menlo, Monaco, monospace' : 'monospace',
    lineHeight: 14,
  },
  log: {
    color: '#aaa',
  },
  warn: {
    color: '#ffa500',
  },
  error: {
    color: '#ff6b6b',
  },
});
