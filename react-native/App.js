/**
 * Trivia Night — React Native App
 * Built on the alphinium-app forge template.
 *
 * Architecture:
 *   GameProvider  — global WS state + game phase machine
 *   AppNavigator  — phase-driven stack navigation
 *
 * Environment (.env):
 *   EXPO_PUBLIC_WS_URL        — ws://... or wss://... pointing at trivia-night server
 *   EXPO_PUBLIC_APP_NAME      — display name (default: "Trivia Night")
 *   EXPO_PUBLIC_ALPHINIUM_AI_URL — optional, for live AI commentary
 */

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';

import { AuthProvider } from './src/context/AuthContext';
import { GameProvider } from './src/context/GameContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AuthProvider>
          <GameProvider>
            <StatusBar style="light" />
            <AppNavigator />
          </GameProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
