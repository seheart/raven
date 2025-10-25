#!/usr/bin/env node
/**
 * Import Claude Code conversations into Raven database
 * Usage: node import-conversations.js [session-file.jsonl]
 */

import fs from 'fs';
import readline from 'readline';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';

const args = process.argv.slice(2);
const sessionDir = path.join(os.homedir(), '.claude/projects/-home-seth');

// Get session file (latest if not specified)
let sessionFile;
if (args.length > 0) {
  sessionFile = args[0];
  if (!sessionFile.startsWith('/')) {
    sessionFile = path.join(sessionDir, sessionFile);
  }
} else {
  // Find most recent session file
  const files = fs.readdirSync(sessionDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({
      name: f,
      path: path.join(sessionDir, f),
      mtime: fs.statSync(path.join(sessionDir, f)).mtime
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) {
    console.error('❌ No session files found');
    process.exit(1);
  }

  sessionFile = files[0].path;
  console.log(`📂 Using most recent session: ${files[0].name}`);
}

// Open Raven database
const dbPath = path.join(process.cwd(), '.raven/db/raven.db');
if (!fs.existsSync(dbPath)) {
  console.error(`❌ Raven database not found at ${dbPath}`);
  console.error('💡 Make sure Raven backend has been started at least once');
  process.exit(1);
}

const db = new Database(dbPath);
console.log(`📂 Connected to database: ${dbPath}`);

// Import session
console.log(`\n📥 Importing conversations from: ${path.basename(sessionFile)}`);
console.log(`${'='.repeat(80)}\n`);

const rl = readline.createInterface({
  input: fs.createReadStream(sessionFile),
  crlfDelay: Infinity
});

let stats = {
  userMessages: 0,
  assistantMessages: 0,
  toolCalls: 0,
  toolResults: 0,
  total: 0,
  skipped: 0
};

let sessionId = null;
let project = 'raven'; // Default project

const insertStmt = db.prepare(`
  INSERT INTO conversations (timestamp, claude_session_id, event_type, content, tool_name, tool_input, tool_output, is_error, parent_uuid, metadata, project, session_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

rl.on('line', (line) => {
  try {
    const entry = JSON.parse(line);

    // Skip summaries and file snapshots
    if (entry.type === 'summary' || entry.type === 'file-history-snapshot') {
      stats.skipped++;
      return;
    }

    // Extract session ID and project
    if (!sessionId && entry.sessionId) {
      sessionId = entry.sessionId;
    }
    if (entry.cwd) {
      project = entry.cwd.split('/').pop() || 'unknown';
    }

    const timestamp = entry.timestamp || new Date().toISOString();
    const parentUuid = entry.parentUuid || null;

    // User message
    if (entry.type === 'user' && entry.message?.role === 'user') {
      const content = entry.message.content;

      // Check if it's a tool result
      if (Array.isArray(content) && content[0]?.type === 'tool_result') {
        const result = content[0];
        const output = typeof result.content === 'string'
          ? result.content.substring(0, 5000) // Truncate long outputs
          : JSON.stringify(result.content).substring(0, 5000);

        insertStmt.run(
          timestamp,
          sessionId,
          'tool_result',
          null,
          null,
          null,
          output,
          result.is_error ? 1 : 0,
          parentUuid,
          JSON.stringify({ tool_use_id: result.tool_use_id }),
          project,
          null
        );

        stats.toolResults++;
        stats.total++;
      } else {
        // Regular user message
        insertStmt.run(
          timestamp,
          sessionId,
          'user_message',
          typeof content === 'string' ? content : JSON.stringify(content),
          null,
          null,
          null,
          0,
          parentUuid,
          null,
          project,
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
          insertStmt.run(
            timestamp,
            sessionId,
            'assistant_text',
            block.text,
            null,
            null,
            null,
            0,
            parentUuid,
            null,
            project,
            null
          );

          stats.assistantMessages++;
          stats.total++;
        } else if (block.type === 'tool_use') {
          insertStmt.run(
            timestamp,
            sessionId,
            'tool_call',
            null,
            block.name,
            JSON.stringify(block.input),
            null,
            0,
            parentUuid,
            JSON.stringify({ id: block.id }),
            project,
            null
          );

          stats.toolCalls++;
          stats.total++;
        }
      });
    }
  } catch (err) {
    stats.skipped++;
  }
});

rl.on('close', () => {
  db.close();

  console.log(`✅ Import complete!\n`);
  console.log(`📊 Statistics:`);
  console.log(`   Session ID: ${sessionId}`);
  console.log(`   Project: ${project}`);
  console.log(`   User messages: ${stats.userMessages}`);
  console.log(`   Assistant messages: ${stats.assistantMessages}`);
  console.log(`   Tool calls: ${stats.toolCalls}`);
  console.log(`   Tool results: ${stats.toolResults}`);
  console.log(`   Total imported: ${stats.total}`);
  console.log(`   Skipped: ${stats.skipped}`);
  console.log(`\n💡 View in Raven Event Feed (page 2) with conversation filter enabled\n`);
});

rl.on('error', (err) => {
  console.error('❌ Error reading session file:', err.message);
  db.close();
  process.exit(1);
});
