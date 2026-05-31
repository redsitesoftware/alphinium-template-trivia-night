# Trivia Night — React Native App

React Native + Expo mobile client for the Trivia Night multiplayer game.
Built on the **alphinium-app** forge template.

## Screens

| Screen | Description |
|--------|-------------|
| **Home** | Create or join a room by entering a name and 6-char code |
| **Lobby** | Room code display, player list, host controls (timer, spectators, start) |
| **Game** | Question + A/B/C/D options, animated timer bar, AI commentator bubble |
| **Leaderboard** | Between-question scores + correct answer reveal |
| **Game Over** | Podium, full results, play again |

## Quick Start

```bash
cd react-native
cp .env.example .env
# Edit .env — set EXPO_PUBLIC_WS_URL to your server
npm install
npm start        # Expo Dev Tools
npm run ios      # iOS simulator
npm run android  # Android emulator
npm run web      # Expo Web
```

## WebSocket Server

The server runs from the project root:

```bash
npm start         # production
npm run dev       # watch mode
```

Default port: `3000`. Set `EXPO_PUBLIC_WS_URL=ws://localhost:3000` for local dev.
On a physical device, use your Mac's LAN IP (e.g. `ws://192.168.1.x:3000`).

## alphinium-ai Integration (Phase 1 — Observer Mode)

The `useAgent` hook in `src/hooks/useAgent.js` connects to the alphinium-ai service for live commentary.

- **Without** `EXPO_PUBLIC_ALPHINIUM_AI_URL`: falls back to local stub commentary (always works)
- **With** the URL: connects via WebSocket and streams AI-generated commentary into the 🤖 AI Host bubble

To upgrade to the published npm package once available:
```js
import { useAgent } from '@alphinium/ai';
```

## Architecture

```
App.js
├── GameProvider (GameContext)   — WebSocket state machine
│   └── AppNavigator             — phase-driven navigation
│       ├── HomeScreen           — connect + create/join
│       ├── LobbyScreen          — waiting room + host controls
│       ├── GameScreen           — question + timer + AI bubble
│       ├── LeaderboardScreen    — between-question interstitial
│       └── GameOverScreen       — podium + play again
└── useAgent (hooks/useAgent.js) — alphinium-ai commentary
```

## Forge Template

This project is the primary **alphinium-app** demo — a fork template showing:
- WebSocket-based real-time game state
- Phase-driven navigation (no manual `navigation.navigate`)  
- alphinium-ai observer integration
- Dark game theme with animated UI

Tracked in: [trivia-night-e2e#476](https://github.com/redsitesoftware/trivia-night-e2e/issues/476)
