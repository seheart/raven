/**
 * Corvus v2.0.1 Tier 4 API Routes
 *
 * Features:
 * - Health Scoring
 * - Drift Detection
 * - Productivity Insights
 * - Claude Personality Analysis
 * - Growth Tracking & Charts
 * - GitHub Integration
 * - Discord Integration
 * - Slack Integration
 */

import express from 'express';
import { logger } from '../utils/logger.js';

export function createCorvusV2Tier4Routes({ projectDatabases }) {
  const router = express.Router();

  // Helper to get project database
  const getProjectDb = projectName => {
    if (!projectDatabases.has(projectName)) {
      throw new Error(`Project database not found: ${projectName}`);
    }
    return projectDatabases.get(projectName);
  };

  // Input validation helpers
  const validateDays = (days, min = 1, max = 365) => {
    const parsed = parseInt(days);
    if (isNaN(parsed) || parsed < min || parsed > max) {
      throw new Error(`Invalid days parameter: must be between ${min} and ${max}`);
    }
    return parsed;
  };

  const validateHours = (hours, min = 1, max = 720) => {
    const parsed = parseInt(hours);
    if (isNaN(parsed) || parsed < min || parsed > max) {
      throw new Error(`Invalid hours parameter: must be between ${min} and ${max}`);
    }
    return parsed;
  };

  const validateAgent = agent => {
    // Basic sanitization - alphanumeric and hyphens only
    if (!agent || !/^[a-zA-Z0-9-_]+$/.test(agent)) {
      throw new Error('Invalid agent parameter: must be alphanumeric with hyphens/underscores');
    }
    return agent;
  };

  const validateMetric = metric => {
    const validMetrics = ['all', 'activity', 'quality', 'health', 'velocity'];
    if (!validMetrics.includes(metric)) {
      throw new Error(`Invalid metric parameter: must be one of ${validMetrics.join(', ')}`);
    }
    return metric;
  };

  const validateSeverity = severity => {
    if (severity) {
      const validSeverities = ['critical', 'high', 'medium', 'low', 'info'];
      if (!validSeverities.includes(severity)) {
        throw new Error(`Invalid severity parameter: must be one of ${validSeverities.join(', ')}`);
      }
    }
    return severity;
  };

  // ==================== HEALTH SCORING ROUTES ====================

  /**
   * Calculate current health score
   */
  router.post('/health/calculate', async (req, res) => {
    try {
      const { project } = req.query;
      const projectDb = getProjectDb(project || 'raven');

      const healthScore = await projectDb.healthScoring.calculateHealthScore();

      res.json({ healthScore, project });
    } catch (error) {
      logger.error('Failed to calculate health score', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get health score history
   */
  router.get('/health/history', async (req, res) => {
    try {
      const { project, days = 30 } = req.query;
      const projectDb = getProjectDb(project || 'raven');
      const validDays = validateDays(days);

      const history = projectDb.healthScoring.getHealthHistory(validDays);

      res.json({ history, project, days: validDays });
    } catch (error) {
      logger.error('Failed to get health history', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get latest health score
   */
  router.get('/health/latest', async (req, res) => {
    try {
      const { project } = req.query;
      const projectDb = getProjectDb(project || 'raven');

      const score = projectDb.healthScoring.getLatestScore();

      res.json({ score, project });
    } catch (error) {
      logger.error('Failed to get latest health score', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== DRIFT DETECTION ROUTES ====================

  /**
   * Run drift detection
   */
  router.post('/drift/detect', async (req, res) => {
    try {
      const { project } = req.query;
      const projectDb = getProjectDb(project || 'raven');

      const drifts = await projectDb.driftDetection.detectAllDrifts();

      res.json({ drifts, count: drifts.length, project });
    } catch (error) {
      logger.error('Failed to detect drifts', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get recent drift events
   */
  router.get('/drift/recent', async (req, res) => {
    try {
      const { project, hours = 24, severity } = req.query;
      const projectDb = getProjectDb(project || 'raven');
      const validHours = validateHours(hours);
      const validSeverity = validateSeverity(severity);

      const drifts = projectDb.driftDetection.getRecentDrifts(validHours, validSeverity || null);

      res.json({ drifts, count: drifts.length, project });
    } catch (error) {
      logger.error('Failed to get recent drifts', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Resolve a drift event
   */
  router.post('/drift/:driftId/resolve', async (req, res) => {
    try {
      const { project } = req.query;
      const { driftId } = req.params;
      const projectDb = getProjectDb(project || 'raven');

      const result = projectDb.driftDetection.resolveDrift(parseInt(driftId));

      res.json({ success: result, driftId, project });
    } catch (error) {
      logger.error('Failed to resolve drift', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get drift summary
   */
  router.get('/drift/summary', async (req, res) => {
    try {
      const { project, days = 7 } = req.query;
      const projectDb = getProjectDb(project || 'raven');
      const validDays = validateDays(days);

      const summary = projectDb.driftDetection.getDriftSummary(validDays);

      res.json({ summary, project });
    } catch (error) {
      logger.error('Failed to get drift summary', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== PRODUCTIVITY INSIGHTS ROUTES ====================

  /**
   * Calculate productivity insights
   */
  router.post('/productivity/calculate', async (req, res) => {
    try {
      const { project, days = 30 } = req.query;
      const projectDb = getProjectDb(project || 'raven');
      const validDays = validateDays(days);

      const insights = await projectDb.productivityInsights.calculateInsights(validDays);

      res.json({ insights, project });
    } catch (error) {
      logger.error('Failed to calculate productivity insights', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get productivity history
   */
  router.get('/productivity/history', async (req, res) => {
    try {
      const { project, days = 30 } = req.query;
      const projectDb = getProjectDb(project || 'raven');
      const validDays = validateDays(days);

      const history = projectDb.productivityInsights.getProductivityHistory(validDays);

      res.json({ history, project });
    } catch (error) {
      logger.error('Failed to get productivity history', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get latest productivity metrics
   */
  router.get('/productivity/latest', async (req, res) => {
    try {
      const { project } = req.query;
      const projectDb = getProjectDb(project || 'raven');

      const metrics = projectDb.productivityInsights.getLatestMetrics();

      res.json({ metrics, project });
    } catch (error) {
      logger.error('Failed to get latest productivity metrics', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== CLAUDE PERSONALITY ROUTES ====================

  /**
   * Analyze agent personality
   */
  router.post('/personality/analyze', async (req, res) => {
    try {
      const { project, agent = 'claude', days = 30 } = req.query;
      const projectDb = getProjectDb(project || 'raven');
      const validAgent = validateAgent(agent);
      const validDays = validateDays(days);

      const personality = await projectDb.claudePersonalityAnalyzer.analyzePersonality(
        validAgent,
        validDays
      );

      res.json({ personality, project });
    } catch (error) {
      logger.error('Failed to analyze personality', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get personality history
   */
  router.get('/personality/history', async (req, res) => {
    try {
      const { project, agent = 'claude', days = 90 } = req.query;
      const projectDb = getProjectDb(project || 'raven');
      const validAgent = validateAgent(agent);
      const validDays = validateDays(days);

      const history = projectDb.claudePersonalityAnalyzer.getPersonalityHistory(
        validAgent,
        validDays
      );

      res.json({ history, agent: validAgent, project });
    } catch (error) {
      logger.error('Failed to get personality history', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get latest personality profile
   */
  router.get('/personality/latest', async (req, res) => {
    try {
      const { project, agent = 'claude' } = req.query;
      const projectDb = getProjectDb(project || 'raven');
      const validAgent = validateAgent(agent);

      const profile = projectDb.claudePersonalityAnalyzer.getLatestProfile(validAgent);

      res.json({ profile, agent: validAgent, project });
    } catch (error) {
      logger.error('Failed to get latest personality profile', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== GROWTH TRACKING ROUTES ====================

  /**
   * Create growth snapshot
   */
  router.post('/growth/snapshot', async (req, res) => {
    try {
      const { project } = req.query;
      const projectDb = getProjectDb(project || 'raven');

      const snapshot = await projectDb.growthTracker.createSnapshot();

      res.json({ snapshot, project });
    } catch (error) {
      logger.error('Failed to create growth snapshot', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get growth time series for charts
   */
  router.get('/growth/timeseries', async (req, res) => {
    try {
      const { project, days = 30, metric = 'all' } = req.query;
      const projectDb = getProjectDb(project || 'raven');
      const validDays = validateDays(days);
      const validMetric = validateMetric(metric);

      const timeSeries = projectDb.growthTracker.getGrowthTimeSeries(validDays, validMetric);

      res.json({ timeSeries, project, days: validDays, metric: validMetric });
    } catch (error) {
      logger.error('Failed to get growth time series', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get growth comparison
   */
  router.get('/growth/comparison', async (req, res) => {
    try {
      const { project, period1 = 7, period2 = 14 } = req.query;
      const projectDb = getProjectDb(project || 'raven');
      const validPeriod1 = validateDays(period1);
      const validPeriod2 = validateDays(period2);

      const comparison = projectDb.growthTracker.getGrowthComparison(validPeriod1, validPeriod2);

      res.json({ comparison, project });
    } catch (error) {
      logger.error('Failed to get growth comparison', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get growth milestones
   */
  router.get('/growth/milestones', async (req, res) => {
    try {
      const { project, days = 90 } = req.query;
      const projectDb = getProjectDb(project || 'raven');
      const validDays = validateDays(days);

      const milestones = projectDb.growthTracker.getMilestones(validDays);

      res.json({ milestones, project });
    } catch (error) {
      logger.error('Failed to get milestones', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get growth summary
   */
  router.get('/growth/summary', async (req, res) => {
    try {
      const { project, days = 30 } = req.query;
      const projectDb = getProjectDb(project || 'raven');
      const validDays = validateDays(days);

      const summary = projectDb.growthTracker.getGrowthSummary(validDays);

      res.json({ summary, project });
    } catch (error) {
      logger.error('Failed to get growth summary', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get snapshot history
   */
  router.get('/growth/history', async (req, res) => {
    try {
      const { project, days = 30 } = req.query;
      const projectDb = getProjectDb(project || 'raven');
      const validDays = validateDays(days);

      const history = projectDb.growthTracker.getSnapshotHistory(validDays);

      res.json({ history, project });
    } catch (error) {
      logger.error('Failed to get snapshot history', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== GITHUB INTEGRATION ROUTES ====================

  /**
   * Configure GitHub integration
   */
  router.post('/integrations/github/configure', async (req, res) => {
    try {
      const { project } = req.query;
      const { token, owner, repo, apiUrl } = req.body;
      const projectDb = getProjectDb(project || 'raven');

      const result = await projectDb.githubIntegration.configure({
        token,
        owner,
        repo,
        apiUrl
      });

      res.json({ result, project });
    } catch (error) {
      logger.error('Failed to configure GitHub integration', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Test GitHub connection
   */
  router.get('/integrations/github/test', async (req, res) => {
    try {
      const { project } = req.query;
      const projectDb = getProjectDb(project || 'raven');

      const result = await projectDb.githubIntegration.testConnection();

      res.json({ result, project });
    } catch (error) {
      logger.error('Failed to test GitHub connection', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Post health score to GitHub
   */
  router.post('/integrations/github/post-health', async (req, res) => {
    try {
      const { project } = req.query;
      const projectDb = getProjectDb(project || 'raven');

      const healthScore = await projectDb.healthScoring.calculateHealthScore();
      const comment = await projectDb.githubIntegration.postHealthScoreComment(healthScore);

      res.json({ success: !!comment, comment, project });
    } catch (error) {
      logger.error('Failed to post health score to GitHub', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Disable GitHub integration
   */
  router.post('/integrations/github/disable', async (req, res) => {
    try {
      const { project } = req.query;
      const projectDb = getProjectDb(project || 'raven');

      const result = await projectDb.githubIntegration.disable();

      res.json({ result, project });
    } catch (error) {
      logger.error('Failed to disable GitHub integration', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get GitHub integration events
   */
  router.get('/integrations/github/events', async (req, res) => {
    try {
      const { project, hours = 24 } = req.query;
      const projectDb = getProjectDb(project || 'raven');
      const validHours = validateHours(hours);

      const events = projectDb.githubIntegration.getRecentEvents(validHours);

      res.json({ events, project });
    } catch (error) {
      logger.error('Failed to get GitHub events', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== DISCORD INTEGRATION ROUTES ====================

  /**
   * Configure Discord integration
   */
  router.post('/integrations/discord/configure', async (req, res) => {
    try {
      const { project } = req.query;
      const { webhookUrl, username, avatarUrl } = req.body;
      const projectDb = getProjectDb(project || 'raven');

      const result = await projectDb.discordIntegration.configure({
        webhookUrl,
        username,
        avatarUrl
      });

      res.json({ result, project });
    } catch (error) {
      logger.error('Failed to configure Discord integration', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Test Discord connection
   */
  router.get('/integrations/discord/test', async (req, res) => {
    try {
      const { project } = req.query;
      const projectDb = getProjectDb(project || 'raven');

      const result = await projectDb.discordIntegration.testConnection();

      res.json({ result, project });
    } catch (error) {
      logger.error('Failed to test Discord connection', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Send health score to Discord
   */
  router.post('/integrations/discord/send-health', async (req, res) => {
    try {
      const { project } = req.query;
      const projectDb = getProjectDb(project || 'raven');

      const healthScore = await projectDb.healthScoring.calculateHealthScore();
      const result = await projectDb.discordIntegration.sendHealthScore(healthScore);

      res.json({ result, project });
    } catch (error) {
      logger.error('Failed to send health score to Discord', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Disable Discord integration
   */
  router.post('/integrations/discord/disable', async (req, res) => {
    try {
      const { project } = req.query;
      const projectDb = getProjectDb(project || 'raven');

      const result = await projectDb.discordIntegration.disable();

      res.json({ result, project });
    } catch (error) {
      logger.error('Failed to disable Discord integration', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get Discord integration events
   */
  router.get('/integrations/discord/events', async (req, res) => {
    try {
      const { project, hours = 24 } = req.query;
      const projectDb = getProjectDb(project || 'raven');
      const validHours = validateHours(hours);

      const events = projectDb.discordIntegration.getRecentEvents(validHours);

      res.json({ events, project });
    } catch (error) {
      logger.error('Failed to get Discord events', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== SLACK INTEGRATION ROUTES ====================

  /**
   * Configure Slack integration
   */
  router.post('/integrations/slack/configure', async (req, res) => {
    try {
      const { project } = req.query;
      const { webhookUrl, channel, username, iconEmoji } = req.body;
      const projectDb = getProjectDb(project || 'raven');

      const result = await projectDb.slackIntegration.configure({
        webhookUrl,
        channel,
        username,
        iconEmoji
      });

      res.json({ result, project });
    } catch (error) {
      logger.error('Failed to configure Slack integration', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Test Slack connection
   */
  router.get('/integrations/slack/test', async (req, res) => {
    try {
      const { project } = req.query;
      const projectDb = getProjectDb(project || 'raven');

      const result = await projectDb.slackIntegration.testConnection();

      res.json({ result, project });
    } catch (error) {
      logger.error('Failed to test Slack connection', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Send health score to Slack
   */
  router.post('/integrations/slack/send-health', async (req, res) => {
    try {
      const { project } = req.query;
      const projectDb = getProjectDb(project || 'raven');

      const healthScore = await projectDb.healthScoring.calculateHealthScore();
      const result = await projectDb.slackIntegration.sendHealthScore(healthScore);

      res.json({ result, project });
    } catch (error) {
      logger.error('Failed to send health score to Slack', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Disable Slack integration
   */
  router.post('/integrations/slack/disable', async (req, res) => {
    try {
      const { project } = req.query;
      const projectDb = getProjectDb(project || 'raven');

      const result = await projectDb.slackIntegration.disable();

      res.json({ result, project });
    } catch (error) {
      logger.error('Failed to disable Slack integration', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get Slack integration events
   */
  router.get('/integrations/slack/events', async (req, res) => {
    try {
      const { project, hours = 24 } = req.query;
      const projectDb = getProjectDb(project || 'raven');
      const validHours = validateHours(hours);

      const events = projectDb.slackIntegration.getRecentEvents(validHours);

      res.json({ events, project });
    } catch (error) {
      logger.error('Failed to get Slack events', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
