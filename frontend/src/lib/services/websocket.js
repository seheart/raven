import { io } from 'socket.io-client';
import { wsLogger } from '../logger.js';

// Get WebSocket URL from environment or use default. Same-origin by default
// so LAN/reverse-proxy/mobile access works without a frontend rebuild.
const WS_URL =
  import.meta.env.VITE_WS_URL ||
  (typeof window !== 'undefined' && window.location?.origin) ||
  'http://localhost:9100';

// WebSocket configuration constants
const WEBSOCKET_CONFIG = {
  RECONNECTION_DELAY_MS: 1000,
  RECONNECTION_DELAY_MAX_MS: 30000,
  RECONNECTION_ATTEMPTS: 20,
  CONNECTION_TIMEOUT_MS: 20000,
  MAX_RECONNECT_CALLBACKS: 50
};

class WebSocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.listeners = new Map();
    this.reconnectCallbacks = [];
  }

  connect() {
    if (this.socket) {
      return this.socket;
    }

    // Connect without authentication (DISABLE_AUTH mode)
    this.socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: WEBSOCKET_CONFIG.RECONNECTION_DELAY_MS,
      reconnectionDelayMax: WEBSOCKET_CONFIG.RECONNECTION_DELAY_MAX_MS,
      reconnectionAttempts: WEBSOCKET_CONFIG.RECONNECTION_ATTEMPTS,
      timeout: WEBSOCKET_CONFIG.CONNECTION_TIMEOUT_MS
    });

    this.socket.on('connect', () => {
      wsLogger.info('WebSocket connected');
      this.connected = true;
    });

    this.socket.on('disconnect', reason => {
      wsLogger.info('WebSocket disconnected', { reason });
      this.connected = false;
    });

    this.socket.on('connect_error', error => {
      wsLogger.error('WebSocket connection error', error);
    });

    // Handle successful reconnection
    this.socket.on('reconnect', attemptNumber => {
      wsLogger.info('WebSocket reconnected', { attemptNumber });
      this.connected = true;

      // Notify all registered reconnect callbacks
      for (const callback of this.reconnectCallbacks) {
        try {
          callback();
        } catch (error) {
          wsLogger.error('Error in reconnect callback', error);
        }
      }
    });

    // Track reconnection attempts
    this.socket.on('reconnect_attempt', attemptNumber => {
      wsLogger.debug('Attempting to reconnect', { attemptNumber });
    });

    this.socket.on('reconnect_failed', () => {
      wsLogger.error('WebSocket reconnection failed - max attempts reached');
    });

    return this.socket;
  }

  // Register a callback to be called when reconnection succeeds
  onReconnect(callback) {
    if (typeof callback !== 'function') {
      return;
    }

    // Limit reconnect callbacks to prevent unbounded growth
    if (this.reconnectCallbacks.length >= WEBSOCKET_CONFIG.MAX_RECONNECT_CALLBACKS) {
      wsLogger.warn('Max reconnect callbacks reached, removing oldest');
      this.reconnectCallbacks.shift();
    }

    // Check for duplicates
    if (this.reconnectCallbacks.includes(callback)) {
      wsLogger.warn('Duplicate reconnect callback prevented');
      return;
    }

    this.reconnectCallbacks.push(callback);
  }

  // Remove a reconnect callback
  offReconnect(callback) {
    const index = this.reconnectCallbacks.indexOf(callback);
    if (index > -1) {
      this.reconnectCallbacks.splice(index, 1);
    }
  }

  on(event, callback) {
    if (!this.socket) {
      this.connect();
    }

    // Store the listener so we can remove it later
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    // Check if this exact callback is already registered (prevent duplicates)
    const callbacks = this.listeners.get(event);
    if (callbacks.includes(callback)) {
      wsLogger.warn('Duplicate listener prevented', { event });
      return; // Don't add duplicate
    }

    callbacks.push(callback);
    this.socket.on(event, callback);
  }

  off(event, callback) {
    if (!this.socket) return;

    this.socket.off(event, callback);

    // Remove from listeners map
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  // Subscribe to an event and return an unsubscribe function
  subscribe(event, callback) {
    this.on(event, callback);

    // Return unsubscribe function
    return () => {
      this.off(event, callback);
    };
  }

  disconnect() {
    if (this.socket) {
      // Remove all listeners
      for (const [event, callbacks] of this.listeners.entries()) {
        for (const callback of callbacks) {
          this.socket.off(event, callback);
        }
      }
      this.listeners.clear();
      this.reconnectCallbacks = []; // Clear reconnect callbacks to prevent memory leaks

      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  isConnected() {
    return this.connected;
  }
}

// Singleton instance
export const websocketService = new WebSocketService();
