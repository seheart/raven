/**
 * AgentDetector - Identifies which AI agent made a code change
 *
 * Supports detection of:
 * - ANT (your AI coding tool)
 * - Claude Code (Anthropic)
 * - Cursor
 * - GitHub Copilot
 * - Aider
 * - Manual edits (human developer)
 */

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Agent type
 */
export type AgentType =
  | 'ant'
  | 'claude-code'
  | 'cursor'
  | 'github-copilot'
  | 'aider'
  | 'manual'
  | 'unknown'
  | 'none';

/**
 * Agent pattern configuration
 */
interface AgentPattern {
  processNames: string[];
  envVars: string[];
  fileMarkers: string[];
  confidence: number;
}

/**
 * Detection signal
 */
interface DetectionSignal {
  agent: AgentType;
  confidence: number;
  signal: string;
  value: string;
}

/**
 * Detection result
 */
export interface DetectionResult {
  agent: AgentType;
  confidence: number;
  signals: string[];
  active?: boolean;
}

/**
 * File change for detection
 */
interface FileChange {
  filepath: string;
  timestamp: string;
  diff?: string;
}

/**
 * Detection context
 */
interface DetectionContext {
  processName?: string;
  env?: NodeJS.ProcessEnv;
  projectRoot?: string;
}

export class AgentDetector {
  private detectionCache: Map<string, DetectionResult>;
  private processPatterns: Record<string, AgentPattern>;

  constructor() {
    this.detectionCache = new Map();
    this.processPatterns = this.loadProcessPatterns();
  }

  private loadProcessPatterns(): Record<string, AgentPattern> {
    return {
      ant: {
        processNames: ['ant', 'ant-cli', 'ant-agent'],
        envVars: ['ANT_SESSION', 'ANT_PROJECT'],
        fileMarkers: ['.ant', '.ant-session'],
        confidence: 95
      },
      'claude-code': {
        processNames: ['claude', 'claude-code', 'claude_desktop'],
        envVars: ['ANTHROPIC_API_KEY', 'CLAUDE_SESSION'],
        fileMarkers: ['.anthropic', '.claude'],
        confidence: 90
      },
      cursor: {
        processNames: ['cursor', 'cursor-server'],
        envVars: ['CURSOR_SESSION', 'CURSOR_USER_ID'],
        fileMarkers: ['.cursor', '.cursorrules'],
        confidence: 90
      },
      'github-copilot': {
        processNames: ['copilot', 'github-copilot'],
        envVars: ['GITHUB_COPILOT_TOKEN'],
        fileMarkers: ['.github/copilot'],
        confidence: 85
      },
      aider: {
        processNames: ['aider', 'aider-cli'],
        envVars: ['AIDER_MODEL', 'AIDER_API_KEY'],
        fileMarkers: ['.aider'],
        confidence: 90
      }
    };
  }

  /**
   * Detect which agent made the change
   * @param change - The file change event
   * @param context - Additional context (process, env, etc)
   * @returns Detection result with agent, confidence, and signals
   */
  detectAgent(change: FileChange, context: DetectionContext = {}): DetectionResult {
    const cacheKey = `${change.filepath}_${change.timestamp}`;

    // Check cache first
    if (this.detectionCache.has(cacheKey)) {
      return this.detectionCache.get(cacheKey)!;
    }

    const signals: DetectionSignal[] = [];

    // Signal 1: Process name detection
    const processSignal = this.detectFromProcess(context.processName);
    if (processSignal) signals.push(processSignal);

    // Signal 2: Environment variables
    const envSignal = this.detectFromEnv(context.env || process.env);
    if (envSignal) signals.push(envSignal);

    // Signal 3: File markers (check project root)
    const markerSignal = this.detectFromFileMarkers(context.projectRoot);
    if (markerSignal) signals.push(markerSignal);

    // Signal 4: Change pattern analysis
    const patternSignal = this.analyzeChangePattern(change);
    if (patternSignal) signals.push(patternSignal);

    // Signal 5: Git commit info
    const gitSignal = this.analyzeGitInfo(change.filepath);
    if (gitSignal) signals.push(gitSignal);

    // Aggregate signals to determine agent
    const result = this.aggregateSignals(signals);

    // Cache the result
    this.detectionCache.set(cacheKey, result);

    return result;
  }

  private detectFromProcess(processName?: string): DetectionSignal | null {
    if (!processName) return null;

    const lower = processName.toLowerCase();
    for (const [agent, pattern] of Object.entries(this.processPatterns)) {
      for (const name of pattern.processNames) {
        if (lower.includes(name)) {
          return {
            agent: agent as AgentType,
            confidence: pattern.confidence,
            signal: 'process_name',
            value: processName
          };
        }
      }
    }
    return null;
  }

  private detectFromEnv(env: NodeJS.ProcessEnv): DetectionSignal | null {
    for (const [agent, pattern] of Object.entries(this.processPatterns)) {
      for (const envVar of pattern.envVars) {
        if (env[envVar]) {
          return {
            agent: agent as AgentType,
            confidence: pattern.confidence - 5, // Slightly lower confidence
            signal: 'environment_variable',
            value: envVar
          };
        }
      }
    }
    return null;
  }

  private detectFromFileMarkers(projectRoot?: string): DetectionSignal | null {
    if (!projectRoot) return null;

    for (const [agent, pattern] of Object.entries(this.processPatterns)) {
      for (const marker of pattern.fileMarkers) {
        const markerPath = join(projectRoot, marker);
        if (existsSync(markerPath)) {
          return {
            agent: agent as AgentType,
            confidence: pattern.confidence - 10, // Lower confidence for file markers
            signal: 'file_marker',
            value: marker
          };
        }
      }
    }
    return null;
  }

  private analyzeChangePattern(change: FileChange): DetectionSignal | null {
    // Different agents have characteristic editing patterns
    if (!change.diff) return null;

    const lines = change.diff.split('\n');
    const additions = lines.filter(l => l.startsWith('+')).length;
    const deletions = lines.filter(l => l.startsWith('-')).length;
    const total = additions + deletions;

    // Pattern heuristics (based on observed behavior)
    if (total < 5 && additions > deletions * 2) {
      // Copilot: Small autocomplete-style additions
      return {
        agent: 'github-copilot',
        confidence: 60,
        signal: 'change_pattern',
        value: 'small_additions'
      };
    } else if (total > 100 && Math.abs(additions - deletions) < 20) {
      // Claude Code: Large balanced refactors
      return {
        agent: 'claude-code',
        confidence: 65,
        signal: 'change_pattern',
        value: 'large_refactor'
      };
    } else if (total > 50 && deletions > additions * 2) {
      // ANT: Aggressive cleanup
      return {
        agent: 'ant',
        confidence: 60,
        signal: 'change_pattern',
        value: 'aggressive_cleanup'
      };
    } else if (total < 20 && additions === deletions) {
      // Cursor: Precise single-line edits
      return {
        agent: 'cursor',
        confidence: 65,
        signal: 'change_pattern',
        value: 'precise_edit'
      };
    }

    return null;
  }

  private analyzeGitInfo(filepath: string): DetectionSignal | null {
    try {
      // Try to get the author of the most recent change to this file
      // Use execFileSync with array args to prevent command injection
      const author = execFileSync('git', ['log', '-1', '--format=%an', '--', filepath], {
        encoding: 'utf8',
        timeout: 1000,
        shell: false // CRITICAL: disable shell to prevent injection
      }).trim();

      if (author.toLowerCase().includes('claude')) {
        return { agent: 'claude-code', confidence: 70, signal: 'git_author', value: author };
      } else if (author.toLowerCase().includes('cursor')) {
        return { agent: 'cursor', confidence: 70, signal: 'git_author', value: author };
      } else if (author.toLowerCase().includes('copilot')) {
        return { agent: 'github-copilot', confidence: 70, signal: 'git_author', value: author };
      } else if (author.toLowerCase().includes('ant')) {
        return { agent: 'ant', confidence: 70, signal: 'git_author', value: author };
      }
    } catch (_e) {
      // Git command failed, that's okay
    }
    return null;
  }

  private aggregateSignals(signals: DetectionSignal[]): DetectionResult {
    if (signals.length === 0) {
      return { agent: 'manual', confidence: 80, signals: ['no_agent_detected'] };
    }

    // Score each agent based on signals
    const agentScores = new Map<string, number>();

    for (const signal of signals) {
      const currentScore = agentScores.get(signal.agent) || 0;
      agentScores.set(signal.agent, currentScore + signal.confidence);
    }

    // Find the agent with highest score
    let bestAgent: AgentType = 'unknown';
    let bestScore = 0;

    for (const [agent, score] of agentScores.entries()) {
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent as AgentType;
      }
    }

    // Normalize confidence (max 95%)
    const confidence = Math.min(bestScore, 95);

    // If confidence is low, mark as unknown
    if (confidence < 50) {
      return {
        agent: 'unknown',
        confidence: 50,
        signals: signals.map(s => s.signal)
      };
    }

    return {
      agent: bestAgent,
      confidence,
      signals: signals.filter(s => s.agent === bestAgent).map(s => s.signal)
    };
  }

  /**
   * Get current running agent (if any)
   * Useful for real-time detection
   */
  getCurrentAgent(): DetectionResult {
    try {
      // Try to detect from current process tree
      // Use execFileSync for better security (no shell injection risk)
      const processes = execFileSync('ps', ['aux'], {
        encoding: 'utf8',
        shell: false // Disable shell for security
      });

      for (const [agent, pattern] of Object.entries(this.processPatterns)) {
        for (const processName of pattern.processNames) {
          if (processes.toLowerCase().includes(processName)) {
            return {
              agent: agent as AgentType,
              confidence: pattern.confidence,
              active: true,
              signals: ['process_tree']
            };
          }
        }
      }
    } catch (_e) {
      // Process listing failed
    }

    return { agent: 'none', confidence: 90, active: false, signals: [] };
  }

  /**
   * Clear the detection cache (call periodically to avoid memory growth)
   */
  clearCache(): void {
    this.detectionCache.clear();
  }
}

// Singleton instance
export const agentDetector = new AgentDetector();
