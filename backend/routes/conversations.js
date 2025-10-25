import { Router } from 'express';
import fs from 'fs';
import readline from 'readline';
import path from 'path';
import os from 'os';

/**
 * Creates conversation routes (Claude Code conversation tracking)
 * @param {object} deps - Dependencies
 * @returns {Router} Express router
 */
export function createConversationRoutes(deps) {
  const router = Router();
  const { projectDatabases, projectState } = deps;

  // Helper to get raven database (where conversations are stored)
  const getRavenDb = () => {
    const ravenDb = projectDatabases.get('raven');
    if (!ravenDb) {
      throw new Error('Raven database not found');
    }
    return ravenDb;
  };

  // GET /api/conversations - Get conversations with filtering
  router.get('/conversations', (req, res) => {
    try {
      const {
        limit = 100,
        offset = 0,
        event_type = 'all',
        project = 'all',
        claude_session_id = null
      } = req.query;

      const options = {
        limit: parseInt(limit),
        offset: parseInt(offset),
        event_type,
        project,
        claude_session_id
      };

      const result = getRavenDb().getConversations(options);
      res.json(result);
    } catch (error) {
      console.error('❌ Get conversations error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/conversations/stats - Get conversation statistics
  router.get('/conversations/stats', (req, res) => {
    try {
      const stats = getRavenDb().getConversationStats();
      res.json(stats);
    } catch (error) {
      console.error('❌ Conversation stats error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/conversations/session/:sessionId - Get conversations by session
  router.get('/conversations/session/:sessionId', (req, res) => {
    try {
      const { sessionId } = req.params;
      const limit = parseInt(req.query.limit) || 500;

      const conversations = getRavenDb().getConversationsBySession(sessionId, limit);
      res.json({ conversations, total: conversations.length });
    } catch (error) {
      console.error('❌ Get session conversations error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/conversations/import - Import conversations from Claude session file
  router.post('/conversations/import', async (req, res) => {
    try {
      const { sessionFile, project } = req.body;

      if (!sessionFile) {
        return res.status(400).json({ error: 'sessionFile path required' });
      }

      // Default to user's .claude directory if no path provided
      const sessionPath = sessionFile.startsWith('/')
        ? sessionFile
        : path.join(os.homedir(), '.claude/projects/-home-seth', sessionFile);

      if (!fs.existsSync(sessionPath)) {
        return res.status(404).json({ error: 'Session file not found' });
      }

      const imported = await importSessionFile(sessionPath, project, projectState.db);

      res.json({
        success: true,
        imported,
        sessionFile: path.basename(sessionPath)
      });
    } catch (error) {
      console.error('❌ Import conversations error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

/**
 * Import conversations from Claude Code session .jsonl file
 * @param {string} sessionPath - Path to session .jsonl file
 * @param {string} project - Project name
 * @param {object} db - Database instance
 * @returns {Promise<object>} Import statistics
 */
async function importSessionFile(sessionPath, project, db) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(sessionPath),
      crlfDelay: Infinity
    });

    let stats = {
      userMessages: 0,
      assistantMessages: 0,
      toolCalls: 0,
      toolResults: 0,
      total: 0
    };

    let sessionId = null;

    rl.on('line', (line) => {
      try {
        const entry = JSON.parse(line);

        // Skip summaries and file snapshots
        if (entry.type === 'summary' || entry.type === 'file-history-snapshot') {
          return;
        }

        // Extract session ID from first real entry
        if (!sessionId && entry.sessionId) {
          sessionId = entry.sessionId;
        }

        const timestamp = entry.timestamp || new Date().toISOString();
        const parentUuid = entry.parentUuid || null;
        const cwd = entry.cwd || project;

        // User message
        if (entry.type === 'user' && entry.message?.role === 'user') {
          const content = entry.message.content;

          // Check if it's a tool result
          if (Array.isArray(content) && content[0]?.type === 'tool_result') {
            const result = content[0];
            const output = typeof result.content === 'string'
              ? result.content.substring(0, 5000) // Truncate long outputs
              : JSON.stringify(result.content).substring(0, 5000);

            db.insertConversation(
              timestamp,
              sessionId,
              'tool_result',
              null,
              null,
              null,
              output,
              result.is_error || false,
              parentUuid,
              { tool_use_id: result.tool_use_id },
              cwd,
              null
            );

            stats.toolResults++;
            stats.total++;
          } else {
            // Regular user message
            db.insertConversation(
              timestamp,
              sessionId,
              'user_message',
              typeof content === 'string' ? content : JSON.stringify(content),
              null,
              null,
              null,
              false,
              parentUuid,
              null,
              cwd,
              null
            );

            stats.userMessages++;
            stats.total++;
          }
        }

        // Assistant message
        if (entry.type === 'assistant' && entry.message?.content) {
          const content = entry.message.content;

          content.forEach(block => {
            if (block.type === 'text') {
              db.insertConversation(
                timestamp,
                sessionId,
                'assistant_text',
                block.text,
                null,
                null,
                null,
                false,
                parentUuid,
                null,
                cwd,
                null
              );

              stats.assistantMessages++;
              stats.total++;
            } else if (block.type === 'tool_use') {
              db.insertConversation(
                timestamp,
                sessionId,
                'tool_call',
                null,
                block.name,
                block.input,
                null,
                false,
                parentUuid,
                { id: block.id },
                cwd,
                null
              );

              stats.toolCalls++;
              stats.total++;
            }
          });
        }
      } catch (err) {
        // Skip malformed lines
        console.warn('Skipping malformed line:', err.message);
      }
    });

    rl.on('close', () => {
      resolve(stats);
    });

    rl.on('error', (err) => {
      reject(err);
    });
  });
}
