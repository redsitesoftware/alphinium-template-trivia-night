/**
 * Trivia Night WebSocket Service
 * Mirrors the reconnect logic from public/app.js, adapted for React Native.
 *
 * Usage:
 *   const ws = new TriviaWebSocket(url, onMessage, onStateChange);
 *   ws.connect();
 *   ws.send({ type: 'join_room', code, name });
 *   ws.disconnect();
 */

export const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
};

export class TriviaWebSocket {
  constructor(url, onMessage, onStateChange) {
    this.url = url;
    this.onMessage = onMessage;
    this.onStateChange = onStateChange;

    this._ws = null;
    this._retryCount = 0;
    this._reconnectTimer = null;
    this._intentionalClose = false;
    this._playerId = null;
    this._roomCode = null;
    this._connectionState = ConnectionState.DISCONNECTED;
  }

  setContext(playerId, roomCode) {
    this._playerId = playerId;
    this._roomCode = roomCode;
  }

  _setState(state) {
    this._connectionState = state;
    this.onStateChange?.(state);
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (!this.url) {
        reject(new Error('WS_URL not configured. Set EXPO_PUBLIC_WS_URL in .env'));
        return;
      }

      this._intentionalClose = false;
      this._setState(ConnectionState.CONNECTING);

      this._ws = new WebSocket(this.url);

      this._ws.onopen = () => {
        this._retryCount = 0;
        this._setState(ConnectionState.CONNECTED);

        // Re-assign onerror so post-connect errors don't reject a settled promise
        this._ws.onerror = (err) => {
          const msg = err?.message || err?.type || 'unknown';
          console.warn('[TriviaWS] Error after connect:', msg);
        };

        if (this._playerId) {
          this.send({ type: 'reconnect', playerId: this._playerId });
        }

        resolve();
      };

      this._ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          this.onMessage?.(msg);
        } catch (err) {
          console.warn('[TriviaWS] Failed to parse message:', e.data);
        }
      };

      this._ws.onerror = (err) => {
        // React Native WS error events don't have .message — log the whole event
        const msg = err?.message || err?.type || JSON.stringify(err) || 'unknown';
        console.error('[TriviaWS] Connection error:', msg);
        reject(new Error(msg));
      };

      this._ws.onclose = () => {
        if (this._intentionalClose) {
          this._setState(ConnectionState.DISCONNECTED);
          return;
        }
        if (this._playerId && this._roomCode) {
          this._scheduleReconnect();
        } else {
          this._setState(ConnectionState.DISCONNECTED);
        }
        // After the promise has settled, errors are handled via onclose/reconnect
        // so silence any further onerror to avoid confusing "Error: null" logs
        if (this._ws) this._ws.onerror = null;
      };
    });
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    const delay = Math.min(30000, 1000 * Math.pow(2, this._retryCount));
    this._retryCount++;
    this._setState(ConnectionState.RECONNECTING);

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect().catch(() => {});
    }, delay);
  }

  send(obj) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(obj));
    } else {
      console.warn('[TriviaWS] Cannot send — not connected');
    }
  }

  disconnect() {
    this._intentionalClose = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._ws) {
      this._ws.onclose = null;
      this._ws.close();
      this._ws = null;
    }
    this._playerId = null;
    this._roomCode = null;
    this._retryCount = 0;
    this._setState(ConnectionState.DISCONNECTED);
  }
}

export default TriviaWebSocket;
