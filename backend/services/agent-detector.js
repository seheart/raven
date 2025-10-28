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

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

export class AgentDetector {
  constructor() {
    this.detectionCache = new Map();
    this.processPatterns = this.loadProcessPatterns();
  }

  loadProcessPatterns() {
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
   * @param {Object} change - The file change event
   * @param {Object} context - Additional context (process, env, etc)
   * @returns {Object} { agent: string, confidence: number, signals: array }
   */
  detectAgent(change, context = {}) {
    const cacheKey = `${change.filepath}_${change.timestamp}`;

    // Check cache first
    if (this.detectionCache.has(cacheKey)) {
      return this.detectionCache.get(cacheKey);
    }

    const signals = [];

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

  detectFromProcess(processName) {
    if (!processName) return null;

    const lower = processName.toLowerCase();
    for (const [agent, pattern] of Object.entries(this.processPatterns)) {
      for (const name of pattern.processNames) {
        if (lower.includes(name)) {
          return {
            agent,
            confidence: pattern.confidence,
            signal: 'process_name',
            value: processName
          };
        }
      }
    }
    return null;
  }

  detectFromEnv(env) {
    for (const [agent, pattern] of Object.entries(this.processPatterns)) {
      for (const envVar of pattern.envVars) {
        if (env[envVar]) {
          return {
            agent,
            confidence: pattern.confidence - 5, // Slightly lower confidence
            signal: 'environment_variable',
            value: envVar
          };
        }
      }
    }
    return null;
  }

  detectFromFileMarkers(projectRoot) {
    if (!projectRoot) return null;

    for (const [agent, pattern] of Object.entries(this.processPatterns)) {
      for (const marker of pattern.fileMarkers) {
        const markerPath = join(projectRoot, marker);
        if (existsSync(markerPath)) {
          return {
            agent,
            confidence: pattern.confidence - 10, // Lower confidence for file markers
            signal: 'file_marker',
            value: marker
          };
        }
      }
    }
    return null;
  }

  analyzeChangePattern(change) {
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

  analyzeGitInfo(filepath) {
    try {
      // Try to get the author of the most recent change to this file
      const author = execSync(`git log -1 --format='%an' -- "${filepath}"`, {
        encoding: 'utf8',
        timeout: 1000
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

  aggregateSignals(signals) {
    if (signals.length === 0) {
      return { agent: 'manual', confidence: 80, signals: ['no_agent_detected'] };
    }

    // Score each agent based on signals
    const agentScores = new Map();

    for (const signal of signals) {
      const currentScore = agentScores.get(signal.agent) || 0;
      agentScores.set(signal.agent, currentScore + signal.confidence);
    }

    // Find the agent with highest score
    let bestAgent = 'unknown';
    let bestScore = 0;

    for (const [agent, score] of agentScores.entries()) {
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
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
  getCurrentAgent() {
    try {
      // Try to detect from current process tree
      const processes = execSync('ps aux', { encoding: 'utf8' });

      for (const [agent, pattern] of Object.entries(this.processPatterns)) {
        for (const processName of pattern.processNames) {
          if (processes.toLowerCase().includes(processName)) {
            return {
              agent,
              confidence: pattern.confidence,
              active: true
            };
          }
        }
      }
    } catch (_e) {
      // Process listing failed
    }

    return { agent: 'none', confidence: 90, active: false };
  }

  /**
   * Clear the detection cache (call periodically to avoid memory growth)
   */
  clearCache() {
    this.detectionCache.clear();
  }
}

// Singleton instance
export const agentDetector = new AgentDetector();
