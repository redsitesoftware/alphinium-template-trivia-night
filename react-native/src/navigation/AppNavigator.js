/**
 * AppNavigator — Stack navigator driven by game phase.
 * All navigation is controlled by GameContext.state.phase
 * so screens auto-advance when WS events arrive.
 */

import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import { useGame } from '../context/GameContext';
import { colors, typography } from '../theme';

import HomeScreen from '../screens/HomeScreen';
import LobbyScreen from '../screens/LobbyScreen';
import GameScreen from '../screens/GameScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import GameOverScreen from '../screens/GameOverScreen';
import AIGeneratingScreen from '../screens/AIGeneratingScreen';
import RoundBreakScreen from '../screens/RoundBreakScreen';
import AdBreakScreen from '../screens/AdBreakScreen';
import MillionaireScreen from '../screens/MillionaireScreen';
import BuzzerScreen from '../screens/BuzzerScreen';
import ChaseScreen from '../screens/ChaseScreen';
import ChaseOfferScreen from '../screens/ChaseOfferScreen';
import QuestionCacheScreen from '../screens/QuestionCacheScreen';

const Stack = createStackNavigator();

const headerStyle = {
  backgroundColor: colors.surface,
  shadowColor: 'transparent',
  elevation: 0,
};

export default function AppNavigator() {
  const { state } = useGame();
  const navRef = useRef(null);

  // Navigate based on game phase
  useEffect(() => {
    if (!navRef.current) return;
    const nav = navRef.current;

    // Determine which game screen to use based on mode
    const gameScreenName = state.gameMode === 'millionaire' ? 'Millionaire'
      : state.gameMode === 'buzzer' ? 'Buzzer'
      : state.gameMode === 'chase' ? 'Chase'
      : 'Game';

    switch (state.phase) {
      case 'home':
        nav.reset({ index: 0, routes: [{ name: 'Home' }] });
        break;
      case 'lobby':
        nav.reset({ index: 1, routes: [{ name: 'Home' }, { name: 'Lobby' }] });
        break;
      case 'ai_generating':
        nav.reset({ index: 1, routes: [{ name: 'Home' }, { name: 'AIGenerating' }] });
        break;
      case 'question': {
        const current = nav.getCurrentRoute()?.name;
        if (current === gameScreenName) break;
        if (current === 'Leaderboard' || current === 'RoundBreak' || current === 'AdBreak' || current === 'ChaseOffer') {
          nav.navigate(gameScreenName);
        } else {
          nav.reset({ index: 2, routes: [{ name: 'Home' }, { name: 'Lobby' }, { name: gameScreenName }] });
        }
        break;
      }
      case 'chase_offer': {
        const current = nav.getCurrentRoute()?.name;
        if (current !== 'ChaseOffer') nav.navigate('ChaseOffer');
        break;
      }
      case 'leaderboard': {
        if (state.totalRounds > 1) break;
        const current = nav.getCurrentRoute()?.name;
        if (current !== 'Leaderboard') {
          nav.navigate('Leaderboard');
        }
        break;
      }
      case 'round_break': {
        const current = nav.getCurrentRoute()?.name;
        if (current !== 'RoundBreak') {
          nav.navigate('RoundBreak');
        }
        break;
      }
      case 'ad_break': {
        const current = nav.getCurrentRoute()?.name;
        if (current !== 'AdBreak') {
          nav.navigate('AdBreak');
        }
        break;
      }
      case 'gameover':
        nav.reset({ index: 1, routes: [{ name: 'Home' }, { name: 'GameOver' }] });
        break;
      default:
        break;
    }
  }, [state.phase, state.totalRounds, state.gameMode]);

  return (
    <NavigationContainer ref={navRef}>
      <Stack.Navigator
        screenOptions={{
          headerStyle,
          headerTintColor: colors.textPrimary,
          headerTitleStyle: {
            fontWeight: typography.bold,
            fontSize: typography.md,
            color: colors.textPrimary,
          },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Home"         component={HomeScreen}         options={{ headerShown: false }} />
        <Stack.Screen name="Lobby"        component={LobbyScreen}        options={{ title: '🎮 Waiting Room', headerBackVisible: false }} />
        <Stack.Screen name="AIGenerating" component={AIGeneratingScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Game"         component={GameScreen}         options={{ headerShown: false }} />
        <Stack.Screen name="Millionaire"  component={MillionaireScreen}  options={{ headerShown: false }} />
        <Stack.Screen name="Buzzer"       component={BuzzerScreen}       options={{ headerShown: false }} />
        <Stack.Screen name="Chase"        component={ChaseScreen}        options={{ headerShown: false }} />
        <Stack.Screen name="ChaseOffer"   component={ChaseOfferScreen}   options={{ headerShown: false }} />
        <Stack.Screen name="Leaderboard"  component={LeaderboardScreen}  options={{ title: '📊 Scores', headerBackVisible: false }} />
        <Stack.Screen name="RoundBreak"   component={RoundBreakScreen}   options={{ headerShown: false }} />
        <Stack.Screen name="AdBreak"      component={AdBreakScreen}      options={{ headerShown: false }} />
        <Stack.Screen name="GameOver"      component={GameOverScreen}      options={{ headerShown: false }} />
        <Stack.Screen name="QuestionCache" component={QuestionCacheScreen} options={{ title: '📚 Question Cache', headerBackTitle: 'Lobby' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
