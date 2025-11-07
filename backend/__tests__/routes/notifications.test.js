/**
 * Tests for Notifications Routes
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createNotificationsRoutes } from '../../routes/notifications.js';

describe('Notifications Routes', () => {
  let app;
  let mockDb;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    mockDb = {
      getNotifications: jest.fn().mockReturnValue({
        notifications: [],
        total: 0
      }),
      getNotificationStats: jest.fn().mockReturnValue({
        total: 0,
        unread: 0
      }),
      markNotificationAsRead: jest.fn(),
      markAllNotificationsAsRead: jest.fn(),
      deleteNotification: jest.fn(),
      clearNotifications: jest.fn().mockReturnValue({
        success: true,
        deletedCount: 0
      })
    };

    const deps = {
      projectState: { db: mockDb }
    };

    app.use('/api', createNotificationsRoutes(deps));
  });

  describe('GET /api/notifications', () => {
    test('should return notifications list', async () => {
      mockDb.getNotifications.mockReturnValue({
        notifications: [{ id: 1, title: 'Test notification', read: false }],
        total: 1
      });

      const response = await request(app)
        .get('/api/notifications')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('notifications');
      expect(response.body).toHaveProperty('total');
      expect(mockDb.getNotifications).toHaveBeenCalled();
    });

    test('should handle limit parameter', async () => {
      await request(app).get('/api/notifications?limit=20').expect(200);

      expect(mockDb.getNotifications).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
    });

    test('should handle offset parameter', async () => {
      await request(app).get('/api/notifications?offset=10').expect(200);

      expect(mockDb.getNotifications).toHaveBeenCalledWith(expect.objectContaining({ offset: 10 }));
    });

    test('should handle type filter', async () => {
      await request(app).get('/api/notifications?type=warning').expect(200);

      expect(mockDb.getNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'warning' })
      );
    });

    test('should handle severity filter', async () => {
      await request(app).get('/api/notifications?severity=high').expect(200);

      expect(mockDb.getNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'high' })
      );
    });

    test('should handle unread_only filter', async () => {
      await request(app).get('/api/notifications?unread_only=true').expect(200);

      expect(mockDb.getNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ unread_only: true })
      );
    });
  });

  describe('GET /api/notifications/stats', () => {
    test('should return notification statistics', async () => {
      mockDb.getNotificationStats.mockReturnValue({
        total: 50,
        unread: 15,
        byType: { warning: 10, info: 40 }
      });

      const response = await request(app)
        .get('/api/notifications/stats')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('total', 50);
      expect(response.body).toHaveProperty('unread', 15);
      expect(mockDb.getNotificationStats).toHaveBeenCalled();
    });
  });

  describe('POST /api/notifications/:id/read', () => {
    test('should mark notification as read', async () => {
      const response = await request(app)
        .post('/api/notifications/123/read')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(mockDb.markNotificationAsRead).toHaveBeenCalledWith(123);
    });

    test('should handle invalid notification ID', async () => {
      mockDb.markNotificationAsRead.mockImplementation(() => {
        throw new Error('Notification not found');
      });

      const response = await request(app)
        .post('/api/notifications/999/read')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/notifications/mark-all-read', () => {
    test('should mark all notifications as read', async () => {
      const response = await request(app)
        .post('/api/notifications/mark-all-read')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(mockDb.markAllNotificationsAsRead).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/notifications/:id', () => {
    test('should delete specific notification', async () => {
      const response = await request(app)
        .delete('/api/notifications/456')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(mockDb.deleteNotification).toHaveBeenCalledWith(456);
    });

    test('should handle deletion errors', async () => {
      mockDb.deleteNotification.mockImplementation(() => {
        throw new Error('Delete failed');
      });

      const response = await request(app)
        .delete('/api/notifications/999')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/notifications', () => {
    test('should clear all notifications', async () => {
      mockDb.clearNotifications.mockReturnValue({
        success: true,
        deletedCount: 25
      });

      const response = await request(app)
        .delete('/api/notifications')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('deletedCount', 25);
      expect(mockDb.clearNotifications).toHaveBeenCalledWith(null);
    });

    test('should clear notifications older than specified days', async () => {
      mockDb.clearNotifications.mockReturnValue({
        success: true,
        deletedCount: 10
      });

      const response = await request(app)
        .delete('/api/notifications?olderThanDays=7')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(mockDb.clearNotifications).toHaveBeenCalledWith(7);
    });
  });

  describe('Error Handling', () => {
    test('should handle errors when fetching notifications', async () => {
      mockDb.getNotifications.mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app).get('/api/notifications').expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Failed to fetch notifications');
    });

    test('should handle errors when fetching stats', async () => {
      mockDb.getNotificationStats.mockImplementation(() => {
        throw new Error('Stats error');
      });

      const response = await request(app).get('/api/notifications/stats').expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Failed to fetch notification stats');
    });

    test('should handle errors when marking notification as read', async () => {
      mockDb.markNotificationAsRead.mockImplementation(() => {
        throw new Error('Mark read error');
      });

      const response = await request(app).post('/api/notifications/1/read').expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Failed to mark notification as read');
    });

    test('should handle errors when marking all as read', async () => {
      mockDb.markAllNotificationsAsRead.mockImplementation(() => {
        throw new Error('Mark all error');
      });

      const response = await request(app).post('/api/notifications/mark-all-read').expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Failed to mark all notifications as read');
    });
  });
});
