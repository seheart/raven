/**
 * InsightsService — Local LLM-powered activity analysis
 * Uses Ollama to generate session summaries, code review, and anomaly detection.
 * Zero external API calls, zero tokens consumed — runs entirely on local hardware.
 */

import { logger } from '../utils/logger.js';
import type { RavenDB } from '../db.js';

interface InsightSummary {
  id: string;
  timestamp: string;
  type: 'session_summary' | 'code_review' | 'anomaly';
  title: string;
  content: string;
  model: string;
  duration_ms: number;
  context_events: number;
}

export class InsightsService {
  private db: RavenDB;
  private ollamaUrl: string;
  private model: string;
  private generating: boolean = false;

  constructor(db: RavenDB, ollamaUrl = 'http://localhost:11434', model = 'qwen2.5-coder:14b') {
    this.db = db;
    this.ollamaUrl = ollamaUrl;
    this.model = model;

    // Create insights table if not exists
    this.db.db.exec(`
      CREATE TABLE IF NOT EXISTS insights (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        model TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        context_events INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Index for fast lookups
    this.db.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_insights_type_ts ON insights(type, timestamp DESC)
    `);
  }

  /**
   * Check if Ollama is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get available models from Ollama
   */
  async getModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return [];
      const data: any = await res.json();
      return (data.models || []).map((m: any) => m.name);
    } catch {
      return [];
    }
  }

  /**
   * Generate a session summary from recent activity
   */
  async generateSummary(windowMinutes = 60): Promise<InsightSummary | null> {
    if (this.generating) {
      logger.warn('Insight generation already in progress');
      return null;
    }

    this.generating = true;
    const start = Date.now();

    try {
      // Gather recent activity data
      const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

      const agentEvents = this.db.db
        .prepare(
          `
        SELECT timestamp, agent, event_type, message, file, project_name
        FROM agent_events
        WHERE timestamp > ?
        ORDER BY timestamp DESC
        LIMIT 200
      `
        )
        .all(cutoff) as any[];

      const fileEvents = this.db.db
        .prepare(
          `
        SELECT timestamp, filepath, change_type, project_name, agent_source
        FROM events
        WHERE timestamp > ?
        ORDER BY timestamp DESC
        LIMIT 100
      `
        )
        .all(cutoff) as any[];

      if (agentEvents.length === 0 && fileEvents.length === 0) {
        this.generating = false;
        return null;
      }

      // Build context for the LLM
      const context = this.buildSummaryContext(agentEvents, fileEvents, windowMinutes);

      const prompt = `You are an AI activity analyst for a developer monitoring tool called Raven. Analyze the following AI coding assistant activity and provide a concise summary.

${context}

Provide a summary with:
1. **What happened** — What was the AI working on? What files were touched?
2. **Key changes** — Most significant edits, creations, or deletions
3. **Activity level** — Was it a busy session or light work?
4. **Projects** — Which projects were active?

Keep it under 150 words. Be specific about file names and actions. No fluff.`;

      const content = await this.callOllama(prompt);
      if (!content) {
        this.generating = false;
        return null;
      }

      const duration = Date.now() - start;
      const totalEvents = agentEvents.length + fileEvents.length;

      // Determine title from the summary
      const title = this.extractTitle(content, fileEvents);

      const insight: InsightSummary = {
        id: `sum_${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: 'session_summary',
        title,
        content,
        model: this.model,
        duration_ms: duration,
        context_events: totalEvents
      };

      // Save to DB
      this.db.db
        .prepare(
          `
        INSERT INTO insights (id, timestamp, type, title, content, model, duration_ms, context_events)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          insight.id,
          insight.timestamp,
          insight.type,
          insight.title,
          insight.content,
          insight.model,
          insight.duration_ms,
          insight.context_events
        );

      logger.info(
        `✨ Generated session summary in ${duration}ms using ${this.model} (${totalEvents} events)`
      );
      this.generating = false;
      return insight;
    } catch (err: any) {
      logger.error('Failed to generate summary:', err);
      this.generating = false;
      return null;
    }
  }

  /**
   * Generate a code review for recent changes
   */
  async generateCodeReview(): Promise<InsightSummary | null> {
    if (this.generating) return null;
    this.generating = true;
    const start = Date.now();

    try {
      // Get recent diffs
      const recentDiffs = this.db.db
        .prepare(
          `
        SELECT filepath, change_type, diff, agent_source, timestamp
        FROM events
        WHERE diff IS NOT NULL AND diff != ''
        AND timestamp > datetime('now', '-30 minutes')
        ORDER BY timestamp DESC
        LIMIT 10
      `
        )
        .all() as any[];

      if (recentDiffs.length === 0) {
        this.generating = false;
        return null;
      }

      const diffContext = recentDiffs
        .map(d => {
          const diffPreview = (d.diff || '').slice(0, 1000);
          return `File: ${d.filepath} (${d.change_type})
${diffPreview}
---`;
        })
        .join('\n');

      const prompt = `You are a senior code reviewer. Review these recent code changes and provide brief, actionable feedback.

${diffContext}

For each file, note:
- Any bugs or issues introduced
- Security concerns
- Performance issues
- Anything that looks good

Be concise — 2-3 sentences per file max. Skip files that look fine.`;

      const content = await this.callOllama(prompt);
      if (!content) {
        this.generating = false;
        return null;
      }

      const duration = Date.now() - start;
      const insight: InsightSummary = {
        id: `rev_${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: 'code_review',
        title: `Code review: ${recentDiffs.length} file${recentDiffs.length > 1 ? 's' : ''}`,
        content,
        model: this.model,
        duration_ms: duration,
        context_events: recentDiffs.length
      };

      this.db.db
        .prepare(
          `
        INSERT INTO insights (id, timestamp, type, title, content, model, duration_ms, context_events)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          insight.id,
          insight.timestamp,
          insight.type,
          insight.title,
          insight.content,
          insight.model,
          insight.duration_ms,
          insight.context_events
        );

      logger.info(`✨ Generated code review in ${duration}ms`);
      this.generating = false;
      return insight;
    } catch (err: any) {
      logger.error('Failed to generate code review:', err);
      this.generating = false;
      return null;
    }
  }

  /**
   * Get recent insights from DB
   */
  getInsights(type?: string, limit = 20): InsightSummary[] {
    if (type) {
      return this.db.db
        .prepare(
          `
        SELECT * FROM insights WHERE type = ? ORDER BY timestamp DESC LIMIT ?
      `
        )
        .all(type, limit) as InsightSummary[];
    }
    return this.db.db
      .prepare(
        `
      SELECT * FROM insights ORDER BY timestamp DESC LIMIT ?
    `
      )
      .all(limit) as InsightSummary[];
  }

  /**
   * Get the latest insight of a given type
   */
  getLatest(type = 'session_summary'): InsightSummary | null {
    return this.db.db
      .prepare(
        `
      SELECT * FROM insights WHERE type = ? ORDER BY timestamp DESC LIMIT 1
    `
      )
      .get(type) as InsightSummary | null;
  }

  /**
   * Call Ollama API
   */
  private async callOllama(prompt: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 500
          }
        }),
        signal: AbortSignal.timeout(120000) // 2 min timeout
      });

      if (!res.ok) {
        logger.error(`Ollama returned ${res.status}`);
        return null;
      }

      const data: any = await res.json();
      return data.response?.trim() || null;
    } catch (err: any) {
      logger.error(`Ollama call failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Build summary context from events
   */
  private buildSummaryContext(
    agentEvents: any[],
    fileEvents: any[],
    windowMinutes: number
  ): string {
    // Count event types
    const eventTypes: Record<string, number> = {};
    for (const e of agentEvents) {
      eventTypes[e.event_type] = (eventTypes[e.event_type] || 0) + 1;
    }

    // Count file operations by type
    const fileOps: Record<string, number> = {};
    const projects = new Set<string>();
    const filesChanged = new Set<string>();
    for (const e of fileEvents) {
      fileOps[e.change_type] = (fileOps[e.change_type] || 0) + 1;
      if (e.project_name) projects.add(e.project_name);
      if (e.filepath) filesChanged.add(e.filepath);
    }

    // Get unique tool calls
    const toolCalls = agentEvents
      .filter(e => e.event_type === 'tool_call')
      .map(e => e.message)
      .filter(Boolean);
    const toolCounts: Record<string, number> = {};
    for (const t of toolCalls) {
      const name = t.replace(' call', '');
      toolCounts[name] = (toolCounts[name] || 0) + 1;
    }

    // Recent conversation snippets
    const conversations = agentEvents
      .filter(e => e.event_type === 'assistant_text' || e.event_type === 'user_message')
      .slice(0, 10)
      .map(e => `[${e.event_type}] ${(e.message || '').slice(0, 100)}`)
      .join('\n');

    return `Time window: last ${windowMinutes} minutes
Total agent events: ${agentEvents.length}
Total file changes: ${fileEvents.length}
Projects active: ${[...projects].join(', ') || 'unknown'}

Event breakdown: ${JSON.stringify(eventTypes)}
File operations: ${JSON.stringify(fileOps)}
Files changed (${filesChanged.size}): ${[...filesChanged].slice(0, 20).join(', ')}

Tool usage: ${JSON.stringify(toolCounts)}

Recent conversation:
${conversations || '(no conversation data)'}`;
  }

  /**
   * Extract a short title from the summary content
   */
  private extractTitle(content: string, fileEvents: any[]): string {
    const projects = new Set(fileEvents.map(e => e.project_name).filter(Boolean));
    const projectStr = [...projects].slice(0, 2).join(', ');
    if (projectStr) return `Session summary: ${projectStr}`;
    return 'Session summary';
  }

  /**
   * Update the model used for generation
   */
  setModel(model: string): void {
    this.model = model;
    logger.info(`Insights model set to: ${model}`);
  }

  isGenerating(): boolean {
    return this.generating;
  }
}
