import { Router } from 'express';
import { join } from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { logger } from '../utils/logger.js';

/**
 * Creates storage management routes
 * @param {object} deps - Dependencies { RAVEN_DIR, projectState }
 * @returns {Router} Express router
 */
export function createStorageRoutes(deps) {
  const router = Router();
  const { RAVEN_DIR, projectState } = deps;

  /**
   * GET /api/storage
   * Get storage statistics for all databases and snapshots
   */
  router.get('/', async (req, res) => {
    try {
      const dbDir = join(RAVEN_DIR, 'db');
      const snapshotsDir = join(RAVEN_DIR, 'snapshots');

      // Get all database files
      const databases = [];
      const dbFiles = fs.readdirSync(dbDir).filter(f => f.endsWith('.db'));

      for (const dbFile of dbFiles) {
        const dbPath = join(dbDir, dbFile);
        const stats = fs.statSync(dbPath);
        const dbName = dbFile.replace('.db', '');

        // Try to get record counts
        let recordCounts = {};
        let tableStats = [];
        try {
          const Database = (await import('better-sqlite3')).default;
          const db = new Database(dbPath, { readonly: true });

          // Get record counts for each table
          const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
          let totalRecords = 0;

          for (const table of tables) {
            const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
            recordCounts[table.name] = count.count;
            totalRecords += count.count;

            // Get table size
            const sizeQuery = db.prepare('SELECT SUM(pgsize) as size FROM dbstat WHERE name = ?').get(table.name);
            tableStats.push({
              name: table.name,
              records: count.count,
              size: sizeQuery?.size || 0
            });
          }

          db.close();

          databases.push({
            name: dbName,
            filename: dbFile,
            size: stats.size,
            totalRecords,
            recordCounts,
            tableStats: tableStats.sort((a, b) => b.size - a.size),
            modified: stats.mtime,
            isActive: dbName === projectState.activeProject
          });
        } catch (err) {
          databases.push({
            name: dbName,
            filename: dbFile,
            size: stats.size,
            totalRecords: 0,
            recordCounts: {},
            tableStats: [],
            modified: stats.mtime,
            isActive: dbName === projectState.activeProject,
            error: 'Failed to read database'
          });
        }
      }

      // Get snapshot directory stats
      const snapshots = [];
      if (fs.existsSync(snapshotsDir)) {
        const snapshotProjects = fs.readdirSync(snapshotsDir);

        for (const project of snapshotProjects) {
          const projectSnapshotPath = join(snapshotsDir, project);
          const stat = fs.statSync(projectSnapshotPath);

          if (stat.isDirectory()) {
            const files = fs.readdirSync(projectSnapshotPath);
            let totalSize = 0;
            let oldestFile = null;
            let newestFile = null;

            for (const file of files) {
              const filePath = join(projectSnapshotPath, file);
              const fileStat = fs.statSync(filePath);
              totalSize += fileStat.size;

              if (!oldestFile || fileStat.mtime < oldestFile) {
                oldestFile = fileStat.mtime;
              }
              if (!newestFile || fileStat.mtime > newestFile) {
                newestFile = fileStat.mtime;
              }
            }

            snapshots.push({
              project,
              files: files.length,
              size: totalSize,
              oldest: oldestFile,
              newest: newestFile
            });
          }
        }
      }

      // Get total .raven directory size
      const getRavenDirSize = (dirPath) => {
        let totalSize = 0;
        const items = fs.readdirSync(dirPath);

        for (const item of items) {
          const itemPath = join(dirPath, item);
          const stat = fs.statSync(itemPath);

          if (stat.isDirectory()) {
            totalSize += getRavenDirSize(itemPath);
          } else {
            totalSize += stat.size;
          }
        }

        return totalSize;
      };

      const totalSize = getRavenDirSize(RAVEN_DIR);

      // Get other files
      const configSize = fs.existsSync(join(RAVEN_DIR, 'config.toml'))
        ? fs.statSync(join(RAVEN_DIR, 'config.toml')).size
        : 0;
      const triggersLogSize = fs.existsSync(join(RAVEN_DIR, 'triggers.log'))
        ? fs.statSync(join(RAVEN_DIR, 'triggers.log')).size
        : 0;

      res.json({
        totalSize,
        databases: databases.sort((a, b) => b.size - a.size),
        snapshots: snapshots.sort((a, b) => b.size - a.size),
        otherFiles: {
          config: configSize,
          triggersLog: triggersLogSize
        },
        ravenDir: RAVEN_DIR,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting storage stats:', error);
      res.status(500).json({ error: 'Failed to get storage statistics' });
    }
  });

  /**
   * GET /api/storage/export/:dbname
   * Export a database file for download
   */
  router.get('/export/:dbname', async (req, res) => {
    try {
      const { dbname } = req.params;

      // Validate database name to prevent path traversal
      if (!dbname || dbname.includes('..') || dbname.includes('/') || !dbname.match(/^[a-zA-Z0-9_-]+$/)) {
        return res.status(400).json({ error: 'Invalid database name' });
      }

      const dbPath = join(RAVEN_DIR, 'db', `${dbname}.db`);

      if (!fs.existsSync(dbPath)) {
        return res.status(404).json({ error: 'Database not found' });
      }

      // Send the file for download
      res.download(dbPath, `${dbname}_${Date.now()}.db`, (err) => {
        if (err) {
          logger.error('Error sending database file:', err);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to export database' });
          }
        }
      });
    } catch (error) {
      logger.error('Error exporting database:', error);
      res.status(500).json({ error: 'Failed to export database' });
    }
  });

  /**
   * POST /api/storage/vacuum/:dbname
   * Run VACUUM on a database to optimize storage
   */
  router.post('/vacuum/:dbname', async (req, res) => {
    try {
      const { dbname } = req.params;

      // Validate database name
      if (!dbname || dbname.includes('..') || dbname.includes('/') || !dbname.match(/^[a-zA-Z0-9_-]+$/)) {
        return res.status(400).json({ error: 'Invalid database name' });
      }

      const dbPath = join(RAVEN_DIR, 'db', `${dbname}.db`);

      if (!fs.existsSync(dbPath)) {
        return res.status(404).json({ error: 'Database not found' });
      }

      // Get size before VACUUM
      const statsBefore = fs.statSync(dbPath);
      const sizeBefore = statsBefore.size;

      // Run VACUUM
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(dbPath);
      db.pragma('wal_checkpoint(TRUNCATE)'); // Checkpoint WAL first
      db.exec('VACUUM');
      db.close();

      // Get size after VACUUM
      const statsAfter = fs.statSync(dbPath);
      const sizeAfter = statsAfter.size;
      const spaceSaved = sizeBefore - sizeAfter;

      res.json({
        success: true,
        message: 'Database optimized successfully',
        sizeBefore,
        sizeAfter,
        spaceSaved,
        percentSaved: sizeBefore > 0 ? ((spaceSaved / sizeBefore) * 100).toFixed(2) : 0
      });
    } catch (error) {
      logger.error('Error running VACUUM:', error);
      res.status(500).json({ error: 'Failed to optimize database: ' + error.message });
    }
  });

  /**
   * POST /api/storage/clean/:dbname
   * Clean old data from database
   */
  router.post('/clean/:dbname', async (req, res) => {
    try {
      const { dbname } = req.params;
      const { days } = req.body;

      // Validate database name
      if (!dbname || dbname.includes('..') || dbname.includes('/') || !dbname.match(/^[a-zA-Z0-9_-]+$/)) {
        return res.status(400).json({ error: 'Invalid database name' });
      }

      // Validate days
      const daysNum = parseInt(days);
      if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) {
        return res.status(400).json({ error: 'Days must be between 1 and 365' });
      }

      const dbPath = join(RAVEN_DIR, 'db', `${dbname}.db`);

      if (!fs.existsSync(dbPath)) {
        return res.status(404).json({ error: 'Database not found' });
      }

      // Calculate cutoff timestamp
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysNum);
      const cutoffTimestamp = cutoffDate.toISOString();

      const Database = (await import('better-sqlite3')).default;
      const db = new Database(dbPath);

      let totalDeleted = 0;
      const deletedPerTable = {};

      // Get all tables
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();

      // Delete old records from each table that has a timestamp column
      for (const table of tables) {
        const tableInfo = db.prepare(`PRAGMA table_info(${table.name})`).all();
        const hasTimestamp = tableInfo.some(col => col.name === 'timestamp' || col.name === 'created_at');

        if (hasTimestamp) {
          const timestampCol = tableInfo.find(col => col.name === 'timestamp' || col.name === 'created_at').name;

          // Count records before deletion
          const countBefore = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get().count;

          // Delete old records
          const deleteStmt = db.prepare(`DELETE FROM ${table.name} WHERE ${timestampCol} < ?`);
          const result = deleteStmt.run(cutoffTimestamp);

          const deleted = result.changes;
          if (deleted > 0) {
            deletedPerTable[table.name] = deleted;
            totalDeleted += deleted;
          }
        }
      }

      db.close();

      res.json({
        success: true,
        message: `Deleted ${totalDeleted} records older than ${daysNum} days`,
        totalDeleted,
        deletedPerTable,
        cutoffDate: cutoffTimestamp
      });
    } catch (error) {
      logger.error('Error cleaning old data:', error);
      res.status(500).json({ error: 'Failed to clean old data: ' + error.message });
    }
  });

  /**
   * GET /api/storage/retention
   * Get retention policy configuration
   */
  router.get('/retention', async (req, res) => {
    try {
      const retentionPath = join(RAVEN_DIR, 'retention-policy.json');

      try {
        await fsPromises.access(retentionPath);
      } catch (err) {
        // Return default policy if file doesn't exist
        return res.json({
          enabled: false,
          retentionDays: 30,
          autoCleanup: false,
          cleanupInterval: 'weekly'
        });
      }

      const data = await fsPromises.readFile(retentionPath, 'utf-8');
      const policy = JSON.parse(data);
      res.json(policy);
    } catch (error) {
      logger.error('Error reading retention policy:', error);
      res.status(500).json({ error: 'Failed to read retention policy' });
    }
  });

  /**
   * POST /api/storage/retention
   * Save retention policy configuration
   */
  router.post('/retention', async (req, res) => {
    try {
      const policy = req.body;

      // Validate policy
      if (typeof policy.enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
      }

      const days = parseInt(policy.retentionDays);
      if (isNaN(days) || days < 1 || days > 365) {
        return res.status(400).json({ error: 'retentionDays must be between 1 and 365' });
      }

      const validIntervals = ['daily', 'weekly', 'monthly'];
      if (!validIntervals.includes(policy.cleanupInterval)) {
        return res.status(400).json({ error: 'cleanupInterval must be daily, weekly, or monthly' });
      }

      const retentionPath = join(RAVEN_DIR, 'retention-policy.json');
      await fsPromises.writeFile(retentionPath, JSON.stringify(policy, null, 2));

      res.json({
        success: true,
        message: 'Retention policy saved successfully',
        policy
      });
    } catch (error) {
      logger.error('Error saving retention policy:', error);
      res.status(500).json({ error: 'Failed to save retention policy' });
    }
  });

  return router;
}
