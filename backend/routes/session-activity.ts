/**
 * Session Activity API Routes
 * Reads Claude Code JSONL logs to build a human-readable conversation timeline
 */

import express, { Request, Response } from 'express';
import { promises as fs } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { logger } from '../utils/logger.js';
import { resolveRavenPaths } from '../utils/paths.js';

interface ActivityEntry {
  timestamp: string;
  type: 'user' | 'assistant' | 'tool' | 'subagent';
  content: string;
  metadata?: {
    tool?: string;
    file?: string;
    subagentType?: string;
    model?: string;
  };
}

function getProjectLogDir(): string {
  const projectRoot = resolveRavenPaths().watchPath;
  const encoded = '-' + projectRoot.replace(/^\//, '').replace(/\//g, '-');
  return join(homedir(), '.claude', 'projects', encoded);
}

async function parseSessionLog(filePath: string, limit: number): Promise<ActivityEntry[]> {
  const entries: ActivityEntry[] = [];

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        if (entry.type === 'user' && entry.message) {
          const msg = entry.message;
          let text = '';

          if (typeof msg.content === 'string') {
            text = msg.content;
          } else if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block.type === 'text' && block.text) {
                text += block.text;
              }
            }
          }

          // Skip task notifications and system messages
          if (
            text &&
            !text.startsWith('<task-notification') &&
            !text.startsWith('<system-reminder')
          ) {
            entries.push({
              timestamp: entry.timestamp || '',
              type: 'user',
              content: text.slice(0, 500)
            });
          }
        }

        if (entry.type === 'assistant' && entry.message) {
          const msg = entry.message;
          const content = msg.content || [];

          if (Array.isArray(content)) {
            // Collect text blocks
            const texts: string[] = [];
            const tools: ActivityEntry[] = [];

            for (const block of content) {
              if (block.type === 'text' && block.text?.trim()) {
                texts.push(block.text.trim());
              }

              if (block.type === 'tool_use') {
                const name = block.name || 'Unknown';
                const input = block.input || {};

                // Sub-agent spawns
                if (name === 'Agent') {
                  entries.push({
                    timestamp: entry.timestamp || '',
                    type: 'subagent',
                    content: input.description || 'Sub-agent task',
                    metadata: {
                      subagentType: input.subagent_type,
                      model: input.model
                    }
                  });
                }
                // File operations
                else if (name === 'Write' || name === 'Edit') {
                  tools.push({
                    timestamp: entry.timestamp || '',
                    type: 'tool',
                    content: `${name}: ${input.file_path?.split('/').slice(-2).join('/') || 'file'}`,
                    metadata: { tool: name, file: input.file_path }
                  });
                }
                // Bash commands
                else if (name === 'Bash') {
                  const cmd = (input.command || '').slice(0, 120);
                  tools.push({
                    timestamp: entry.timestamp || '',
                    type: 'tool',
                    content: `Bash: ${cmd}`,
                    metadata: { tool: 'Bash' }
                  });
                }
                // Skip Read, Grep, Glob — they're just research, not actions
              }
            }

            // Add assistant text (combine into one entry)
            if (texts.length > 0) {
              const combined = texts.join('\n\n').slice(0, 1000);
              entries.push({
                timestamp: entry.timestamp || '',
                type: 'assistant',
                content: combined
              });
            }

            // Add tool calls
            entries.push(...tools);
          }
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch (err: any) {
    logger.debug(`Failed to read session log: ${err.message}`);
  }

  // Return most recent entries
  return entries.slice(-limit);
}

export function createSessionActivityRouter() {
  const router = express.Router();

  /**
   * GET /api/session-activity
   * Returns conversation timeline for current or specified session
   */
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 200, 1000);
      const logDir = getProjectLogDir();

      let files: { path: string; mtime: number }[];
      try {
        const dirEntries = (await fs.readdir(logDir)).filter(f => f.endsWith('.jsonl'));
        const stats = await Promise.all(
          dirEntries.map(async f => {
            const path = join(logDir, f);
            const stat = await fs.stat(path);
            return { path, mtime: stat.mtimeMs };
          })
        );
        files = stats.sort((a, b) => b.mtime - a.mtime);
      } catch {
        res.json({ entries: [], sessions: [] });
        return;
      }

      // Parse the most recent session by default
      const sessionId = req.query.session as string;
      let targetFile: string | null = null;

      if (sessionId) {
        targetFile = files.find(f => basename(f.path, '.jsonl') === sessionId)?.path || null;
      } else {
        targetFile = files[0]?.path || null;
      }

      if (!targetFile) {
        res.json({ entries: [], sessions: [] });
        return;
      }

      const entries = await parseSessionLog(targetFile, limit);

      // List available sessions
      const sessions = files.slice(0, 20).map(f => ({
        id: basename(f.path, '.jsonl'),
        lastModified: new Date(f.mtime).toISOString()
      }));

      res.json({
        entries,
        currentSession: basename(targetFile, '.jsonl'),
        sessions
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to read session activity', message: error.message });
    }
  });

  return router;
}
