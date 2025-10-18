import { io } from 'socket.io-client';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.listeners = new Map();
  }

  connect() {
    if (this.socket) {
      return this.socket;
    }

    this.socket = io('http://localhost:3030', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      console.log('🔌 WebSocket connected');
      this.connected = true;
    });

    this.socket.on('disconnect', () => {
      console.log('🔌 WebSocket disconnected');
      this.connected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('🔌 WebSocket connection error:', error);
    });

    return this.socket;
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

  isConnected() {
    return this.connected;
  }
}

// Singleton instance
export const websocketService = new WebSocketService();
