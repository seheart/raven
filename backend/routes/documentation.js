import { Router } from 'express';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { join, normalize } from 'path';

/**
 * Creates documentation routes
 * @param {object} deps - Dependencies
 * @returns {Router} Express router
 */
export function createDocumentationRoutes(deps) {
  const router = Router();

  /**
   * GET /api/docs/list
   * List all available documentation files
   */
  router.get('/docs/list', (req, res) => {
    try {
      const docsDir = join(process.cwd(), '..', 'docs');

      const getMarkdownFiles = (dir, baseDir = dir) => {
        const files = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);

          if (entry.isDirectory()) {
            // Recursively get files from subdirectories
            files.push(...getMarkdownFiles(fullPath, baseDir));
          } else if (entry.name.endsWith('.md')) {
            // Get relative path from docs directory
            const relativePath = fullPath.replace(baseDir + '/', '');
            files.push({
              path: relativePath,
              name: entry.name,
              title: entry.name.replace(/\.md$/, ''),
              category: relativePath.includes('/') ? relativePath.split('/')[0] : 'root'
            });
          }
        }

        return files;
      };

      const docs = getMarkdownFiles(docsDir);

      // Organize by category
      const organized = {
        root: [],
        api: [],
        guides: [],
        other: []
      };

      docs.forEach(doc => {
        if (doc.category === 'root') {
          organized.root.push(doc);
        } else if (doc.category === 'api') {
          organized.api.push(doc);
        } else {
          organized.other.push(doc);
        }
      });

      res.json({
        total: docs.length,
        docs: organized,
        all: docs
      });
    } catch (error) {
      logger.error('❌ Documentation list error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/docs/:filepath(*)
   * Get a specific documentation file
   */
  router.get('/docs/:filepath(*)', async (req, res) => {
    try {
      const { filepath } = req.params;

      // Security: only allow .md files in docs/ directory
      if (!filepath.endsWith('.md')) {
        return res.status(400).json({ error: 'Only markdown files allowed' });
      }

      // Security: Prevent path traversal attacks
      const docsDir = normalize(join(process.cwd(), '..', 'docs'));
      const docsPath = normalize(join(process.cwd(), '..', 'docs', filepath));

      // Ensure the resolved path is still within the docs directory
      if (!docsPath.startsWith(docsDir)) {
        return res.status(403).json({ error: 'Access denied: Path traversal attempt detected' });
      }

      // Check if file exists
      try {
        await fsPromises.access(docsPath);
      } catch (err) {
        return res.status(404).json({ error: 'Documentation file not found' });
      }

      // Read markdown file
      const markdown = await fsPromises.readFile(docsPath, 'utf8');

      res.json({
        filepath,
        markdown,
        title: filepath.replace(/\.md$/, '').replace(/\//g, ' / ')
      });
    } catch (error) {
      logger.error('❌ Documentation error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
