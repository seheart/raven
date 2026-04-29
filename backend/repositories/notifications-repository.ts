/**
 * Notifications Repository — owns the `health_issues` table.
 */

import type { RavenDB } from '../db.js';

interface HealthIssueRow {
  id: number;
  created_at: string;
  severity: string;
  message: string;
  resolved: number;
}

export interface NotificationsRepository {
  list(limit: number): { notifications: HealthIssueRow[]; total: number };
  count(): { total: number; unread: number };
}

function tableExists(db: RavenDB, name: string): boolean {
  const row = db.db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1`)
    .get(name);
  return !!row;
}

export function createNotificationsRepository(db: RavenDB): NotificationsRepository {
  return {
    list(limit) {
      if (!tableExists(db, 'health_issues')) {
        return { notifications: [], total: 0 };
      }
      const notifications = db.db
        .prepare('SELECT * FROM health_issues ORDER BY created_at DESC LIMIT ?')
        .all(limit) as HealthIssueRow[];
      return { notifications, total: notifications.length };
    },
    count() {
      if (!tableExists(db, 'health_issues')) {
        return { total: 0, unread: 0 };
      }
      const row = db.db.prepare('SELECT COUNT(*) as total FROM health_issues').get() as
        | { total: number }
        | undefined;
      return { total: row?.total ?? 0, unread: 0 };
    }
  };
}
