import { Router } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Creates notification management routes
 * @param {object} deps - Dependencies
 * @returns {Router} Express router
 */
export function createNotificationsRoutes(deps) {
  const router = Router();
  const { projectState } = deps;

  /**
   * GET /api/notifications
   * Get notifications with filtering options
   */
  router.get('/notifications', (req, res) => {
    try {
      const options = {
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0,
        type: req.query.type || 'all',
        severity: req.query.severity || 'all',
        unread_only: req.query.unread_only === 'true'
      };

      const result = projectState.db.getNotifications(options);
      res.json(result);
    } catch (error) {
      logger.error('❌ Error fetching notifications:', error);
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  });

  /**
   * GET /api/notifications/stats
   * Get notification statistics
   */
  router.get('/notifications/stats', (req, res) => {
    try {
      const stats = projectState.db.getNotificationStats();
      res.json(stats);
    } catch (error) {
      logger.error('❌ Error fetching notification stats:', error);
      res.status(500).json({ error: 'Failed to fetch notification stats' });
    }
  });

  /**
   * POST /api/notifications/:id/read
   * Mark a specific notification as read
   */
  router.post('/notifications/:id/read', (req, res) => {
    try {
      const id = parseInt(req.params.id);
      projectState.db.markNotificationAsRead(id);
      res.json({ success: true });
    } catch (error) {
      logger.error('❌ Error marking notification as read:', error);
      res.status(500).json({ error: 'Failed to mark notification as read' });
    }
  });

  /**
   * POST /api/notifications/mark-all-read
   * Mark all notifications as read
   */
  router.post('/notifications/mark-all-read', (req, res) => {
    try {
      projectState.db.markAllNotificationsAsRead();
      res.json({ success: true });
    } catch (error) {
      logger.error('❌ Error marking all notifications as read:', error);
      res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
  });

  /**
   * DELETE /api/notifications/:id
   * Delete a specific notification
   */
  router.delete('/notifications/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id);
      projectState.db.deleteNotification(id);
      res.json({ success: true });
    } catch (error) {
      logger.error('❌ Error deleting notification:', error);
      res.status(500).json({ error: 'Failed to delete notification' });
    }
  });

  /**
   * DELETE /api/notifications
   * Clear notifications (optionally older than specified days)
   */
  router.delete('/notifications', (req, res) => {
    try {
      const olderThanDays = req.query.olderThanDays ? parseInt(req.query.olderThanDays) : null;
      const result = projectState.db.clearNotifications(olderThanDays);
      res.json(result);
    } catch (error) {
      logger.error('❌ Error clearing notifications:', error);
      res.status(500).json({ error: 'Failed to clear notifications' });
    }
  });

  return router;
}
