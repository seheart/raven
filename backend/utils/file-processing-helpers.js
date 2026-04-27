/**
 * File Processing Helper Functions
 * Extracted from handleFileChange() to reduce complexity and improve maintainability
 */

import fs from 'fs';
import { logger } from './logger.js';
import { LIMITS } from '../config/constants.js';

const BINARY_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.tiff',
  '.pdf', '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.mov', '.avi', '.mkv', '.flac',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.class', '.o', '.a',
  '.pyc', '.pyo', '.wasm'
];

/**
 * Check if file is binary based on extension
 * @param {string} filepath - File path to check
 * @returns {boolean} - True if binary
 */
export function isBinaryFile(filepath) {
  const ext = filepath.substring(filepath.lastIndexOf('.')).toLowerCase();
  return BINARY_EXTENSIONS.includes(ext);
}

const MAX_DIFF_BYTES = 64 * 1024;

/**
 * True if a path should never have its diff captured: binary by extension, or
 * a known auto-generated artifact (visual-regression PNGs, lockfiles).
 */
export function shouldSkipDiff(filepath) {
  if (isBinaryFile(filepath)) return true;
  if (filepath.includes('__diffs__/') || filepath.includes('__snapshots__/')) return true;
  const base = filepath.slice(filepath.lastIndexOf('/') + 1);
  return (
    base === 'package-lock.json' ||
    base === 'yarn.lock' ||
    base === 'pnpm-lock.yaml' ||
    base === 'poetry.lock' ||
    base === 'cargo.lock' ||
    base === 'uv.lock' ||
    base === 'composer.lock' ||
    base === 'Gemfile.lock' ||
    base === 'go.sum'
  );
}

/**
 * Cap a diff at MAX_DIFF_BYTES; longer diffs are truncated with a marker so
 * the events table can't be blown up by a single huge change.
 */
export function capDiff(diff) {
  if (!diff || diff.length <= MAX_DIFF_BYTES) return diff;
  return diff.slice(0, MAX_DIFF_BYTES) + `\n... [truncated, ${diff.length - MAX_DIFF_BYTES} bytes omitted]`;
}

/**
 * Check if file exists with retries for race conditions
 * @param {string} filepath - File path to check
 * @param {string} projectName - Project name for logging
 * @param {string} relPath - Relative path for logging
 * @returns {boolean} - True if file exists
 */
export function checkFileExists(filepath, projectName, relPath) {
  if (!fs.existsSync(filepath)) {
    logger.warn(`File disappeared before processing: [${projectName}] ${relPath}`);
    return false;
  }
  return true;
}

/**
 * Check file size and validate it's within limits
 * @param {string} filepath - File path to check
 * @param {string} projectName - Project name for logging
 * @param {string} relPath - Relative path for logging
 * @returns {Promise<{valid: boolean, size: number, stats: object|null}>}
 */
export async function validateFileSize(filepath, projectName, relPath) {
  const MAX_FILE_SIZE_BYTES = LIMITS.FILE.MAX_SIZE_BYTES;

  try {
    const stats = await fs.promises.stat(filepath);
    const fileSizeBytes = stats.size;

    if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
      logger.warn(
        `File too large to track: [${projectName}] ${relPath} (${(fileSizeBytes / 1024 / 1024).toFixed(2)} MB, limit: ${(MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(2)} MB)`
      );
      return { valid: false, size: fileSizeBytes, stats };
    }

    return { valid: true, size: fileSizeBytes, stats };
  } catch (error) {
    logger.error(`Failed to stat file [${projectName}] ${relPath}:`, error);
    return { valid: false, size: 0, stats: null };
  }
}

/**
 * Read binary file with size validation
 * @param {string} filepath - File path to read
 * @param {string} projectName - Project name for logging
 * @param {string} relPath - Relative path for logging
 * @returns {Promise<{success: boolean, buffer: Buffer|null, hash: string|null, size: number}>}
 */
export async function readBinaryFile(filepath, projectName, relPath, calculateFileHash) {
  const MAX_FILE_SIZE_BYTES = LIMITS.FILE.MAX_SIZE_BYTES;

  try {
    const buffer = await fs.promises.readFile(filepath);

    // Double-check actual size after reading (TOCTOU protection)
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      logger.warn(
        `Binary file exceeded size limit during read: [${projectName}] ${relPath} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`
      );
      return { success: false, buffer: null, hash: null, size: buffer.length, oversized: true };
    }

    const fileHash = calculateFileHash(buffer.toString('hex'));
    logger.debug(`Binary file detected: ${relPath}, skipping diff generation`);

    return { success: true, buffer, hash: fileHash, size: buffer.length, oversized: false };
  } catch (error) {
    logger.error(`Failed to read binary file [${projectName}] ${relPath}:`, error);
    return { success: false, buffer: null, hash: null, size: 0, error };
  }
}

/**
 * Read text file with size validation
 * @param {string} filepath - File path to read
 * @param {string} projectName - Project name for logging
 * @param {string} relPath - Relative path for logging
 * @returns {Promise<{success: boolean, content: string|null, hash: string|null, size: number}>}
 */
export async function readTextFile(filepath, projectName, relPath, calculateFileHash) {
  const MAX_FILE_SIZE_BYTES = LIMITS.FILE.MAX_SIZE_BYTES;

  try {
    const content = await fs.promises.readFile(filepath, 'utf8');

    // Double-check actual size after reading (TOCTOU protection)
    if (content.length > MAX_FILE_SIZE_BYTES) {
      logger.warn(
        `File exceeded size limit during read: [${projectName}] ${relPath} (${(content.length / 1024 / 1024).toFixed(2)} MB)`
      );
      return { success: false, content: null, hash: null, size: content.length, oversized: true };
    }

    const fileHash = calculateFileHash(content);

    return { success: true, content, hash: fileHash, size: content.length, oversized: false };
  } catch (error) {
    return { success: false, content: null, hash: null, size: 0, error };
  }
}

/**
 * Generate diff for edit events
 * @param {string} eventType - Type of event (create, edit, delete)
 * @param {string} content - New file content
 * @param {Map} fileCache - File cache for old content
 * @param {string} filepath - File path
 * @param {Function} generateDiff - Diff generation function
 * @returns {string|null} - Diff string or null
 */
export function generateFileDiff(eventType, content, fileCache, filepath, generateDiff) {
  let diff = null;

  if (eventType === 'edit' && fileCache.has(filepath)) {
    const oldContent = fileCache.get(filepath);
    diff = generateDiff(oldContent, content);
  }
  // For 'create' events, generate a synthetic diff showing all content as additions
  else if (eventType === 'create' && content) {
    const lines = content.split('\n');
    diff = `@@ -0,0 +1,${lines.length} @@\n` + lines.map(line => `+${line}`).join('\n');
  }

  return diff;
}

/**
 * Generate diff for delete events
 * @param {Map} fileCache - File cache for deleted content
 * @param {string} filepath - File path
 * @returns {{diff: string|null, size: number}} - Diff and size
 */
export function generateDeleteDiff(fileCache, filepath) {
  let diff = null;
  let eventSize = 0;

  if (fileCache.has(filepath)) {
    const deletedContent = fileCache.get(filepath);
    eventSize = deletedContent.length;

    // Generate a synthetic diff showing all content as deletions
    const lines = deletedContent.split('\n');
    diff = `@@ -1,${lines.length} +0,0 @@\n` + lines.map(line => `-${line}`).join('\n');
  }

  return { diff, size: eventSize };
}

/**
 * Calculate lines added/removed from diff
 * @param {string|null} diff - Diff string
 * @returns {{linesAdded: number, linesRemoved: number}}
 */
export function calculateDiffStats(diff) {
  if (!diff) {
    return { linesAdded: 0, linesRemoved: 0 };
  }

  const linesAdded = (diff.match(/^\+/gm) || []).length;
  const linesRemoved = (diff.match(/^-/gm) || []).length;

  return { linesAdded, linesRemoved };
}

/**
 * Handle file read errors with appropriate responses
 * @param {Error} error - Read error
 * @param {string} projectName - Project name
 * @param {string} relPath - Relative file path
 * @param {object} io - Socket.IO instance
 * @returns {{shouldRetry: boolean, shouldConvertToDelete: boolean}} - Error handling result
 */
export function handleFileReadError(error, projectName, relPath, io) {
  const timestamp = new Date().toISOString();

  if (error.code === 'ENOENT') {
    logger.warn(`File deleted during processing: [${projectName}] ${relPath}`);
    return { shouldRetry: false, shouldConvertToDelete: true };
  }

  if (error.code === 'EACCES') {
    logger.warn(`Permission denied: [${projectName}] ${relPath}`);
    io.emit('file-change-error', {
      filepath: relPath,
      project: projectName,
      error: 'Permission denied',
      timestamp
    });
    return { shouldRetry: false, shouldConvertToDelete: false };
  }

  logger.error(`Error reading file [${projectName}] ${relPath}:`, error);
  io.emit('file-change-error', {
    filepath: relPath,
    project: projectName,
    error: error.message || 'Unknown error',
    timestamp
  });

  return { shouldRetry: false, shouldConvertToDelete: false };
}

/**
 * Emit file too large event
 * @param {object} io - Socket.IO instance
 * @param {string} projectName - Project name
 * @param {string} relPath - Relative file path
 * @param {number} size - File size in bytes
 */
export function emitFileTooLargeEvent(io, projectName, relPath, size) {
  io.emit('file-too-large', {
    timestamp: new Date().toISOString(),
    project: projectName,
    filepath: relPath,
    size_bytes: size,
    limit_bytes: LIMITS.FILE.MAX_SIZE_BYTES
  });
}

/**
 * Detect programming language from file extension
 * @param {string} filepath - File path
 * @returns {string} - Language name
 */
export function detectLanguage(filepath) {
  const ext = filepath.substring(filepath.lastIndexOf('.')).toLowerCase();

  const languageMap = {
    '.js': 'javascript',
    '.ts': 'typescript',
    '.jsx': 'javascript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.go': 'go',
    '.rb': 'ruby',
    '.php': 'php',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.rs': 'rust',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.clj': 'clojure',
    '.ex': 'elixir',
    '.erl': 'erlang',
    '.hs': 'haskell',
    '.lua': 'lua',
    '.r': 'r',
    '.sql': 'sql',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.sass': 'sass',
    '.less': 'less',
    '.vue': 'vue',
    '.svelte': 'svelte',
    '.json': 'json',
    '.xml': 'xml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.md': 'markdown',
    '.sh': 'shell',
    '.bash': 'shell',
    '.zsh': 'shell'
  };

  return languageMap[ext] || 'unknown';
}
