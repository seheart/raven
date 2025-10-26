/**
 * Tests for Helper Utilities
 */

import { jest } from '@jest/globals';
import {
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
} from '../../utils/helpers.js';

describe('Helper Utilities', () => {
  describe('getAgentColor', () => {
    test('should return correct color for known agents', () => {
      expect(getAgentColor('cline')).toBe('#e74c3c');
      expect(getAgentColor('cursor')).toBe('#3498db');
      expect(getAgentColor('claude-code')).toBe('#9b59b6');
    });

    test('should return default color for unknown agent', () => {
      expect(getAgentColor('unknown')).toBe('#95a5a6');
      expect(getAgentColor(null)).toBe('#95a5a6');
    });

    test('should be case insensitive', () => {
      expect(getAgentColor('CLINE')).toBe('#e74c3c');
      expect(getAgentColor('Cursor')).toBe('#3498db');
    });
  });

  describe('calculateFileHash', () => {
    test('should generate consistent SHA-256 hash', () => {
      const content = 'test content';
      const hash1 = calculateFileHash(content);
      const hash2 = calculateFileHash(content);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex characters
    });

    test('should generate different hashes for different content', () => {
      const hash1 = calculateFileHash('content 1');
      const hash2 = calculateFileHash('content 2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('generateDiff', () => {
    test('should generate unified diff', () => {
      const oldContent = 'line 1\nline 2\nline 3';
      const newContent = 'line 1\nmodified line 2\nline 3';

      const diff = generateDiff(oldContent, newContent);

      expect(diff).toContain('---');
      expect(diff).toContain('+++');
      expect(diff).toContain('-line 2');
      expect(diff).toContain('+modified line 2');
    });

    test('should handle empty content', () => {
      const diff = generateDiff('', 'new content');
      expect(diff).toBeDefined();
    });
  });

  describe('detectLanguage', () => {
    test('should detect JavaScript', () => {
      expect(detectLanguage('file.js')).toBe('javascript');
      expect(detectLanguage('file.jsx')).toBe('javascript');
    });

    test('should detect TypeScript', () => {
      expect(detectLanguage('file.ts')).toBe('typescript');
      expect(detectLanguage('file.tsx')).toBe('typescript');
    });

    test('should detect Python', () => {
      expect(detectLanguage('script.py')).toBe('python');
    });

    test('should detect markup languages', () => {
      expect(detectLanguage('page.html')).toBe('html');
      expect(detectLanguage('styles.css')).toBe('css');
      expect(detectLanguage('config.json')).toBe('json');
      expect(detectLanguage('doc.md')).toBe('markdown');
    });

    test('should return plaintext for unknown extensions', () => {
      expect(detectLanguage('file.unknown')).toBe('plaintext');
      expect(detectLanguage('no-extension')).toBe('plaintext');
    });
  });

  describe('detectProjectFromPath', () => {
    test('should detect project from file path', () => {
      const projectPaths = new Map();
      projectPaths.set('project1', '/home/user/project1');
      projectPaths.set('project2', '/home/user/project2');

      expect(detectProjectFromPath('/home/user/project1/src/file.js', projectPaths)).toBe('project1');
      expect(detectProjectFromPath('/home/user/project2/test.js', projectPaths)).toBe('project2');
    });

    test('should return null for no match', () => {
      const projectPaths = new Map();
      projectPaths.set('project1', '/home/user/project1');

      expect(detectProjectFromPath('/home/other/file.js', projectPaths)).toBeNull();
    });

    test('should handle empty project paths', () => {
      expect(detectProjectFromPath('/any/path', new Map())).toBeNull();
      expect(detectProjectFromPath('/any/path', null)).toBeNull();
    });
  });

  describe('formatBytes', () => {
    test('should format bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    });

    test('should handle decimal values', () => {
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
    });
  });

  describe('parseDuration', () => {
    test('should parse milliseconds', () => {
      expect(parseDuration('100ms')).toBe(100);
      expect(parseDuration('500ms')).toBe(500);
    });

    test('should parse seconds', () => {
      expect(parseDuration('1s')).toBe(1000);
      expect(parseDuration('30s')).toBe(30000);
    });

    test('should parse minutes', () => {
      expect(parseDuration('1m')).toBe(60000);
      expect(parseDuration('5m')).toBe(300000);
    });

    test('should parse hours', () => {
      expect(parseDuration('1h')).toBe(3600000);
      expect(parseDuration('2h')).toBe(7200000);
    });

    test('should parse days', () => {
      expect(parseDuration('1d')).toBe(86400000);
    });

    test('should return 0 for invalid format', () => {
      expect(parseDuration('invalid')).toBe(0);
      expect(parseDuration('100')).toBe(0);
    });
  });

  describe('sleep', () => {
    test('should sleep for specified milliseconds', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow 5ms tolerance
    });
  });

  describe('retry', () => {
    test('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await retry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('should retry on failure', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const result = await retry(fn, { maxAttempts: 3, delayMs: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    test('should throw after max attempts', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('always fails'));

      await expect(retry(fn, { maxAttempts: 2, delayMs: 10 }))
        .rejects.toThrow('always fails');

      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('sanitizeFilename', () => {
    test('should sanitize dangerous characters', () => {
      expect(sanitizeFilename('file name.txt')).toBe('file_name.txt');
      expect(sanitizeFilename('file/name')).toBe('file_name');
      expect(sanitizeFilename('file\\name')).toBe('file_name');
    });

    test('should allow alphanumeric, dots, and dashes', () => {
      expect(sanitizeFilename('file-name.txt')).toBe('file-name.txt');
      expect(sanitizeFilename('file123.pdf')).toBe('file123.pdf');
    });

    test('should truncate long filenames', () => {
      const longName = 'a'.repeat(300);
      const sanitized = sanitizeFilename(longName);

      expect(sanitized.length).toBeLessThanOrEqual(255);
    });
  });

  describe('isValidJSON', () => {
    test('should validate JSON strings', () => {
      expect(isValidJSON('{"key": "value"}')).toBe(true);
      expect(isValidJSON('[1, 2, 3]')).toBe(true);
      expect(isValidJSON('"string"')).toBe(true);
      expect(isValidJSON('123')).toBe(true);
      expect(isValidJSON('true')).toBe(true);
    });

    test('should reject invalid JSON', () => {
      expect(isValidJSON('not json')).toBe(false);
      expect(isValidJSON('{invalid}')).toBe(false);
      expect(isValidJSON('')).toBe(false);
    });
  });

  describe('deepClone', () => {
    test('should deep clone objects', () => {
      const original = { a: 1, b: { c: 2 } };
      const cloned = deepClone(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.b).not.toBe(original.b);
    });

    test('should handle arrays', () => {
      const original = [1, 2, [3, 4]];
      const cloned = deepClone(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned[2]).not.toBe(original[2]);
    });
  });

  describe('truncate', () => {
    test('should truncate long strings', () => {
      const long = 'a'.repeat(200);
      const truncated = truncate(long, 100);

      expect(truncated.length).toBe(100);
      expect(truncated).toEndWith('...');
    });

    test('should not truncate short strings', () => {
      const short = 'short string';
      expect(truncate(short, 100)).toBe(short);
    });
  });

  describe('getWeekKey and getWeekNumber', () => {
    test('should generate week key', () => {
      const key = getWeekKey('2025-01-15');

      expect(key).toMatch(/^\d{4}-W\d{2}$/);
      expect(key).toContain('2025');
    });

    test('should calculate week number', () => {
      const date = new Date('2025-01-15');
      const weekNum = getWeekNumber(date);

      expect(typeof weekNum).toBe('number');
      expect(weekNum).toBeGreaterThan(0);
      expect(weekNum).toBeLessThanOrEqual(53);
    });
  });

  describe('detectChangeType', () => {
    test('should detect feature commits', () => {
      expect(detectChangeType('feat: add new feature', '')).toBe('feature');
      expect(detectChangeType('feature: something new', '')).toBe('feature');
      expect(detectChangeType('add: new component', '')).toBe('feature');
    });

    test('should detect bug fixes', () => {
      expect(detectChangeType('fix: repair bug', '')).toBe('bugfix');
      expect(detectChangeType('bug: fix issue', '')).toBe('bugfix');
    });

    test('should detect refactoring', () => {
      expect(detectChangeType('refactor: improve code', '')).toBe('refactor');
    });

    test('should detect documentation', () => {
      expect(detectChangeType('docs: update readme', '')).toBe('documentation');
    });

    test('should fallback to other', () => {
      expect(detectChangeType('random commit', '')).toBe('other');
    });
  });

  describe('cleanDescription', () => {
    test('should remove conventional commit prefixes', () => {
      expect(cleanDescription('feat: add feature')).toBe('add feature');
      expect(cleanDescription('fix(scope): fix bug')).toBe('fix bug');
      expect(cleanDescription('docs: update')).toBe('update');
    });

    test('should handle messages without prefix', () => {
      expect(cleanDescription('regular message')).toBe('regular message');
    });
  });
});
