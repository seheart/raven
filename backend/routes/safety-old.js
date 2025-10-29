import { Router } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Creates safety-related routes (errors, syntax checking, tests, pause/resume, pattern warnings)
 * @param {object} deps - Dependencies { projectState, io, SESSION_ID }
 * @returns {Router} Express router
 */
export function createSafetyRoutes(deps) {
  const router = Router();
  const { projectState, io, SESSION_ID } = deps;

  /**
   * POST /api/errors
   * Log frontend errors to database and emit WebSocket events
   */
  router.post('/errors', (req, res) => {
    try {
      const {
        error_type,
        message,
        stack,
        component,
        user_agent,
        url,
        metadata,
        severity
      } = req.body;

      // Validate required fields
      if (!error_type || !message) {
        return res.status(400).json({ error: 'Missing required fields: error_type, message' });
      }

      const timestamp = new Date().toISOString();

      // Insert into database
      const errorId = projectState.db.insertErrorLog(
        timestamp,
        error_type,
        message,
        stack,
        component,
        user_agent,
        url,
        metadata,
        SESSION_ID,
        severity || 'error'
      );

      logger.error(`Error logged: ${error_type} - ${message}`, {
        component,
        error_id: errorId
      });

      // Create notification for errors (not warnings or info)
      if (severity === 'error' || !severity) {
        const notificationId = projectState.db.insertNotification(
          timestamp,
          'error',
          'critical',
          `${error_type}: ${message.substring(0, 80)}`,
          message,
          { component, error_id: errorId, stack: stack?.substring(0, 500) },
          SESSION_ID
        );

        io.emit('notification', {
          id: notificationId,
          timestamp,
          type: 'error',
          severity: 'critical',
          title: `${error_type}: ${message.substring(0, 80)}`,
          message,
          read: false,
          metadata: { component, error_id: errorId }
        });
      }

      // Emit real-time event via WebSocket
      io.emit('error-logged', {
        id: errorId,
        timestamp,
        error_type,
        message,
        component,
        severity: severity || 'error'
      });

      res.json({
        success: true,
        error_id: errorId
      });
    } catch (error) {
      logger.error('Error logging endpoint error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Stub Endpoints (Features Not Yet Implemented) ====================
  // These endpoints return placeholder data to prevent 404 errors in the frontend
  // Features not available in JavaScript version - stubs for Python compatibility

  /**
   * GET /api/syntax-errors
   * Get syntax errors (stub - not implemented in JS version)
   */
  router.get('/syntax-errors', (req, res) => {
    res.json({ errors: [], count: 0, message: 'Syntax checking not available in JavaScript version' });
  });

  /**
   * GET /api/syntax-errors/count
   * Get syntax error count (stub - not implemented in JS version)
   */
  router.get('/syntax-errors/count', (req, res) => {
    res.json({ count: 0 });
  });

  /**
   * POST /api/syntax-errors/:errorId/resolve
   * Resolve a syntax error (stub - not implemented in JS version)
   */
  router.post('/syntax-errors/:errorId/resolve', (req, res) => {
    res.status(501).json({ error: 'Syntax error resolution not available in JavaScript version' });
  });

  /**
   * GET /api/tests/frameworks
   * Get available test frameworks (stub - not implemented in JS version)
   */
  router.get('/tests/frameworks', (req, res) => {
    res.json({ frameworks: [], message: 'Test runner not available in JavaScript version' });
  });

  /**
   * GET /api/tests/results
   * Get test results (stub - not implemented in JS version)
   */
  router.get('/tests/results', (req, res) => {
    res.json({ results: [], total: 0 });
  });

  /**
   * POST /api/tests/run
   * Run tests (stub - not implemented in JS version)
   */
  router.post('/tests/run', (req, res) => {
    res.status(501).json({ error: 'Test running not available in JavaScript version' });
  });

  /**
   * GET /api/pause/status
   * Get pause status (stub - not implemented in JS version)
   */
  router.get('/pause/status', (req, res) => {
    res.json({ paused: false, message: 'Pause feature not available in JavaScript version' });
  });

  /**
   * POST /api/pause
   * Pause monitoring (stub - not implemented in JS version)
   */
  router.post('/pause', (req, res) => {
    res.status(501).json({ error: 'Pause feature not available in JavaScript version' });
  });

  /**
   * POST /api/resume
   * Resume monitoring (stub - not implemented in JS version)
   */
  router.post('/resume', (req, res) => {
    res.status(501).json({ error: 'Resume feature not available in JavaScript version' });
  });

  /**
   * GET /api/pattern-warnings
   * Get pattern warnings (stub - not implemented in JS version)
   */
  router.get('/pattern-warnings', (req, res) => {
    res.json({ warnings: [], count: 0, message: 'Pattern warnings not available in JavaScript version' });
  });

  /**
   * GET /api/pattern-warnings/category/:category
   * Get pattern warnings by category (stub - not implemented in JS version)
   */
  router.get('/pattern-warnings/category/:category', (req, res) => {
    res.json({ warnings: [], count: 0, category: req.params.category });
  });

  /**
   * POST /api/pattern-warnings/:warningId/resolve
   * Resolve a pattern warning (stub - not implemented in JS version)
   */
  router.post('/pattern-warnings/:warningId/resolve', (req, res) => {
    res.status(501).json({ error: 'Pattern warnings not available in JavaScript version' });
  });

  /**
   * GET /api/alerts/templates
   * Get alert templates (stub - not implemented in JS version)
   */
  router.get('/alerts/templates', (req, res) => {
    res.json({ templates: [] });
  });

  return router;
}
