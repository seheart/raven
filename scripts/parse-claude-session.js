#!/usr/bin/env node
/**
 * Parse Claude Code session logs and output conversation timeline
 * Prototype for Raven Agent Conversation Tracker feature
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Get most recent session file
const sessionDir = path.join(process.env.HOME, '.claude/projects/-home-seth');
const files = fs.readdirSync(sessionDir)
  .filter(f => f.endsWith('.jsonl'))
  .map(f => ({
    name: f,
    path: path.join(sessionDir, f),
    mtime: fs.statSync(path.join(sessionDir, f)).mtime
  }))
  .sort((a, b) => b.mtime - a.mtime);

if (files.length === 0) {
  console.error('No session files found');
  process.exit(1);
}

const sessionFile = files[0].path;
console.log(`\n📂 Parsing session: ${files[0].name}`);
console.log(`⏰ Last modified: ${files[0].mtime.toLocaleString()}`);
console.log(`\n${'='.repeat(80)}\n`);

// Parse session line by line
const rl = readline.createInterface({
  input: fs.createReadStream(sessionFile),
  crlfDelay: Infinity
});

let messageCount = 0;
let userMessages = 0;
let assistantMessages = 0;
let toolCalls = 0;
let events = [];

rl.on('line', (line) => {
  try {
    const entry = JSON.parse(line);

    // Skip summaries and file snapshots
    if (entry.type === 'summary' || entry.type === 'file-history-snapshot') {
      return;
    }

    messageCount++;

    // User message
    if (entry.type === 'user' && entry.message?.role === 'user') {
      userMessages++;
      const timestamp = new Date(entry.timestamp).toLocaleString();
      const content = entry.message.content;

      // Check if it's a tool result (user sends tool results back to Claude)
      if (Array.isArray(content) && content[0]?.type === 'tool_result') {
        const result = content[0];
        const output = typeof result.content === 'string'
          ? result.content.substring(0, 200)
          : JSON.stringify(result.content).substring(0, 200);

        events.push({
          timestamp,
          type: 'tool_result',
          toolId: result.tool_use_id,
          output: output + (output.length >= 200 ? '...' : ''),
          isError: result.is_error
        });
      } else {
        events.push({
          timestamp,
          type: 'user_message',
          content: typeof content === 'string' ? content : content
        });
      }
    }

    // Assistant message
    if (entry.type === 'assistant' && entry.message?.content) {
      assistantMessages++;
      const timestamp = new Date(entry.timestamp).toLocaleString();
      const content = entry.message.content;

      content.forEach(block => {
        if (block.type === 'text') {
          events.push({
            timestamp,
            type: 'assistant_text',
            content: block.text.substring(0, 300) + (block.text.length > 300 ? '...' : '')
          });
        } else if (block.type === 'tool_use') {
          toolCalls++;
          events.push({
            timestamp,
            type: 'tool_call',
            toolName: block.name,
            toolId: block.id,
            input: block.input
          });
        }
      });
    }
  } catch (err) {
    // Skip malformed lines
  }
});

rl.on('close', () => {
  console.log(`\n📊 Session Statistics:`);
  console.log(`   Total events: ${messageCount}`);
  console.log(`   User messages: ${userMessages}`);
  console.log(`   Assistant messages: ${assistantMessages}`);
  console.log(`   Tool calls: ${toolCalls}`);
  console.log(`\n${'='.repeat(80)}\n`);
  console.log(`📜 Conversation Timeline (Last 20 events):\n`);

  // Show last 20 events
  const recent = events.slice(-20);

  recent.forEach((event, idx) => {
    console.log(`[${event.timestamp}]`);

    switch (event.type) {
      case 'user_message':
        console.log(`💬 USER: ${event.content}`);
        break;

      case 'assistant_text':
        console.log(`🤖 CLAUDE: ${event.content}`);
        break;

      case 'tool_call':
        console.log(`🔧 TOOL: ${event.toolName}`);
        console.log(`   Input: ${JSON.stringify(event.input, null, 2).split('\n').slice(0, 5).join('\n')}`);
        break;

      case 'tool_result':
        const icon = event.isError ? '❌' : '✅';
        console.log(`${icon} RESULT: ${event.output}`);
        break;
    }

    console.log('');
  });

  console.log(`${'='.repeat(80)}\n`);
  console.log(`✨ This is what Raven will capture and display in Event Feed!`);
  console.log(`\n💡 Next steps:`);
  console.log(`   1. Store this data in SQLite`);
  console.log(`   2. Add to Event Feed with icons`);
  console.log(`   3. Link to file changes by timestamp`);
  console.log(`   4. Add search/filtering\n`);
});
