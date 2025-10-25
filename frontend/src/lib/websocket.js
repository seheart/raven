import { io } from 'socket.io-client';
import { notifications } from './notificationService.js';
import { authService } from './authStore.js';

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

    // Get auth token for websocket connection
    const token = authService.getToken();

    this.socket = io('http://localhost:3030', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity, // Keep trying to reconnect
      auth: {
        token: token
      }
    });

    this.socket.on('connect', () => {
      console.log('🔌 WebSocket connected');
      this.connected = true;
      notifications.websocketConnected();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('🔌 WebSocket disconnected:', reason);
      this.connected = false;
      notifications.websocketDisconnected();
    });

    this.socket.on('connect_error', (error) => {
      console.error('🔌 WebSocket connection error:', error);
      notifications.error(`WebSocket error: ${error.message || 'Connection failed'}`, {
        title: 'WebSocket Error'
      });
    });

    // Handle successful reconnection
    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`🔌 WebSocket reconnected after ${attemptNumber} attempts`);
      this.connected = true;
      notifications.success(`Reconnected after ${attemptNumber} attempt(s)`, {
        title: 'WebSocket Reconnected'
      });

      // Notify all registered reconnect callbacks
      for (const callback of this.reconnectCallbacks) {
        try {
          callback();
        } catch (error) {
          console.error('Error in reconnect callback:', error);
        }
      }
    });

    // Track reconnection attempts
    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`🔌 Attempting to reconnect (${attemptNumber})...`);
      if (attemptNumber % 5 === 0) { // Only notify every 5 attempts to avoid spam
        notifications.websocketReconnecting(attemptNumber);
      }
    });

    this.socket.on('reconnect_failed', () => {
      console.error('🔌 WebSocket reconnection failed - max attempts reached');
      notifications.error('Failed to reconnect to server', {
        title: 'Connection Failed',
        duration: 0 // Don't auto-dismiss
      });
    });

    return this.socket;
  }

  // Register a callback to be called when reconnection succeeds
  onReconnect(callback) {
    if (typeof callback === 'function') {
      this.reconnectCallbacks.push(callback);
    }
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
    this.listeners.get(event).push(callback);

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

  disconnect() {
    if (this.socket) {
      // Remove all listeners
      for (const [event, callbacks] of this.listeners.entries()) {
        for (const callback of callbacks) {
          this.socket.off(event, callback);
        }
      }
      this.listeners.clear();

      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  // Reconnect with new authentication token
  reconnectWithAuth() {
    this.disconnect();
    this.connect();
  }

  isConnected() {
    return this.connected;
  }
}

// Singleton instance
export const websocketService = new WebSocketService();
