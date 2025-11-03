/**
 * Helper Utilities
 *
 * Common helper functions used across the application.
 */

import crypto from 'crypto';
import { extname } from 'path';
import * as Diff from 'diff';

/**
 * Get color code for agent type
 */
export function getAgentColor(agentName) {
  const colors = {
    cline: '#e74c3c',
    cursor: '#3498db',
    'claude-code': '#9b59b6',
    default: '#95a5a6'
  };
  return colors[agentName?.toLowerCase()] || colors.default;
}

/**
 * Calculate SHA-256 hash of file content
 */
export function calculateFileHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Generate unified diff between old and new content
 */
export function generateDiff(oldContent, newContent) {
  const diff = Diff.createPatch('file', oldContent || '', newContent || '', '', '');
  return diff;
}

/**
 * Detect programming language from file extension
 */
export function detectLanguage(filepath) {
  const ext = extname(filepath).toLowerCase();
  const languageMap = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.rb': 'ruby',
    '.php': 'php',
    '.go': 'go',
    '.rs': 'rust',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.r': 'r',
    '.m': 'objective-c',
    '.mm': 'objective-c',
    '.pl': 'perl',
    '.sh': 'bash',
    '.bat': 'batch',
    '.ps1': 'powershell',
    '.lua': 'lua',
    '.html': 'html',
    '.htm': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.sass': 'sass',
    '.less': 'less',
    '.json': 'json',
    '.xml': 'xml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.toml': 'toml',
    '.ini': 'ini',
    '.sql': 'sql',
    '.md': 'markdown',
    '.tex': 'latex',
    '.vue': 'vue',
    '.svelte': 'svelte',
    '.dart': 'dart',
    '.ex': 'elixir',
    '.exs': 'elixir',
    '.erl': 'erlang',
    '.hs': 'haskell',
    '.ml': 'ocaml',
    '.clj': 'clojure',
    '.lisp': 'lisp',
    '.scm': 'scheme',
    '.f90': 'fortran',
    '.f95': 'fortran',
    '.jl': 'julia',
    '.v': 'verilog',
    '.vhd': 'vhdl'
  };

  return languageMap[ext] || 'plaintext';
}

/**
 * Detect project from file path
 * Looks for common project markers like package.json, .git, etc.
 */
export function detectProjectFromPath(filepath, projectPaths) {
  if (!projectPaths || projectPaths.size === 0) {
    return null;
  }

  // Find the project whose path is a prefix of the filepath
  for (const [projectName, projectPath] of projectPaths.entries()) {
    if (filepath.startsWith(projectPath)) {
      return projectName;
    }
  }

  return null;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Parse duration string to milliseconds
 */
export function parseDuration(durationStr) {
  const match = durationStr.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) return 0;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return value * (multipliers[unit] || 0);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry(fn, options = {}) {
  const maxAttempts = options.maxAttempts || 3;
  const delayMs = options.delayMs || 1000;
  const backoffMultiplier = options.backoffMultiplier || 2;

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Sanitize filename to remove dangerous characters
 */
export function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 255);
}

/**
 * Check if a value is a valid JSON string
 */
export function isValidJSON(str) {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deep clone an object (safe for circular references)
 */
export function deepClone(obj) {
  // Try structuredClone first (Node 17+)
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(obj);
    } catch (err) {
      // Fall through to JSON method
    }
  }

  // Fallback to JSON with error handling
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (err) {
    // If JSON fails (circular reference), do manual shallow clone
    if (err.message && err.message.includes('circular')) {
      logger.warn('deepClone: Circular reference detected, performing shallow clone');
      return { ...obj };
    }
    throw err;
  }
}

/**
 * Truncate string to max length
 */
export function truncate(str, maxLength = 100) {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Get week key for grouping (YYYY-WW format)
 */
export function getWeekKey(dateStr) {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const weekNum = getWeekNumber(date);
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Get ISO week number
 */
export function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/**
 * Detect change type from git commit message
 */
export function detectChangeType(subject, body) {
  const s = subject.toLowerCase();
  const b = (body || '').toLowerCase();
  const combined = `${s} ${b}`;

  if (/^(feat|feature|add|new|implement)/.test(s)) return 'feature';
  if (/^fix|bug|resolve|patch/.test(s)) return 'bugfix';
  if (/^refactor|restructure|reorganize/.test(s)) return 'refactor';
  if (/^docs?|documentation/.test(s)) return 'documentation';
  if (/^test|spec/.test(s)) return 'test';
  if (/^perf|performance|optim/.test(s)) return 'performance';
  if (/^style|format/.test(s)) return 'style';
  if (/^chore|build|ci|deps/.test(s)) return 'chore';

  // Check body for context
  if (/feature|feat/.test(combined)) return 'feature';
  if (/fix|bug/.test(combined)) return 'bugfix';

  return 'other';
}

/**
 * Clean git commit description
 */
export function cleanDescription(subject) {
  return subject
    .replace(/^(feat|fix|docs|style|refactor|test|chore|perf)(\(.+?\))?:\s*/i, '')
    .trim();
}

export default {
  getAgentColor,
  calculateFileHash,
  generateDiff,
  detectLanguage,
  detectProjectFromPath,
  formatBytes,
  parseDuration,
  sleep,
  retry,
  sanitizeFilename,
  isValidJSON,
  deepClone,
  truncate,
  getWeekKey,
  getWeekNumber,
  detectChangeType,
  cleanDescription
};
