import { Router } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Creates global search routes
 * @param {object} deps - Dependencies
 * @returns {Router} Express router
 */
export function createSearchRoutes(deps) {
  const router = Router();
  const { projectState } = deps;

  /**
   * GET /api/search/global
   * Global search across events, conversations, errors, and notifications
   */
  router.get('/search/global', (req, res) => {
    try {
      const query = req.query.q || '';
      const limit = parseInt(req.query.limit) || 50;

      if (!query || query.trim().length < 2) {
        return res.json({ results: [], total: 0, query: '' });
      }

      const searchPattern = `%${query}%`;
      const results = [];

      // Search events (files, changes)
      const eventsSql = `
        SELECT 'event' as type, id, filepath as title, change_type as subtitle,
               timestamp
        FROM events
        WHERE filepath LIKE ? OR change_type LIKE ?
        ORDER BY timestamp DESC
        LIMIT ?
      `;
      const events = projectState.db.db.prepare(eventsSql).all(searchPattern, searchPattern, limit);
      results.push(...events.map(e => ({
        ...e,
        icon: '📄',
        description: `${e.subtitle}`
      })));

      // Search conversations
      const convsSql = `
        SELECT 'conversation' as type, id, tool_name as title, content as subtitle,
               timestamp, project
        FROM conversations
        WHERE content LIKE ? OR tool_name LIKE ? OR project LIKE ?
        ORDER BY timestamp DESC
        LIMIT ?
      `;
      const convs = projectState.db.db.prepare(convsSql).all(searchPattern, searchPattern, searchPattern, limit);
      results.push(...convs.map(c => ({
        ...c,
        icon: '💬',
        description: c.subtitle ? c.subtitle.substring(0, 100) : ''
      })));

      // Search errors
      const errorsSql = `
        SELECT 'error' as type, id, message as title, severity as subtitle,
               timestamp
        FROM error_logs
        WHERE message LIKE ? OR metadata LIKE ?
        ORDER BY timestamp DESC
        LIMIT ?
      `;
      const errors = projectState.db.db.prepare(errorsSql).all(searchPattern, searchPattern, limit);
      results.push(...errors.map(e => ({
        ...e,
        icon: '❌',
        description: `${e.subtitle} severity`
      })));

      // Search notifications
      const notifsSql = `
        SELECT 'notification' as type, id, title, message as subtitle,
               timestamp
        FROM notifications
        WHERE title LIKE ? OR message LIKE ?
        ORDER BY timestamp DESC
        LIMIT ?
      `;
      const notifs = projectState.db.db.prepare(notifsSql).all(searchPattern, searchPattern, limit);
      results.push(...notifs.map(n => ({
        ...n,
        icon: '🔔',
        description: n.subtitle || ''
      })));

      // Sort all results by timestamp desc and limit
      const sortedResults = results
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);

      res.json({
        query,
        results: sortedResults,
        total: sortedResults.length,
        categories: {
          events: events.length,
          conversations: convs.length,
          errors: errors.length,
          notifications: notifs.length
        }
      });
    } catch (error) {
      logger.error('❌ Global search error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
