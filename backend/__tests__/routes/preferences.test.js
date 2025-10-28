/**
 * Tests for Preferences Routes
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createPreferencesRoutes } from '../../routes/preferences.js';

describe('Preferences Routes', () => {
  let app;
  let userPreferences;

  beforeEach(() => {
    // Mock userPreferences store
    userPreferences = new Map();

    // Create Express app with preferences routes
    app = express();
    app.use(express.json());

    const router = createPreferencesRoutes({ userPreferences });
    app.use('/api', router);
  });

  describe('GET /api/preferences', () => {
    test('should return default preferences when no user preferences exist', async () => {
      const response = await request(app)
        .get('/api/preferences')
        .query({ userId: 'user123' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('notifications');
      expect(response.body).toHaveProperty('ui');
      expect(response.body).toHaveProperty('performance');

      // Check default values
      expect(response.body.notifications.enabled).toBe(true);
      expect(response.body.ui.theme).toBe('theme--night');
      expect(response.body.performance.enableMetrics).toBe(true);
    });

    test('should return stored preferences when they exist', async () => {
      const customPreferences = {
        notifications: { enabled: false },
        ui: { theme: 'light' },
        performance: { enableMetrics: false }
      };

      userPreferences.set('user123', customPreferences);

      const response = await request(app)
        .get('/api/preferences')
        .query({ userId: 'user123' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(customPreferences);
    });

    test('should use default userId when not provided', async () => {
      const response = await request(app)
        .get('/api/preferences');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('notifications');
    });

    test('should handle errors gracefully', async () => {
      // Create a mock that throws an error
      const badUserPreferences = {
        get: () => {
          throw new Error('Database error');
        }
      };

      const badApp = express();
      badApp.use(express.json());
      const badRouter = createPreferencesRoutes({ userPreferences: badUserPreferences });
      badApp.use('/api', badRouter);

      const response = await request(badApp)
        .get('/api/preferences')
        .query({ userId: 'user123' });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Database error');
    });

    test('should include all default notification types', async () => {
      const response = await request(app)
        .get('/api/preferences');

      expect(response.status).toBe(200);
      expect(response.body.notifications.types).toHaveProperty('errors');
      expect(response.body.notifications.types).toHaveProperty('warnings');
      expect(response.body.notifications.types).toHaveProperty('triggers');
      expect(response.body.notifications.types).toHaveProperty('performance');
      expect(response.body.notifications.types).toHaveProperty('info');
    });

    test('should include all default UI settings', async () => {
      const response = await request(app)
        .get('/api/preferences');

      expect(response.status).toBe(200);
      expect(response.body.ui).toHaveProperty('theme');
      expect(response.body.ui).toHaveProperty('compactMode');
      expect(response.body.ui).toHaveProperty('animationsEnabled');
      expect(response.body.ui).toHaveProperty('autoRefresh');
      expect(response.body.ui).toHaveProperty('refreshInterval');
    });

    test('should include all default performance settings', async () => {
      const response = await request(app)
        .get('/api/preferences');

      expect(response.status).toBe(200);
      expect(response.body.performance).toHaveProperty('enableMetrics');
      expect(response.body.performance).toHaveProperty('metricsInterval');
      expect(response.body.performance).toHaveProperty('enableFileWatcher');
      expect(response.body.performance).toHaveProperty('maxEventsDisplay');
    });
  });

  describe('POST /api/preferences', () => {
    test('should save preferences successfully', async () => {
      const preferences = {
        notifications: { enabled: true },
        ui: { theme: 'dark' },
        performance: { enableMetrics: true }
      };

      const response = await request(app)
        .post('/api/preferences')
        .send({
          userId: 'user123',
          preferences
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Preferences saved successfully');

      // Verify preferences were stored
      expect(userPreferences.get('user123')).toEqual(preferences);
    });

    test('should use default userId when not provided', async () => {
      const preferences = {
        notifications: { enabled: false }
      };

      const response = await request(app)
        .post('/api/preferences')
        .send({ preferences });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify preferences were stored with default userId
      expect(userPreferences.get('default')).toEqual(preferences);
    });

    test('should return 400 when preferences data is missing', async () => {
      const response = await request(app)
        .post('/api/preferences')
        .send({ userId: 'user123' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Preferences data required');
    });

    test('should return 400 when preferences is null', async () => {
      const response = await request(app)
        .post('/api/preferences')
        .send({
          userId: 'user123',
          preferences: null
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Preferences data required');
    });

    test('should return 400 when preferences is undefined', async () => {
      const response = await request(app)
        .post('/api/preferences')
        .send({ userId: 'user123' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Preferences data required');
    });

    test('should handle errors gracefully', async () => {
      // Create a mock that throws an error
      const badUserPreferences = {
        set: () => {
          throw new Error('Storage error');
        }
      };

      const badApp = express();
      badApp.use(express.json());
      const badRouter = createPreferencesRoutes({ userPreferences: badUserPreferences });
      badApp.use('/api', badRouter);

      const response = await request(badApp)
        .post('/api/preferences')
        .send({
          userId: 'user123',
          preferences: { test: true }
        });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Storage error');
    });

    test('should save complete preference object', async () => {
      const fullPreferences = {
        notifications: {
          enabled: true,
          showToasts: false,
          soundEnabled: true,
          desktopNotifications: true,
          types: {
            errors: true,
            warnings: false,
            triggers: true,
            performance: true,
            info: false
          }
        },
        ui: {
          theme: 'theme--light',
          compactMode: true,
          animationsEnabled: false,
          autoRefresh: false,
          refreshInterval: 30
        },
        performance: {
          enableMetrics: false,
          metricsInterval: 60,
          enableFileWatcher: false,
          maxEventsDisplay: 50
        }
      };

      const response = await request(app)
        .post('/api/preferences')
        .send({
          userId: 'user456',
          preferences: fullPreferences
        });

      expect(response.status).toBe(200);
      expect(userPreferences.get('user456')).toEqual(fullPreferences);
    });

    test('should overwrite existing preferences', async () => {
      // Set initial preferences
      userPreferences.set('user123', { old: 'data' });

      const newPreferences = { new: 'data' };

      const response = await request(app)
        .post('/api/preferences')
        .send({
          userId: 'user123',
          preferences: newPreferences
        });

      expect(response.status).toBe(200);
      expect(userPreferences.get('user123')).toEqual(newPreferences);
      expect(userPreferences.get('user123')).not.toHaveProperty('old');
    });
  });
});
