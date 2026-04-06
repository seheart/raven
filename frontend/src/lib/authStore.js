import { logger } from './logger.js';
import { writable, derived } from 'svelte/store';
import { notifications } from './notificationService.js';
import { API_CONFIG } from '../config.js';

const AUTH_API = `${API_CONFIG.BASE_URL}/auth`;

// Create writable stores
const token = writable(localStorage.getItem('raven-auth-token') || null);
const user = writable(
  (() => {
    try {
      return JSON.parse(localStorage.getItem('raven-auth-user') || 'null');
    } catch {
      return null;
    }
  })()
);
const loading = writable(false);

// Derived store for authentication status
export const isAuthenticated = derived([token, user], ([$token, $user]) => !!$token && !!$user);

/**
 * Authentication Service
 */
export const authService = {
  /**
   * Login with username and password
   */
  async login(username, password) {
    loading.set(true);
    try {
      const response = await fetch(`${AUTH_API}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
      }

      const data = await response.json();

      // Store token and user info
      localStorage.setItem('raven-auth-token', data.token);
      localStorage.setItem('raven-auth-user', JSON.stringify(data.user));

      token.set(data.token);
      user.set(data.user);

      notifications.success(`Welcome back, ${data.user.username}!`);
      return true;
    } catch (error) {
      notifications.error(`Login failed: ${error.message}`);
      return false;
    } finally {
      loading.set(false);
    }
  },

  /**
   * Logout current user
   */
  logout() {
    localStorage.removeItem('raven-auth-token');
    localStorage.removeItem('raven-auth-user');
    token.set(null);
    user.set(null);
    notifications.info('You have been logged out');
  },

  /**
   * Get current token
   */
  getToken() {
    let current;
    token.subscribe(t => {
      current = t;
    })();
    return current;
  },

  /**
   * Get current user
   */
  getUser() {
    let current;
    user.subscribe(u => {
      current = u;
    })();
    return current;
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!this.getToken() && !!this.getUser();
  },

  /**
   * Verify token with server
   */
  async verifyToken() {
    const currentToken = this.getToken();
    if (!currentToken) {
      return false;
    }

    try {
      const response = await fetch(`${AUTH_API}/me`, {
        headers: {
          Authorization: `Bearer ${currentToken}`
        }
      });

      if (!response.ok) {
        // Token is invalid, clear auth
        this.logout();
        return false;
      }

      const data = await response.json();

      // Update user info
      localStorage.setItem('raven-auth-user', JSON.stringify(data.user));
      user.set(data.user);

      return true;
    } catch (error) {
      logger.error('Token verification failed:', error);
      this.logout();
      return false;
    }
  }
};

// Export stores for reactive UI updates
export const authToken = { subscribe: token.subscribe };
export const currentUser = { subscribe: user.subscribe };
export const authLoading = { subscribe: loading.subscribe };
