#!/usr/bin/env node
/**
 * Backfill agent_events.project_name for rows that have NULL/empty project_name.
 *
 * Strategy: orphan rows are overwhelmingly Ollama/local-model traffic shared across
 * projects within a single session. Attribute them to "external" rather than guess.
 * Run once: `node backend/scripts/backfill-orphan-agent-events.js`
 */
import Database from 'better-sqlite3';
import { join } from 'path';

const dbPath = process.env.RAVEN_DB || join(process.cwd(), '.raven', 'db', 'raven.db');
const db = new Database(dbPath);

const before = db
  .prepare(`SELECT COUNT(*) as n FROM agent_events WHERE project_name IS NULL OR project_name = ''`)
  .get();
console.log(`Orphan agent_events before: ${before.n}`);

const result = db
  .prepare(
    `UPDATE agent_events
     SET project_name = 'external'
     WHERE project_name IS NULL OR project_name = ''`
  )
  .run();
console.log(`Updated rows: ${result.changes}`);

const after = db
  .prepare(`SELECT COUNT(*) as n FROM agent_events WHERE project_name IS NULL OR project_name = ''`)
  .get();
console.log(`Orphan agent_events after: ${after.n}`);

db.close();
