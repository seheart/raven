#!/usr/bin/env python3
"""Quick import of Claude conversations into Raven database"""

import json
import sqlite3
import sys
from pathlib import Path

# Session file
session_file = Path.home() / '.claude/projects/-home-seth/c6ceb139-5c3f-4cc6-923a-2bcac56f3479.jsonl'

# Raven database (in project root, not backend dir)
db_path = Path.cwd().parent / '.raven/db/raven.db' if Path.cwd().name == 'backend' else Path.cwd() / '.raven/db/raven.db'

print(f"📂 Reading session: {session_file.name}")
print(f"📂 Database: {db_path}")
print()

# Connect to database
conn = sqlite3.connect(str(db_path))
cursor = conn.cursor()

# Stats
stats = {
    'user_messages': 0,
    'assistant_texts': 0,
    'tool_calls': 0,
    'tool_results': 0,
    'skipped': 0,
    'total': 0
}

session_id = None
project = 'raven'

# Read and parse JSONL
with open(session_file, 'r') as f:
    for line_num, line in enumerate(f, 1):
        try:
            entry = json.loads(line)

            # Skip summaries and snapshots
            if entry.get('type') in ['summary', 'file-history-snapshot']:
                stats['skipped'] += 1
                continue

            # Extract session ID
            if not session_id and 'sessionId' in entry:
                session_id = entry['sessionId']

            timestamp = entry.get('timestamp', '')
            parent_uuid = entry.get('parentUuid')
            cwd = entry.get('cwd', project)
            if cwd:
                project = cwd.split('/')[-1] or 'unknown'

            # User message
            if entry.get('type') == 'user':
                message = entry.get('message', {})
                if message.get('role') != 'user':
                    continue

                content = message.get('content')
                if not content:
                    continue

                # Tool result (content is array with tool_result)
                if isinstance(content, list) and len(content) > 0 and content[0].get('type') == 'tool_result':
                    result = content[0]
                    output = result.get('content', '')
                    if isinstance(output, str):
                        output = output[:5000]  # Truncate
                    else:
                        output = json.dumps(output)[:5000]

                    cursor.execute('''
                        INSERT INTO conversations
                        (timestamp, claude_session_id, event_type, content, tool_name, tool_input, tool_output, is_error, parent_uuid, metadata, project, session_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (timestamp, session_id, 'tool_result', None, None, None, output,
                          1 if result.get('is_error') else 0, parent_uuid,
                          json.dumps({'tool_use_id': result.get('tool_use_id')}), project, None))

                    stats['tool_results'] += 1
                    stats['total'] += 1
                else:
                    # Regular user message (content is string)
                    if isinstance(content, str):
                        text = content
                    else:
                        text = json.dumps(content)

                    cursor.execute('''
                        INSERT INTO conversations
                        (timestamp, claude_session_id, event_type, content, tool_name, tool_input, tool_output, is_error, parent_uuid, metadata, project, session_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (timestamp, session_id, 'user_message', text, None, None, None, 0, parent_uuid, None, project, None))

                    stats['user_messages'] += 1
                    stats['total'] += 1

            # Assistant message
            elif entry.get('type') == 'assistant' and 'content' in entry.get('message', {}):
                content = entry['message']['content']

                for block in content:
                    if block.get('type') == 'text':
                        cursor.execute('''
                            INSERT INTO conversations
                            (timestamp, claude_session_id, event_type, content, tool_name, tool_input, tool_output, is_error, parent_uuid, metadata, project, session_id)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ''', (timestamp, session_id, 'assistant_text', block['text'], None, None, None, 0, parent_uuid, None, project, None))

                        stats['assistant_texts'] += 1
                        stats['total'] += 1

                    elif block.get('type') == 'tool_use':
                        cursor.execute('''
                            INSERT INTO conversations
                            (timestamp, claude_session_id, event_type, content, tool_name, tool_input, tool_output, is_error, parent_uuid, metadata, project, session_id)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ''', (timestamp, session_id, 'tool_call', None, block['name'],
                              json.dumps(block.get('input', {})), None, 0, parent_uuid,
                              json.dumps({'id': block.get('id')}), project, None))

                        stats['tool_calls'] += 1
                        stats['total'] += 1

        except Exception as e:
            stats['skipped'] += 1
            if line_num % 100 == 0:
                print(f"  Processed {line_num} lines...", end='\r')

conn.commit()
conn.close()

print()
print('✅ Import complete!')
print()
print(f"📊 Statistics:")
print(f"   Session ID: {session_id}")
print(f"   Project: {project}")
print(f"   User messages: {stats['user_messages']}")
print(f"   Assistant messages: {stats['assistant_texts']}")
print(f"   Tool calls: {stats['tool_calls']}")
print(f"   Tool results: {stats['tool_results']}")
print(f"   Total imported: {stats['total']}")
print(f"   Skipped: {stats['skipped']}")
print()
print("💡 View in Raven Event Feed (page 2) with conversation filters enabled")
