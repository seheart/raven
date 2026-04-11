/**
 * InsightsService — Local LLM-powered activity analysis
 * Uses Ollama to generate session summaries, code review, anomaly detection,
 * daily digests, diff risk scoring, agent comparisons, and project health narratives.
 * Zero external API calls — runs entirely on local hardware.
 */

import { logger } from '../utils/logger.js';
import type { RavenDB } from '../db.js';

interface InsightSummary {
  id: string;
  timestamp: string;
  type:
    | 'session_summary'
    | 'code_review'
    | 'anomaly'
    | 'daily_digest'
    | 'diff_risk'
    | 'agent_comparison'
    | 'project_health';
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
  private generating: Set<string> = new Set();
  private lastAnomalyCallTime = 0;
  private lastAnomalyStatus = '';
  private static readonly ANOMALY_THROTTLE_MS = 60 * 60 * 1000; // 1 hour

  constructor(
    db: RavenDB,
    ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434',
    model = process.env.OLLAMA_MODEL || 'qwen2.5-coder:14b'
  ) {
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

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

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

  // ==================== Session Summary ====================

  async generateSummary(windowMinutes = 60): Promise<InsightSummary | null> {
    if (this.generating.has('session_summary')) {
      logger.warn('Session summary generation already in progress');
      return null;
    }

    this.generating.add('session_summary');
    const start = Date.now();

    try {
      const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

      const agentEvents = this.db.db
        .prepare(
          `SELECT timestamp, agent, event_type, message, file, project_name FROM agent_events WHERE timestamp > ? ORDER BY timestamp DESC LIMIT 200`
        )
        .all(cutoff) as any[];

      const fileEvents = this.db.db
        .prepare(
          `SELECT timestamp, filepath, change_type, project_name, agent_source FROM events WHERE timestamp > ? ORDER BY timestamp DESC LIMIT 100`
        )
        .all(cutoff) as any[];

      if (agentEvents.length === 0 && fileEvents.length === 0) {
        this.generating.delete('session_summary');
        return null;
      }

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
        this.generating.delete('session_summary');
        return null;
      }

      const duration = Date.now() - start;
      const totalEvents = agentEvents.length + fileEvents.length;
      const title = this.extractTitle(content, fileEvents);

      const insight = this.saveInsight(
        `sum_${Date.now()}`,
        'session_summary',
        title,
        content,
        duration,
        totalEvents
      );

      logger.info(
        `✨ Generated session summary in ${duration}ms using ${this.model} (${totalEvents} events)`
      );
      this.generating.delete('session_summary');
      return insight;
    } catch (err: any) {
      logger.error('Failed to generate summary:', err);
      this.generating.delete('session_summary');
      return null;
    }
  }

  // ==================== Code Review ====================

  async generateCodeReview(): Promise<InsightSummary | null> {
    if (this.generating.has('code_review')) return null;
    this.generating.add('code_review');
    const start = Date.now();

    try {
      const recentDiffs = this.db.db
        .prepare(
          `SELECT filepath, change_type, diff, agent_source, timestamp FROM events WHERE diff IS NOT NULL AND diff != '' AND timestamp > datetime('now', '-30 minutes') ORDER BY timestamp DESC LIMIT 10`
        )
        .all() as any[];

      if (recentDiffs.length === 0) {
        this.generating.delete('code_review');
        return null;
      }

      const diffContext = recentDiffs
        .map(d => `File: ${d.filepath} (${d.change_type})\n${(d.diff || '').slice(0, 1000)}\n---`)
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
        this.generating.delete('code_review');
        return null;
      }

      const duration = Date.now() - start;
      const insight = this.saveInsight(
        `rev_${Date.now()}`,
        'code_review',
        `Code review: ${recentDiffs.length} file${recentDiffs.length > 1 ? 's' : ''}`,
        content,
        duration,
        recentDiffs.length
      );

      logger.info(`✨ Generated code review in ${duration}ms`);
      this.generating.delete('code_review');
      return insight;
    } catch (err: any) {
      logger.error('Failed to generate code review:', err);
      this.generating.delete('code_review');
      return null;
    }
  }

  // ==================== Anomaly Explanation ====================

  async generateAnomalyExplanation(alertData: {
    overallStatus: string;
    criticalIssues: Array<{ category?: string; name?: string; message?: string }>;
    summary: { critical: number; warnings: number };
  }): Promise<InsightSummary | null> {
    // Throttle: skip if same status was explained within the last hour
    const now = Date.now();
    if (
      alertData.overallStatus === this.lastAnomalyStatus &&
      now - this.lastAnomalyCallTime < InsightsService.ANOMALY_THROTTLE_MS
    ) {
      logger.debug(
        `Skipping anomaly explanation — same status "${alertData.overallStatus}" explained ${Math.round((now - this.lastAnomalyCallTime) / 60000)}m ago`
      );
      return null;
    }

    const start = now;

    try {
      const issuesList = alertData.criticalIssues
        .map(i => `- [${i.category || 'system'}] ${i.name || 'issue'}: ${i.message || 'unknown'}`)
        .join('\n');

      const prompt = `You are a system health analyst for a developer monitoring tool. A health check just detected issues.

Status: ${alertData.overallStatus}
Issues (${alertData.summary.critical} critical, ${alertData.summary.warnings} warnings):
${issuesList || '- No specific issues listed'}

In one sentence, explain what is happening and whether the developer should take action. Be specific.`;

      const content = await this.callOllamaShort(prompt, 100);
      if (!content) return null;

      const duration = Date.now() - start;
      const insight = this.saveInsight(
        `ano_${Date.now()}`,
        'anomaly',
        `Anomaly: ${alertData.overallStatus}`,
        content,
        duration,
        alertData.summary.critical + alertData.summary.warnings
      );

      this.lastAnomalyCallTime = Date.now();
      this.lastAnomalyStatus = alertData.overallStatus;
      logger.info(`✨ Generated anomaly explanation in ${duration}ms`);
      return insight;
    } catch (err: any) {
      logger.error('Failed to generate anomaly explanation:', err);
      return null;
    }
  }

  // ==================== Daily Digest ====================

  async generateDailyDigest(): Promise<InsightSummary | null> {
    if (this.generating.has('daily_digest')) return null;
    this.generating.add('daily_digest');
    const start = Date.now();

    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // File event stats
      const fileStats = this.db.db
        .prepare(
          `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN change_type IN ('add','create') THEN 1 ELSE 0 END) as creates,
          SUM(CASE WHEN change_type IN ('change','edit','modified') THEN 1 ELSE 0 END) as edits,
          SUM(CASE WHEN change_type IN ('unlink','delete') THEN 1 ELSE 0 END) as deletes
        FROM events WHERE timestamp > ?
      `
        )
        .get(cutoff) as any;

      // Active projects
      const projects = this.db.db
        .prepare(
          `
        SELECT DISTINCT project_name FROM events WHERE timestamp > ? AND project_name IS NOT NULL
      `
        )
        .all(cutoff) as any[];

      // Top edited files
      const topFiles = this.db.db
        .prepare(
          `
        SELECT filepath, COUNT(*) as count FROM events WHERE timestamp > ? AND filepath IS NOT NULL GROUP BY filepath ORDER BY count DESC LIMIT 10
      `
        )
        .all(cutoff) as any[];

      // Agent stats
      const agentStats = this.db.db
        .prepare(
          `
        SELECT agent, COUNT(*) as count, SUM(lines_changed) as total_lines FROM agent_events WHERE timestamp > ? GROUP BY agent
      `
        )
        .all(cutoff) as any[];

      const totalAgentEvents = agentStats.reduce((s: number, a: any) => s + a.count, 0);
      const totalLines = agentStats.reduce((s: number, a: any) => s + (a.total_lines || 0), 0);

      // Syntax errors and test results
      const syntaxCount =
        (
          this.db.db
            .prepare(`SELECT COUNT(*) as count FROM syntax_errors WHERE timestamp > ?`)
            .get(cutoff) as any
        )?.count || 0;

      let testInfo = 'No test data';
      try {
        const testResults = this.db.db
          .prepare(
            `SELECT passed_tests, failed_tests, total_tests FROM test_results WHERE timestamp > ? ORDER BY timestamp DESC LIMIT 1`
          )
          .get(cutoff) as any;
        if (testResults)
          testInfo = `${testResults.passed_tests}/${testResults.total_tests} passed, ${testResults.failed_tests} failed`;
      } catch {
        /* table may not exist */
      }

      if ((fileStats?.total || 0) === 0 && totalAgentEvents === 0) {
        this.generating.delete('daily_digest');
        return null;
      }

      const prompt = `You are a developer productivity analyst for the Raven monitoring tool. Generate an end-of-day summary.

Date: ${new Date().toLocaleDateString()}
Time period: Last 24 hours

File Activity:
- Total file events: ${fileStats?.total || 0}
- Creates: ${fileStats?.creates || 0}, Edits: ${fileStats?.edits || 0}, Deletes: ${fileStats?.deletes || 0}
- Projects active: ${projects.map((p: any) => p.project_name).join(', ') || 'none'}
- Most-edited files: ${topFiles.map((f: any) => `${f.filepath} (${f.count}x)`).join(', ') || 'none'}

Agent Activity:
- Agents used: ${agentStats.map((a: any) => a.agent).join(', ') || 'none'}
- Total agent events: ${totalAgentEvents}
- Total lines changed: ${totalLines}

Code Quality:
- Syntax errors detected: ${syntaxCount}
- Tests: ${testInfo}

Write a developer-friendly daily digest with sections:
1. **Today's Highlights** — Most notable work
2. **Productivity** — Activity level and patterns
3. **Code Quality** — Any concerns from errors or test failures
4. **Tomorrow** — Suggested focus areas based on patterns

Keep it under 200 words. Be specific about file names and projects.`;

      const content = await this.callOllamaLong(prompt);
      if (!content) {
        this.generating.delete('daily_digest');
        return null;
      }

      const duration = Date.now() - start;
      const insight = this.saveInsight(
        `dig_${Date.now()}`,
        'daily_digest',
        `Daily Digest: ${new Date().toLocaleDateString()}`,
        content,
        duration,
        (fileStats?.total || 0) + totalAgentEvents
      );

      logger.info(`✨ Generated daily digest in ${duration}ms`);
      this.generating.delete('daily_digest');
      return insight;
    } catch (err: any) {
      logger.error('Failed to generate daily digest:', err);
      this.generating.delete('daily_digest');
      return null;
    }
  }

  // ==================== Diff Risk Scoring ====================

  async scoreDiffRisk(
    eventId: number,
    filepath: string,
    diff: string,
    changeType: string
  ): Promise<{ score: number; reason: string } | null> {
    const start = Date.now();

    try {
      const prompt = `You are a code risk assessor. Score this diff on a 1-10 risk scale (1=safe routine change, 10=dangerous/breaking change).

File: ${filepath}
Change type: ${changeType}
Diff (truncated):
${diff.slice(0, 1500)}

Respond ONLY with JSON: {"score": <number 1-10>, "reason": "<one sentence>"}`;

      const content = await this.callOllamaShort(prompt, 150);
      if (!content) return null;

      // Parse JSON response with fallback
      let score = 5;
      let reason = 'Unable to parse risk assessment';
      try {
        const parsed = JSON.parse(content);
        score = Math.max(1, Math.min(10, parseInt(parsed.score, 10) || 5));
        reason = parsed.reason || reason;
      } catch {
        // Regex fallback
        const scoreMatch = content.match(/"score"\s*:\s*(\d+)/);
        const reasonMatch = content.match(/"reason"\s*:\s*"([^"]+)"/);
        if (scoreMatch) score = Math.max(1, Math.min(10, parseInt(scoreMatch[1], 10)));
        if (reasonMatch) reason = reasonMatch[1];
      }

      const duration = Date.now() - start;

      // Also save as insight for the timeline
      this.saveInsight(
        `drs_${Date.now()}`,
        'diff_risk',
        `Risk ${score}/10: ${filepath.split('/').pop()}`,
        `**${filepath}** (${changeType}) — Risk: ${score}/10\n\n${reason}`,
        duration,
        1
      );

      logger.info(`✨ Scored diff risk for ${filepath}: ${score}/10 in ${duration}ms`);
      return { score, reason };
    } catch (err: any) {
      logger.error('Failed to score diff risk:', err);
      return null;
    }
  }

  // ==================== Agent Comparison ====================

  async generateAgentComparison(): Promise<InsightSummary | null> {
    if (this.generating.has('agent_comparison')) return null;
    this.generating.add('agent_comparison');
    const start = Date.now();

    try {
      const agentStats = this.db.db
        .prepare(
          `
        SELECT agent, COUNT(*) as event_count, AVG(duration_ms) as avg_duration_ms, SUM(lines_changed) as total_lines_changed
        FROM agent_events GROUP BY agent ORDER BY event_count DESC
      `
        )
        .all() as any[];

      if (agentStats.length === 0) {
        this.generating.delete('agent_comparison');
        return null;
      }

      // File operations by agent
      const agentFileOps = this.db.db
        .prepare(
          `
        SELECT agent_source,
          SUM(CASE WHEN change_type IN ('add','create') THEN 1 ELSE 0 END) as creates,
          SUM(CASE WHEN change_type IN ('change','edit','modified') THEN 1 ELSE 0 END) as edits,
          SUM(CASE WHEN change_type IN ('unlink','delete') THEN 1 ELSE 0 END) as deletes
        FROM events WHERE agent_source IS NOT NULL GROUP BY agent_source
      `
        )
        .all() as any[];

      const prompt = `You are an AI coding assistant analyst for Raven. Compare the behavior and productivity of the AI agents that have been active.

Agent Statistics:
${agentStats.map((a: any) => `${a.agent}: ${a.event_count} events, avg ${a.avg_duration_ms?.toFixed(0) || 'N/A'}ms, ${a.total_lines_changed || 0} lines changed`).join('\n')}

File Operations by Agent:
${agentFileOps.map((a: any) => `${a.agent_source}: ${a.creates} creates, ${a.edits} edits, ${a.deletes} deletes`).join('\n') || '(no file attribution data)'}

Analyze:
1. **Agent Profiles** — Characterize each agent's working style
2. **Productivity** — Which agent produces more throughput?
3. **Patterns** — Notable differences in how they work
4. **Recommendations** — Any workflow improvements

Keep it under 200 words.`;

      const content = await this.callOllamaLong(prompt);
      if (!content) {
        this.generating.delete('agent_comparison');
        return null;
      }

      const duration = Date.now() - start;
      const totalEvents = agentStats.reduce((s: number, a: any) => s + a.event_count, 0);
      const insight = this.saveInsight(
        `agc_${Date.now()}`,
        'agent_comparison',
        `Agent Comparison: ${agentStats.map((a: any) => a.agent).join(' vs ')}`,
        content,
        duration,
        totalEvents
      );

      logger.info(`✨ Generated agent comparison in ${duration}ms`);
      this.generating.delete('agent_comparison');
      return insight;
    } catch (err: any) {
      logger.error('Failed to generate agent comparison:', err);
      this.generating.delete('agent_comparison');
      return null;
    }
  }

  // ==================== Project Health Narrative ====================

  async generateProjectHealth(projectName: string): Promise<InsightSummary | null> {
    if (this.generating.has('project_health')) return null;
    this.generating.add('project_health');
    const start = Date.now();

    try {
      // Events for this project
      const eventStats = this.db.db
        .prepare(
          `
        SELECT
          COUNT(*) as total,
          COUNT(DISTINCT filepath) as distinct_files,
          SUM(CASE WHEN change_type IN ('add','create') THEN 1 ELSE 0 END) as creates,
          SUM(CASE WHEN change_type IN ('change','edit','modified') THEN 1 ELSE 0 END) as edits,
          SUM(CASE WHEN change_type IN ('unlink','delete') THEN 1 ELSE 0 END) as deletes
        FROM events WHERE project_name = ?
      `
        )
        .get(projectName) as any;

      // Syntax errors
      const syntaxCount =
        (
          this.db.db
            .prepare(
              `
        SELECT COUNT(*) as count FROM syntax_errors WHERE filepath LIKE ? AND resolved = 0
      `
            )
            .get(`${projectName}/%`) as any
        )?.count || 0;

      // Pattern warnings
      const patternStats = this.db.db
        .prepare(
          `
        SELECT COUNT(*) as count, SUM(CASE WHEN severity = 'critical' OR severity = 'high' THEN 1 ELSE 0 END) as critical
        FROM pattern_warnings WHERE filepath LIKE ? AND resolved = 0
      `
        )
        .get(`${projectName}/%`) as any;

      // Latest test result
      let testInfo = 'No test data';
      try {
        const test = this.db.db
          .prepare(
            `SELECT passed_tests, total_tests, failed_tests FROM test_results ORDER BY timestamp DESC LIMIT 1`
          )
          .get() as any;
        if (test)
          testInfo = `${test.passed_tests}/${test.total_tests} passed, ${test.failed_tests} failed`;
      } catch {
        /* table may not exist */
      }

      // Agent activity for project
      const agentActivity = this.db.db
        .prepare(
          `
        SELECT agent, COUNT(*) as count FROM agent_events WHERE project_name = ? GROUP BY agent
      `
        )
        .all(projectName) as any[];

      if ((eventStats?.total || 0) === 0 && agentActivity.length === 0) {
        this.generating.delete('project_health');
        return null;
      }

      const prompt = `You are a project health analyst for Raven. Generate a natural-language health assessment for this project.

Project: ${projectName}

Activity:
- Total file events: ${eventStats?.total || 0}
- Files tracked: ${eventStats?.distinct_files || 0}
- Creates: ${eventStats?.creates || 0}, Edits: ${eventStats?.edits || 0}, Deletes: ${eventStats?.deletes || 0}

Code Quality:
- Unresolved syntax errors: ${syntaxCount}
- Pattern warnings: ${patternStats?.count || 0} (${patternStats?.critical || 0} critical)
- Latest test run: ${testInfo}

Agent Activity:
${agentActivity.map((a: any) => `- ${a.agent}: ${a.count} events`).join('\n') || '- No agent data'}

Write a concise project health narrative:
1. **Status** — Overall health (healthy/needs attention/at risk)
2. **Activity** — Is this project being actively developed?
3. **Quality** — Any concerns from errors, warnings, or test failures?
4. **Summary** — One-sentence overall assessment

Keep it under 150 words.`;

      const content = await this.callOllama(prompt);
      if (!content) {
        this.generating.delete('project_health');
        return null;
      }

      const duration = Date.now() - start;
      const insight = this.saveInsight(
        `prh_${Date.now()}`,
        'project_health',
        `Project Health: ${projectName}`,
        content,
        duration,
        (eventStats?.total || 0) + agentActivity.reduce((s: number, a: any) => s + a.count, 0)
      );

      logger.info(`✨ Generated project health for ${projectName} in ${duration}ms`);
      this.generating.delete('project_health');
      return insight;
    } catch (err: any) {
      logger.error('Failed to generate project health:', err);
      this.generating.delete('project_health');
      return null;
    }
  }

  // ==================== Query Methods ====================

  getInsights(type?: string, limit = 20): InsightSummary[] {
    if (type) {
      return this.db.db
        .prepare(`SELECT * FROM insights WHERE type = ? ORDER BY timestamp DESC LIMIT ?`)
        .all(type, limit) as InsightSummary[];
    }
    return this.db.db
      .prepare(`SELECT * FROM insights ORDER BY timestamp DESC LIMIT ?`)
      .all(limit) as InsightSummary[];
  }

  getLatest(type = 'session_summary'): InsightSummary | null {
    return this.db.db
      .prepare(`SELECT * FROM insights WHERE type = ? ORDER BY timestamp DESC LIMIT 1`)
      .get(type) as InsightSummary | null;
  }

  setModel(model: string): void {
    this.model = model;
    logger.info(`Insights model set to: ${model}`);
  }

  isGenerating(): boolean {
    return this.generating.size > 0;
  }

  // ==================== Private Helpers ====================

  private saveInsight(
    id: string,
    type: string,
    title: string,
    content: string,
    duration_ms: number,
    context_events: number
  ): InsightSummary {
    const insight: InsightSummary = {
      id,
      timestamp: new Date().toISOString(),
      type: type as InsightSummary['type'],
      title,
      content,
      model: this.model,
      duration_ms,
      context_events
    };

    this.db.db
      .prepare(
        `INSERT INTO insights (id, timestamp, type, title, content, model, duration_ms, context_events) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
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

    return insight;
  }

  private async callOllama(prompt: string): Promise<string | null> {
    return this.callOllamaWithOptions(prompt, 500, 120000);
  }

  private async callOllamaShort(prompt: string, numPredict = 100): Promise<string | null> {
    return this.callOllamaWithOptions(prompt, numPredict, 30000);
  }

  private async callOllamaLong(prompt: string): Promise<string | null> {
    return this.callOllamaWithOptions(prompt, 800, 180000);
  }

  private async callOllamaWithOptions(
    prompt: string,
    numPredict: number,
    timeoutMs: number
  ): Promise<string | null> {
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
            num_predict: numPredict
          }
        }),
        signal: AbortSignal.timeout(timeoutMs)
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

  private buildSummaryContext(
    agentEvents: any[],
    fileEvents: any[],
    windowMinutes: number
  ): string {
    const eventTypes: Record<string, number> = {};
    for (const e of agentEvents) {
      eventTypes[e.event_type] = (eventTypes[e.event_type] || 0) + 1;
    }

    const fileOps: Record<string, number> = {};
    const projects = new Set<string>();
    const filesChanged = new Set<string>();
    for (const e of fileEvents) {
      fileOps[e.change_type] = (fileOps[e.change_type] || 0) + 1;
      if (e.project_name) projects.add(e.project_name);
      if (e.filepath) filesChanged.add(e.filepath);
    }

    const toolCalls = agentEvents
      .filter(e => e.event_type === 'tool_call')
      .map(e => e.message)
      .filter(Boolean);
    const toolCounts: Record<string, number> = {};
    for (const t of toolCalls) {
      const name = t.replace(' call', '');
      toolCounts[name] = (toolCounts[name] || 0) + 1;
    }

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

  private extractTitle(content: string, fileEvents: any[]): string {
    const projects = new Set(fileEvents.map(e => e.project_name).filter(Boolean));
    const projectStr = [...projects].slice(0, 2).join(', ');
    if (projectStr) return `Session summary: ${projectStr}`;
    return 'Session summary';
  }
}
