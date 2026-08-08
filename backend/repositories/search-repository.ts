/**
 * Search Repository — global cross-table search.
 *
 * Owns the queries that span multiple tables (events, conversations,
 * app_errors / error_logs, notifications). Tolerates missing tables so the
 * route works on partial schemas.
 */

import type { RavenDB } from '../db.js';

export interface SearchResultItem {
  type: 'event' | 'agent' | 'conversation' | 'error' | 'notification';
  id: number;
  title: string;
  description: string;
  timestamp: string;
  project_name?: string | null;
  agent?: string | null;
  message?: string | null;
  icon: string;
}

export interface SearchRepository {
  globalSearch(query: string, limit: number): SearchResultItem[];
}

function tableExists(db: RavenDB, name: string, cache: Map<string, boolean>): boolean {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  const row = db.db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1`)
    .get(name);
  const exists = !!row;
  cache.set(name, exists);
  return exists;
}

export function createSearchRepository(db: RavenDB): SearchRepository {
  const tableCache = new Map<string, boolean>();

  return {
    globalSearch(query, limit) {
      const results: SearchResultItem[] = [];
      const pattern = `%${query}%`;

      // File events
      const fileEvents = db.db
        .prepare(
          `SELECT id, timestamp, filepath, change_type, project_name
           FROM events
           WHERE filepath LIKE ?
           ORDER BY timestamp DESC
           LIMIT ?`
        )
        .all(pattern, limit) as Array<{
        id: number;
        timestamp: string;
        filepath: string;
        change_type: string;
        project_name: string | null;
      }>;
      for (const e of fileEvents) {
        results.push({
          type: 'event',
          id: e.id,
          title: e.filepath,
          description: e.change_type,
          timestamp: e.timestamp,
          project_name: e.project_name,
          icon: '📄'
        });
      }

      // Agent events — tool calls, messages, file touches attributed to an
      // agent. This is the bulk of what "search everything" means for a
      // monitoring tool, so it joins the party alongside raw file events.
      if (tableExists(db, 'agent_events', tableCache)) {
        const agentEvents = db.db
          .prepare(
            `SELECT id, timestamp, agent, event_type, file, message, project_name
             FROM agent_events
             WHERE file LIKE ? OR message LIKE ? OR agent LIKE ? OR event_type LIKE ?
             ORDER BY timestamp DESC
             LIMIT ?`
          )
          .all(pattern, pattern, pattern, pattern, limit) as Array<{
          id: number;
          timestamp: string;
          agent: string;
          event_type: string;
          file: string | null;
          message: string;
          project_name: string | null;
        }>;
        for (const e of agentEvents) {
          results.push({
            type: 'agent',
            id: e.id,
            title: e.file || e.message,
            description: e.event_type,
            timestamp: e.timestamp,
            project_name: e.project_name,
            agent: e.agent,
            message: e.file ? e.message : null,
            icon: '🤖'
          });
        }
      }

      // Conversations (optional table)
      if (tableExists(db, 'conversations', tableCache)) {
        const conversations = db.db
          .prepare(
            `SELECT id, timestamp, context, query as q
             FROM conversations
             WHERE context LIKE ? OR query LIKE ?
             ORDER BY timestamp DESC
             LIMIT ?`
          )
          .all(pattern, pattern, limit) as Array<{
          id: number;
          timestamp: string;
          context: string | null;
          q: string;
        }>;
        for (const c of conversations) {
          results.push({
            type: 'conversation',
            id: c.id,
            title: c.context || 'Conversation',
            description: c.q,
            timestamp: c.timestamp,
            icon: '💬'
          });
        }
      }

      // Errors — try error_logs first, then app_errors
      const errorTable = tableExists(db, 'error_logs', tableCache)
        ? 'error_logs'
        : tableExists(db, 'app_errors', tableCache)
          ? 'app_errors'
          : null;
      if (errorTable) {
        const errors = db.db
          .prepare(
            `SELECT id, timestamp, message, severity,
                    ${errorTable === 'error_logs' ? 'project_name' : 'NULL as project_name'}
             FROM ${errorTable}
             WHERE message LIKE ?
             ORDER BY timestamp DESC
             LIMIT ?`
          )
          .all(pattern, limit) as Array<{
          id: number;
          timestamp: string;
          message: string;
          severity: string;
          project_name: string | null;
        }>;
        for (const e of errors) {
          results.push({
            type: 'error',
            id: e.id,
            title: e.message,
            description: e.severity,
            timestamp: e.timestamp,
            project_name: e.project_name,
            icon: '❌'
          });
        }
      }

      // Notifications (optional table)
      if (tableExists(db, 'notifications', tableCache)) {
        const notifications = db.db
          .prepare(
            `SELECT id, timestamp, message, severity, project_name
             FROM notifications
             WHERE message LIKE ?
             ORDER BY timestamp DESC
             LIMIT ?`
          )
          .all(pattern, limit) as Array<{
          id: number;
          timestamp: string;
          message: string;
          severity: string;
          project_name: string | null;
        }>;
        for (const n of notifications) {
          results.push({
            type: 'notification',
            id: n.id,
            title: n.message,
            description: n.severity,
            timestamp: n.timestamp,
            project_name: n.project_name,
            icon: '🔔'
          });
        }
      }

      results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return results;
    }
  };
}
