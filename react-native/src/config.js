/**
 * App Configuration
 * Set EXPO_PUBLIC_WS_URL in react-native/.env to point at your trivia-night server.
 *
 * Example .env:
 *   EXPO_PUBLIC_WS_URL=wss://trivia.example.com
 *
 * For local dev: EXPO_PUBLIC_WS_URL=ws://192.168.x.x:3000
 *
 * On web (browser), if EXPO_PUBLIC_WS_URL is not set the app automatically
 * connects back to the same host it was served from (same behaviour as the
 * vanilla JS client).
 */
import { Platform } from 'react-native';

function getDefaultWsUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.host}`;
  }
  return '';
}

export const WS_URL = process.env.EXPO_PUBLIC_WS_URL || getDefaultWsUrl();

export const APP_NAME = process.env.EXPO_PUBLIC_APP_NAME || 'Trivia Night';

/** Returns the web base URL (https/http) for building join links */
export function getWebBaseUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }
  // For native: derive HTTP base from WS_URL
  const ws = process.env.EXPO_PUBLIC_WS_URL || '';
  return ws.replace(/^wss?:\/\//, 'https://').replace(/\/$/, '');
}

/** Shareable URL that pre-fills the room code on the Join tab */
export function getJoinUrl(roomCode) {
  const base = getWebBaseUrl();
  if (!base) return null;
  return `${base}/?join=${roomCode}`;
}

function getDefaultAiUrl() {
  // On web: same host, /ai-agent path
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.host}/ai-agent`;
  }
  // On native: derive from WS_URL (strip trailing slash, append path)
  const base = process.env.EXPO_PUBLIC_WS_URL || '';
  if (base) return `${base.replace(/\/$/, '')}/ai-agent`;
  return '';
}

export const ALPHINIUM_AI_URL = process.env.EXPO_PUBLIC_ALPHINIUM_AI_URL || getDefaultAiUrl();

export const PAYMENTS_API_URL = process.env.EXPO_PUBLIC_PAYMENTS_API_URL || 'https://payments-api.alphinium.com';

export const STRAPI_URL = process.env.EXPO_PUBLIC_STRAPI_URL || 'https://auth.alphinium.io';

export default { WS_URL, APP_NAME, ALPHINIUM_AI_URL, PAYMENTS_API_URL };
