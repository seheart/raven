import io from 'socket.io-client';
import { APP_CONFIG } from '../utils/constants';

class RavenService {
  constructor() {
    this.socket = null;
    this.baseUrl = null;
    this.isConnected = false;
    this.listeners = {
      connect: [],
      disconnect: [],
      event: [],
      metrics: [],
      error: [],
    };
  }

  /**
   * Connect to Raven backend
   * @param {string} url - Backend URL (e.g., "http://192.168.1.100:3030")
   */
  connect(url) {
    if (this.socket) {
      this.socket.disconnect();
    }

    this.baseUrl = url;

    this.socket = io(url, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: APP_CONFIG.WEBSOCKET_RECONNECT_DELAY,
    });

    // Connection events
    this.socket.on('connect', () => {
      console.log('🟢 Connected to Raven backend');
      this.isConnected = true;
      this._emit('connect', { url });
    });

    this.socket.on('disconnect', () => {
      console.log('🔴 Disconnected from Raven backend');
      this.isConnected = false;
      this._emit('disconnect');
    });

    // Data events
    this.socket.on('event', (data) => {
      this._emit('event', data);
    });

    this.socket.on('metrics', (data) => {
      this._emit('metrics', data);
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
      this._emit('error', error);
    });

    return this;
  }

  /**
   * Disconnect from backend
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
  }

  /**
   * Register event listener
   * @param {string} eventType - Event type (connect, disconnect, event, metrics, error)
   * @param {function} callback - Callback function
   */
  on(eventType, callback) {
    if (this.listeners[eventType]) {
      this.listeners[eventType].push(callback);
    }
  }

  /**
   * Remove event listener
   */
  off(eventType, callback) {
    if (this.listeners[eventType]) {
      this.listeners[eventType] = this.listeners[eventType].filter(
        (cb) => cb !== callback
      );
    }
  }

  /**
   * Emit event to all listeners
   */
  _emit(eventType, data) {
    if (this.listeners[eventType]) {
      this.listeners[eventType].forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${eventType} listener:`, error);
        }
      });
    }
  }

  /**
   * Fetch projects list from API
   */
  async fetchProjects() {
    if (!this.baseUrl) {
      throw new Error('Not connected to backend');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/projects/list`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      throw error;
    }
  }

  /**
   * Fetch events for a specific project
   */
  async fetchEvents(projectName, limit = 100) {
    if (!this.baseUrl) {
      throw new Error('Not connected to backend');
    }

    try {
      const url = `${this.baseUrl}/api/events?project=${encodeURIComponent(
        projectName
      )}&limit=${limit}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch events:', error);
      throw error;
    }
  }

  /**
   * Fetch system metrics
   */
  async fetchMetrics() {
    if (!this.baseUrl) {
      throw new Error('Not connected to backend');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/metrics/current`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
      throw error;
    }
  }
}

// Export singleton instance
export default new RavenService();
