import { Router } from 'express';
import { logger } from '../utils/logger.js';
import { promises as fsPromises } from 'fs';
import { join } from 'path';

/**
 * Creates changelog routes
 * @param {object} deps - Dependencies
 * @returns {Router} Express router
 */
export function createChangelogRoutes(deps) {
  const router = Router();

  /**
   * GET /api/changelog
   * Parse and return CHANGELOG.md
   */
  router.get('/changelog', async (req, res) => {
    try {
      // Read CHANGELOG.md file
      const changelogPath = join(process.cwd(), '..', 'docs', 'CHANGELOG.md');

      try {
        await fsPromises.access(changelogPath);
      } catch (err) {
        return res.status(404).json({ error: 'CHANGELOG.md not found', changelog: [] });
      }

      const changelogContent = await fsPromises.readFile(changelogPath, 'utf8');

      // Parse the changelog
      const releases = [];
      const lines = changelogContent.split('\n');

      let currentRelease = null;
      let currentSection = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Match version headers: ## [0.8.0] - 2025-10-20
        const versionMatch = line.match(/^##\s+\[([^\]]+)\]\s+-\s+(\d{4}-\d{2}-\d{2})/);
        if (versionMatch) {
          // Save previous release
          if (currentRelease) {
            releases.push(currentRelease);
          }

          // Start new release
          currentRelease = {
            version: versionMatch[1],
            date: versionMatch[2],
            title: null,
            changes: []
          };
          currentSection = null;
          continue;
        }

        // Match section headers: ### Added, ### Fixed, etc.
        const sectionMatch = line.match(/^###\s+(.+)/);
        if (sectionMatch && currentRelease) {
          currentSection = sectionMatch[1].toLowerCase();
          continue;
        }

        // Match bullet points with emoji: - ✨ **Feature Name**
        const bulletMatch = line.match(/^-\s+([🎉✨🐛📝🚀🔒🏗️⚡])\s+(.+)/);
        if (bulletMatch && currentRelease) {
          const emoji = bulletMatch[1];
          const description = bulletMatch[2].replace(/\*\*/g, ''); // Remove bold markdown

          // Map emoji to type
          let type = 'improvement';
          if (emoji === '✨') type = 'feature';
          else if (emoji === '🐛') type = 'fix';
          else if (emoji === '📝') type = 'docs';
          else if (emoji === '🚀' || emoji === '⚡') type = 'improvement';
          else if (emoji === '🔒') type = 'security';
          else if (emoji === '🏗️') type = 'feature';
          else if (emoji === '🎉') type = 'feature';

          currentRelease.changes.push({
            type,
            description
          });
          continue;
        }

        // Match regular bullet points: - Text
        const simpleBulletMatch = line.match(/^-\s+(.+)/);
        if (simpleBulletMatch && currentRelease && currentSection) {
          let description = simpleBulletMatch[1].replace(/\*\*/g, ''); // Remove bold markdown

          // Map section to type
          let type = 'improvement';
          if (currentSection === 'added') type = 'feature';
          else if (currentSection === 'fixed') type = 'fix';
          else if (currentSection === 'changed') type = 'improvement';
          else if (currentSection === 'performance') type = 'improvement';
          else if (currentSection === 'security') type = 'security';

          currentRelease.changes.push({
            type,
            description
          });
        }
      }

      // Don't forget the last release
      if (currentRelease) {
        releases.push(currentRelease);
      }

      res.json(releases);
    } catch (error) {
      logger.error('❌ Changelog error:', error);
      res.status(500).json({ error: error.message, changelog: [] });
    }
  });

  return router;
}
