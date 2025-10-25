import { Router } from 'express';
import { logger } from '../utils/logger.js';
import { join } from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';

/**
 * Creates project management routes
 * @param {object} deps - Dependencies
 * @returns {Router} Express router
 */
export function createProjectRoutes(deps) {
  const router = Router();
  const {
    projectDatabases,
    config,
    projectPaths,
    projectState,
    CONFIG_PATH
  } = deps;

  /**
   * GET /api/projects
   * Get full project configuration with stats
   */
  router.get('/', (req, res) => {
    try {
      // Return full project configuration with stats
      const projectsWithStats = Array.from(projectDatabases.entries()).map(([name, db]) => {
        // Get database stats
        let dbSize = 0;
        let eventCount = 0;

        try {
          const dbPath = join(process.cwd(), '..', '.raven', 'db', `${name}.db`);
          if (fs.existsSync(dbPath)) {
            const stats = fs.statSync(dbPath);
            dbSize = stats.size;
          }

          const countResult = db.db.prepare('SELECT COUNT(*) as count FROM events').get();
          eventCount = countResult.count;
        } catch (err) {
          logger.error(`Error getting stats for ${name}:`, err);
        }

        // Find config from projects.json if it exists
        let projectConfig = {};
        if (config && config.projects && Array.isArray(config.projects)) {
          projectConfig = config.projects.find(p => p.name === name) || {};
        }

        // Get the actual project path
        const projectPath = projectPaths.get(name) || '';

        return {
          name,
          path: projectPath,
          enabled: projectConfig.enabled !== false, // Default to true
          ignorePatterns: projectConfig.ignorePatterns || [],
          maxFileSize: projectConfig.maxFileSize || 10485760,
          retentionDays: projectConfig.retentionDays || 30,
          dbSize,
          eventCount
        };
      });

      // Prevent caching of project configuration
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');

      res.json({
        autoDiscover: config.autoDiscover !== false,
        basePath: config.basePath || join(process.cwd(), '..', '..'),
        projects: projectsWithStats
      });
    } catch (error) {
      logger.error('Error fetching projects config:', error);
      res.status(500).json({ error: 'Failed to fetch projects configuration' });
    }
  });

  /**
   * GET /api/projects/list
   * Get list of available projects
   */
  router.get('/list', (req, res) => {
    try {
      // Return full project objects with name, path, and description
      const projects = projectState.availableProjects.map(p => ({
        name: p.name,
        path: p.path,
        description: p.description || `Project: ${p.name}`
      }));
      res.json({
        projects,
        active: projectState.activeProject
      });
    } catch (error) {
      logger.error('Projects list error:', error);
      res.status(500).json({ error: 'Failed to retrieve projects list' });
    }
  });

  /**
   * POST /api/projects/refresh
   * Refresh/rescan for projects
   */
  router.post('/refresh', async (req, res) => {
    try {
      // Note: All projects are discovered at startup and watched simultaneously.
      // This endpoint returns the current project list (state is not modified).
      const currentProjects = projectState.availableProjects || [];
      const activeProject = projectState.activeProject;

      if (currentProjects.length > 0) {
        logger.info('Projects list refreshed', { projectCount: currentProjects.length });
        res.json({
          success: true,
          projects: currentProjects.map(p => p.name),
          active: activeProject,
          message: `Found ${currentProjects.length} projects`
        });
      } else {
        res.json({
          success: false,
          message: 'No projects found',
          projects: [],
          active: activeProject
        });
      }
    } catch (error) {
      logger.error('Projects refresh error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/projects/select
   * Switch to a different project
   */
  router.post('/select', async (req, res) => {
    try {
      const { project } = req.body;

      if (!project) {
        return res.status(400).json({ error: 'Missing project name' });
      }

      // Validate project exists
      const projectConfig = projectState.availableProjects.find(p => p.name === project);
      if (!projectConfig) {
        return res.status(404).json({ error: `Project "${project}" not found` });
      }

      // Don't switch if already on this project
      if (project === projectState.activeProject) {
        return res.json({
          success: true,
          project,
          message: 'Already on this project'
        });
      }

      // Note: All projects are watched simultaneously in the current architecture.
      // This endpoint just persists the UI preference for which project to display.

      // Persist the active project preference to config file
      try {
        const configContent = await fsPromises.readFile(CONFIG_PATH, 'utf8');
        const updatedConfig = configContent.replace(
          /^active\s*=\s*".*"$/m,
          `active = "${project}"`
        );
        await fsPromises.writeFile(CONFIG_PATH, updatedConfig, 'utf8');
        logger.info(`Persisted active project: ${project}`);
      } catch (configError) {
        logger.error('Failed to persist project selection:', configError.message);
        // Don't fail the request if we can't persist - the switch still worked
      }

      res.json({
        success: true,
        project,
        message: `Switched to project: ${project}`
      });
    } catch (error) {
      logger.error('Project select error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * PUT /api/projects/:name
   * Update project settings (toggle enabled, etc.)
   */
  router.put('/:name', async (req, res) => {
    try {
      const projectName = req.params.name;
      const updates = req.body;

      // Find the project in available projects
      const projectIndex = projectState.availableProjects.findIndex(p => p.name === projectName);

      if (projectIndex === -1) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Update project properties
      projectState.availableProjects[projectIndex] = {
        ...projectState.availableProjects[projectIndex],
        ...updates
      };

      logger.info(`Project ${projectName} updated:`, updates);
      res.json({ success: true, project: projectState.availableProjects[projectIndex] });
    } catch (error) {
      logger.error('Update project error:', error);
      res.status(500).json({ error: 'Failed to update project' });
    }
  });

  /**
   * DELETE /api/projects/:name
   * Remove project from monitoring
   */
  router.delete('/:name', async (req, res) => {
    try {
      const projectName = req.params.name;
      const deleteDb = req.query.deleteDb === 'true';

      // Find the project
      const projectIndex = projectState.availableProjects.findIndex(p => p.name === projectName);

      if (projectIndex === -1) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Remove from available projects
      projectState.availableProjects.splice(projectIndex, 1);

      // If deleting database, remove it
      if (deleteDb) {
        const dbPath = join(process.cwd(), '..', '.raven', 'db', `${projectName}.db`);
        try {
          await fsPromises.unlink(dbPath);
          logger.info(`Deleted database for project: ${projectName}`);
        } catch (err) {
          logger.warn(`Failed to delete database for ${projectName}:`, err);
        }
      }

      // Note: If this was the active project, the UI should handle switching to another project

      logger.info(`Project ${projectName} removed`);
      res.json({ success: true, message: 'Project removed' });
    } catch (error) {
      logger.error('Delete project error:', error);
      res.status(500).json({ error: 'Failed to delete project' });
    }
  });

  return router;
}
