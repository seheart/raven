/**
 * Tests for Pattern Checker Service
 */

import { jest } from '@jest/globals';

// Create mock functions before jest.mock
const mockReadFileSync = jest.fn();
const mockExtname = jest.fn(path => {
  const match = path.match(/\.[^.]+$/);
  return match ? match[0].toLowerCase() : '';
});
const mockBasename = jest.fn(path => path.split('/').pop());

// Mock fs module
jest.mock('fs', () => ({
  readFileSync: mockReadFileSync
}));

// Mock path module
jest.mock('path', () => ({
  extname: mockExtname,
  basename: mockBasename
}));

import * as fs from 'fs';
import * as path from 'path';
import { PatternChecker } from '../../services/pattern-checker.js';

describe('PatternChecker', () => {
  let checker;
  let mockDb;
  let mockIo;
  const sessionId = 'test-session-123';
  const projectName = 'test-project';

  beforeEach(() => {
    mockDb = {
      clearPatternWarnings: jest.fn(),
      insertPatternWarning: jest.fn().mockReturnValue(1)
    };

    mockIo = {
      emit: jest.fn()
    };

    checker = new PatternChecker(mockDb, sessionId, mockIo, projectName);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockReadFileSync.mockReset();
    mockExtname.mockImplementation(path => {
      const match = path.match(/\.[^.]+$/);
      return match ? match[0].toLowerCase() : '';
    });
    mockBasename.mockImplementation(path => path.split('/').pop());
  });

  describe('Constructor', () => {
    test('should initialize with required dependencies', () => {
      expect(checker.db).toBe(mockDb);
      expect(checker.sessionId).toBe(sessionId);
      expect(checker.io).toBe(mockIo);
      expect(checker.projectName).toBe(projectName);
    });

    test('should initialize with pattern definitions', () => {
      expect(checker.patterns).toBeDefined();
      expect(Array.isArray(checker.patterns)).toBe(true);
      expect(checker.patterns.length).toBeGreaterThan(0);
    });

    test('should have security patterns', () => {
      const securityPatterns = checker.patterns.filter(p => p.category === 'security');
      expect(securityPatterns.length).toBeGreaterThan(0);
      expect(securityPatterns.some(p => p.name === 'hardcoded-credential')).toBe(true);
      expect(securityPatterns.some(p => p.name === 'eval-usage')).toBe(true);
    });

    test('should have quality patterns', () => {
      const qualityPatterns = checker.patterns.filter(p => p.category === 'quality');
      expect(qualityPatterns.length).toBeGreaterThan(0);
      expect(qualityPatterns.some(p => p.name === 'console-log')).toBe(true);
      expect(qualityPatterns.some(p => p.name === 'debugger')).toBe(true);
      expect(qualityPatterns.some(p => p.name === 'todo-comment')).toBe(true);
    });

    test('should have maintenance patterns', () => {
      const maintenancePatterns = checker.patterns.filter(p => p.category === 'maintenance');
      expect(maintenancePatterns.length).toBeGreaterThan(0);
      expect(maintenancePatterns.some(p => p.name === 'long-line')).toBe(true);
    });
  });

  describe('checkFile() - File Filtering', () => {
    test('should skip binary files', async () => {
      const result = await checker.checkFile('/path/to/image.png');
      expect(result).toEqual([]);
      expect(mockReadFileSync).not.toHaveBeenCalled();
    });

    test('should skip common binary extensions', async () => {
      const binaryExts = [
        '.jpg',
        '.jpeg',
        '.gif',
        '.svg',
        '.ico',
        '.woff',
        '.woff2',
        '.ttf',
        '.eot',
        '.mp4',
        '.mp3'
      ];

      for (const ext of binaryExts) {
        const result = await checker.checkFile(`/path/to/file${ext}`);
        expect(result).toEqual([]);
      }
    });

    test('should skip node_modules', async () => {
      const result = await checker.checkFile('/path/node_modules/package/index.js');
      expect(result).toEqual([]);
      expect(mockReadFileSync).not.toHaveBeenCalled();
    });

    test('should skip .git directory', async () => {
      const result = await checker.checkFile('/path/.git/config');
      expect(result).toEqual([]);
    });

    test('should skip dist and build directories', async () => {
      expect(await checker.checkFile('/path/dist/bundle.js')).toEqual([]);
      expect(await checker.checkFile('/path/build/index.js')).toEqual([]);
    });

    test('should process valid source files', async () => {
      mockReadFileSync.mockReturnValue('const x = 1;');

      const result = await checker.checkFile('/path/to/source.js');

      expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/source.js', 'utf-8');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('checkFile() - Security Pattern Detection', () => {
    test('should detect hardcoded credentials', async () => {
      const content = `
        const password = "secret123";
        const api_key = 'my-api-key';
        const token = "abc123def";
      `;
      mockReadFileSync.mockReturnValue(content);

      const result = await checker.checkFile('/path/to/file.js');

      expect(result.length).toBeGreaterThan(0);
      expect(result.some(w => w.name === 'hardcoded-credential')).toBe(true);
      expect(result.some(w => w.severity === 'error')).toBe(true);
    });

    test('should detect eval usage', async () => {
      const content = `
        const result = eval("2 + 2");
        eval(userInput);
      `;
      mockReadFileSync.mockReturnValue(content);

      const result = await checker.checkFile('/path/to/file.js');

      const evalWarnings = result.filter(w => w.name === 'eval-usage');
      expect(evalWarnings.length).toBeGreaterThan(0);
      expect(evalWarnings[0].severity).toBe('warning');
    });

    test('should emit WebSocket event for critical security issues', async () => {
      const content = 'const password = "secret123";';
      mockReadFileSync.mockReturnValue(content);

      await checker.checkFile('/path/to/file.js');

      expect(mockIo.emit).toHaveBeenCalledWith(
        'pattern-warning',
        expect.objectContaining({
          severity: 'error',
          category: 'security'
        })
      );
    });
  });

  describe('checkFile() - Quality Pattern Detection', () => {
    test('should detect console statements', async () => {
      const content = `
        console.log("debug");
        console.warn("warning");
        console.error("error");
      `;
      mockReadFileSync.mockReturnValue(content);

      const result = await checker.checkFile('/path/to/file.js');

      const consoleWarnings = result.filter(w => w.name === 'console-log');
      expect(consoleWarnings.length).toBeGreaterThan(0);
    });

    test('should detect debugger statements', async () => {
      const content = `
        function test() {
          debugger;
          return 42;
        }
      `;
      mockReadFileSync.mockReturnValue(content);

      const result = await checker.checkFile('/path/to/file.js');

      expect(result.some(w => w.name === 'debugger')).toBe(true);
    });

    test('should detect TODO comments', async () => {
      const content = `
        // TODO: Fix this later
        // FIXME: Broken logic
        // HACK: Temporary solution
        /* XXX: Needs review */
      `;
      mockReadFileSync.mockReturnValue(content);

      const result = await checker.checkFile('/path/to/file.js');

      const todoWarnings = result.filter(w => w.name === 'todo-comment');
      expect(todoWarnings.length).toBeGreaterThan(0);
      expect(todoWarnings[0].severity).toBe('info');
    });
  });

  describe('checkFile() - Maintenance Pattern Detection', () => {
    test('should detect long lines', async () => {
      const longLine = 'a'.repeat(250);
      const content = `
        const short = 1;
        ${longLine}
        const another = 2;
      `;
      mockReadFileSync.mockReturnValue(content);

      const result = await checker.checkFile('/path/to/file.js');

      const longLineWarnings = result.filter(w => w.name === 'long-line');
      expect(longLineWarnings.length).toBeGreaterThan(0);
      expect(longLineWarnings[0].severity).toBe('info');
      expect(longLineWarnings[0].line).toBe(3);
    });

    test('should truncate long line match text', async () => {
      const longLine = 'x'.repeat(250);
      mockReadFileSync.mockReturnValue(longLine);

      const result = await checker.checkFile('/path/to/file.js');

      const warning = result.find(w => w.name === 'long-line');
      expect(warning.matchText).toContain('...');
      expect(warning.matchText.length).toBeLessThan(longLine.length);
    });
  });

  describe('checkFile() - Database Operations', () => {
    test('should clear old warnings before inserting new ones', async () => {
      mockReadFileSync.mockReturnValue('const x = 1;');

      await checker.checkFile('/path/to/file.js');

      expect(mockDb.clearPatternWarnings).toHaveBeenCalledWith('/path/to/file.js');
    });

    test('should insert warnings into database', async () => {
      const content = 'console.log("test");';
      mockReadFileSync.mockReturnValue(content);

      await checker.checkFile('/path/to/file.js');

      expect(mockDb.insertPatternWarning).toHaveBeenCalled();
      expect(mockDb.insertPatternWarning).toHaveBeenCalledWith(
        expect.any(String), // timestamp
        '/path/to/file.js',
        projectName,
        'quality',
        'warning',
        'console-log',
        expect.any(String),
        expect.any(Number),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        sessionId
      );
    });

    test('should insert multiple warnings', async () => {
      const content = `
        console.log("test");
        debugger;
        // TODO: fix this
      `;
      mockReadFileSync.mockReturnValue(content);

      await checker.checkFile('/path/to/file.js');

      expect(mockDb.insertPatternWarning.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('checkFile() - Error Handling', () => {
    test('should handle file read errors', async () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = await checker.checkFile('/nonexistent/file.js');

      expect(result).toEqual([]);
    });

    test('should handle encoding errors', async () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Invalid UTF-8');
      });

      const result = await checker.checkFile('/path/to/binary.exe');

      expect(result).toEqual([]);
    });

    test('should not throw on database errors', async () => {
      mockReadFileSync.mockReturnValue('console.log("test");');
      mockDb.insertPatternWarning.mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = await checker.checkFile('/path/to/file.js');

      expect(result).toBeInstanceOf(Array);
    });
  });

  describe('findPatternMatches()', () => {
    test('should find multiple matches of same pattern', () => {
      const content = `
        console.log("first");
        const x = 1;
        console.log("second");
        console.error("third");
      `;
      const lines = content.split('\n');
      const pattern = checker.patterns.find(p => p.name === 'console-log');

      const matches = checker.findPatternMatches(content, lines, pattern);

      expect(matches.length).toBeGreaterThan(1);
      matches.forEach(match => {
        expect(match.name).toBe('console-log');
        expect(match.line).toBeGreaterThan(0);
        expect(match.matchText).toBeTruthy();
      });
    });

    test('should include line numbers', () => {
      const content = `line1
line2
console.log("test")
line4`;
      const lines = content.split('\n');
      const pattern = checker.patterns.find(p => p.name === 'console-log');

      const matches = checker.findPatternMatches(content, lines, pattern);

      expect(matches[0].line).toBe(3);
    });

    test('should include context for each match', () => {
      const content = 'console.log("hello world");';
      const lines = content.split('\n');
      const pattern = checker.patterns.find(p => p.name === 'console-log');

      const matches = checker.findPatternMatches(content, lines, pattern);

      expect(matches[0].context).toBe('console.log("hello world");');
    });

    test('should handle long-line pattern specially', () => {
      const longLine = 'x'.repeat(250);
      const content = `short\n${longLine}\nshort`;
      const lines = content.split('\n');
      const pattern = checker.patterns.find(p => p.name === 'long-line');

      const matches = checker.findPatternMatches(content, lines, pattern);

      expect(matches.length).toBe(1);
      expect(matches[0].line).toBe(2);
      expect(matches[0].matchText).toContain('...');
    });
  });

  describe('Pattern Definitions', () => {
    test('all patterns should have required fields', () => {
      checker.patterns.forEach(pattern => {
        expect(pattern).toMatchObject({
          category: expect.any(String),
          name: expect.any(String),
          regex: expect.any(RegExp),
          message: expect.any(String),
          suggestion: expect.any(String),
          severity: expect.stringMatching(/error|warning|info/)
        });
      });
    });

    test('should have varied severity levels', () => {
      const severities = new Set(checker.patterns.map(p => p.severity));
      expect(severities.has('error')).toBe(true);
      expect(severities.has('warning')).toBe(true);
      expect(severities.has('info')).toBe(true);
    });

    test('should have multiple categories', () => {
      const categories = new Set(checker.patterns.map(p => p.category));
      expect(categories.has('security')).toBe(true);
      expect(categories.has('quality')).toBe(true);
      expect(categories.has('maintenance')).toBe(true);
    });
  });

  describe('Integration', () => {
    test('should process real file content correctly', async () => {
      const realContent = `
        import { readFileSync } from 'fs';

        const API_KEY = "hardcoded-key"; // Security issue

        function processData(data) {
          console.log("Processing:", data); // Quality issue
          // TODO: Add error handling // Info
          debugger; // Quality issue
          return data;
        }
      `;
      mockReadFileSync.mockReturnValue(realContent);

      const result = await checker.checkFile('/path/to/real-file.js');

      expect(result.length).toBeGreaterThan(3);
      expect(result.some(w => w.category === 'security')).toBe(true);
      expect(result.some(w => w.category === 'quality')).toBe(true);
      expect(result.some(w => w.severity === 'error')).toBe(true);
      expect(result.some(w => w.severity === 'warning')).toBe(true);
      expect(result.some(w => w.severity === 'info')).toBe(true);
    });

    test('should handle empty files', async () => {
      mockReadFileSync.mockReturnValue('');

      const result = await checker.checkFile('/path/to/empty.js');

      expect(result).toEqual([]);
      expect(mockDb.clearPatternWarnings).toHaveBeenCalled();
    });

    test('should handle files with no issues', async () => {
      const cleanContent = `
        export function add(a, b) {
          return a + b;
        }
      `;
      mockReadFileSync.mockReturnValue(cleanContent);

      const result = await checker.checkFile('/path/to/clean.js');

      expect(result).toEqual([]);
      expect(mockDb.clearPatternWarnings).toHaveBeenCalled();
    });
  });

  describe('Additional Edge Cases', () => {
    test('should detect hardcoded credentials with different naming patterns', async () => {
      const content = `
        const passwd = "mypassword";
        const pwd = "secret";
        const secret = "topsecret";
        const apiKey = "key123";
      `;
      mockReadFileSync.mockReturnValue(content);

      const result = await checker.checkFile('/path/to/file.js');

      const credentialWarnings = result.filter(w => w.name === 'hardcoded-credential');
      expect(credentialWarnings.length).toBeGreaterThan(0);
    });

    test('should detect console.info and console.debug', async () => {
      const content = `
        console.info("info message");
        console.debug("debug message");
      `;
      mockReadFileSync.mockReturnValue(content);

      const result = await checker.checkFile('/path/to/file.js');

      const consoleWarnings = result.filter(w => w.name === 'console-log');
      expect(consoleWarnings.length).toBe(2);
    });

    test('should detect TODO with hash comment style', async () => {
      const content = `
        # TODO: Python style comment
        # FIXME: Another Python style
      `;
      mockReadFileSync.mockReturnValue(content);

      const result = await checker.checkFile('/path/to/file.py');

      const todoWarnings = result.filter(w => w.name === 'todo-comment');
      expect(todoWarnings.length).toBe(2);
    });

    test('should handle multiple long lines', async () => {
      const longLine1 = 'a'.repeat(250);
      const longLine2 = 'b'.repeat(300);
      const content = `
        short line
        ${longLine1}
        another short
        ${longLine2}
      `;
      mockReadFileSync.mockReturnValue(content);

      const result = await checker.checkFile('/path/to/file.js');

      const longLineWarnings = result.filter(w => w.name === 'long-line');
      expect(longLineWarnings.length).toBe(2);
    });

    test('should not emit WebSocket event for non-critical warnings', async () => {
      const content = 'console.log("test");';
      mockReadFileSync.mockReturnValue(content);

      await checker.checkFile('/path/to/file.js');

      expect(mockIo.emit).not.toHaveBeenCalled();
    });

    test('should handle case-insensitive pattern matching', async () => {
      const content = `
        const PASSWORD = "secret";
        const Secret = "value";
      `;
      mockReadFileSync.mockReturnValue(content);

      const result = await checker.checkFile('/path/to/file.js');

      const credentialWarnings = result.filter(w => w.name === 'hardcoded-credential');
      expect(credentialWarnings.length).toBeGreaterThan(0);
    });

    test('should handle files with uppercase extensions', async () => {
      mockReadFileSync.mockReturnValue('const x = 1;');

      const result = await checker.checkFile('/path/to/FILE.JS');

      expect(mockReadFileSync).toHaveBeenCalled();
    });

    test('should skip .PNG extension (case insensitive)', async () => {
      const result = await checker.checkFile('/path/to/image.PNG');

      expect(result).toEqual([]);
      expect(mockReadFileSync).not.toHaveBeenCalled();
    });

    test('should include WebSocket event with all required fields', async () => {
      const content = 'const password = "secret";';
      mockReadFileSync.mockReturnValue(content);

      await checker.checkFile('/path/to/file.js');

      expect(mockIo.emit).toHaveBeenCalledWith(
        'pattern-warning',
        expect.objectContaining({
          id: 1,
          timestamp: expect.any(String),
          filepath: '/path/to/file.js',
          project_name: projectName,
          category: 'security',
          severity: 'error',
          pattern_name: 'hardcoded-credential',
          message: expect.any(String),
          line_number: expect.any(Number),
          match_text: expect.any(String),
          context: expect.any(String)
        })
      );
    });

    test('should trim context before storing', async () => {
      const content = '       console.log("test");       ';
      mockReadFileSync.mockReturnValue(content);

      const result = await checker.checkFile('/path/to/file.js');

      expect(result[0].context).toBe('console.log("test");');
    });

    test('should handle pattern with no matches', async () => {
      const content = 'const x = 1; const y = 2;';
      mockReadFileSync.mockReturnValue(content);

      const result = await checker.checkFile('/path/to/file.js');

      expect(result).toEqual([]);
    });

    test('should handle findPatternMatches with empty lines array', () => {
      const content = '';
      const lines = [];
      const pattern = checker.patterns.find(p => p.name === 'console-log');

      const matches = checker.findPatternMatches(content, lines, pattern);

      expect(matches).toEqual([]);
    });

    test('should handle long-line pattern with exactly 200 characters', async () => {
      const exactlyLongLine = 'x'.repeat(200);
      mockReadFileSync.mockReturnValue(exactlyLongLine);

      const result = await checker.checkFile('/path/to/file.js');

      const longLineWarnings = result.filter(w => w.name === 'long-line');
      // Should not match exactly 200 characters (only >200)
      expect(longLineWarnings.length).toBe(0);
    });

    test('should handle long-line pattern with 201 characters', async () => {
      const justOverLongLine = 'x'.repeat(201);
      mockReadFileSync.mockReturnValue(justOverLongLine);

      const result = await checker.checkFile('/path/to/file.js');

      const longLineWarnings = result.filter(w => w.name === 'long-line');
      expect(longLineWarnings.length).toBe(1);
    });

    test('should handle pattern context limit of 200 characters', async () => {
      const veryLongLine = 'x'.repeat(500);
      mockReadFileSync.mockReturnValue(veryLongLine);

      const result = await checker.checkFile('/path/to/file.js');

      const warning = result.find(w => w.name === 'long-line');
      expect(warning.context.length).toBe(200);
    });

    test('should handle match with missing line in lines array', () => {
      const content = 'line1\nconsole.log("test")';
      const lines = ['line1']; // Missing second line
      const pattern = checker.patterns.find(p => p.name === 'console-log');

      const matches = checker.findPatternMatches(content, lines, pattern);

      expect(matches.length).toBe(1);
      expect(matches[0].context).toBe('');
    });
  });
});
