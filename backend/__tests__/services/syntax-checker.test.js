/**
 * Tests for Syntax Checker Service
 */

import { jest } from '@jest/globals';
import { SyntaxChecker } from '../../services/syntax-checker.js';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs');

// Mock acorn module
const mockAcornParse = jest.fn();
jest.mock('acorn', () => ({
  parse: mockAcornParse
}));

describe('SyntaxChecker', () => {
  let checker;
  let mockDb;
  let mockIo;
  const sessionId = 'test-session-123';
  const projectName = 'test-project';

  beforeEach(() => {
    mockDb = {
      clearSyntaxErrors: jest.fn(),
      insertSyntaxError: jest.fn().mockReturnValue(1)
    };

    mockIo = {
      emit: jest.fn()
    };

    checker = new SyntaxChecker(mockDb, sessionId, mockIo, projectName);

    // Reset mocks
    jest.clearAllMocks();
    mockAcornParse.mockReset();
  });

  describe('Constructor', () => {
    test('should initialize with required dependencies', () => {
      expect(checker.db).toBe(mockDb);
      expect(checker.sessionId).toBe(sessionId);
      expect(checker.io).toBe(mockIo);
      expect(checker.projectName).toBe(projectName);
    });

    test('should initialize with null projectName', () => {
      const checkerNoProject = new SyntaxChecker(mockDb, sessionId, mockIo);
      expect(checkerNoProject.projectName).toBeNull();
    });
  });

  describe('checkFile() - File Filtering', () => {
    test('should skip node_modules', async () => {
      const result = await checker.checkFile('/path/node_modules/package/index.js');
      expect(result).toEqual([]);
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    test('should skip TypeScript declaration files (.d.ts)', async () => {
      const result = await checker.checkFile('/path/types.d.ts');
      expect(result).toEqual([]);
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    test('should skip dist directory', async () => {
      const result = await checker.checkFile('/path/dist/bundle.js');
      expect(result).toEqual([]);
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    test('should skip build directory', async () => {
      const result = await checker.checkFile('/path/build/index.js');
      expect(result).toEqual([]);
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    test('should skip unsupported file extensions', async () => {
      const result = await checker.checkFile('/path/to/file.txt');
      expect(result).toEqual([]);
    });

    test('should process valid source files', async () => {
      fs.readFileSync.mockReturnValue('const x = 1;');
      mockAcornParse.mockImplementation(() => {}); // No error

      const result = await checker.checkFile('/path/to/source.js');

      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/source.js', 'utf-8');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getLanguageFromExtension()', () => {
    test('should detect JavaScript files', () => {
      expect(checker.getLanguageFromExtension('.js')).toBe('javascript');
      expect(checker.getLanguageFromExtension('.mjs')).toBe('javascript');
      expect(checker.getLanguageFromExtension('.cjs')).toBe('javascript');
      expect(checker.getLanguageFromExtension('.jsx')).toBe('javascript');
    });

    test('should detect TypeScript files', () => {
      expect(checker.getLanguageFromExtension('.ts')).toBe('typescript');
      expect(checker.getLanguageFromExtension('.tsx')).toBe('typescript');
    });

    test('should detect JSON files', () => {
      expect(checker.getLanguageFromExtension('.json')).toBe('json');
    });

    test('should detect Python files', () => {
      expect(checker.getLanguageFromExtension('.py')).toBe('python');
    });

    test('should return null for unsupported extensions', () => {
      expect(checker.getLanguageFromExtension('.txt')).toBeNull();
      expect(checker.getLanguageFromExtension('.md')).toBeNull();
    });
  });

  describe('checkJavaScript()', () => {
    test('should validate correct JavaScript', async () => {
      mockAcornParse.mockImplementation(() => {}); // No error
      const errors = [];

      await checker.checkJavaScript('const x = 1;', errors);

      expect(errors).toHaveLength(0);
      expect(mockAcornParse).toHaveBeenCalledWith('const x = 1;', {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true,
        allowAwaitOutsideFunction: true,
        allowReturnOutsideFunction: true
      });
    });

    test('should detect JavaScript syntax errors', async () => {
      const syntaxError = new Error('Unexpected token');
      syntaxError.loc = { line: 2, column: 5 };
      mockAcornParse.mockImplementation(() => {
        throw syntaxError;
      });

      const errors = [];
      await checker.checkJavaScript('const x =', errors);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        severity: 'error',
        message: 'Unexpected token',
        line: 2,
        column: 5
      });
    });

    test('should handle errors without location info', async () => {
      const syntaxError = new Error('Parse error');
      mockAcornParse.mockImplementation(() => {
        throw syntaxError;
      });

      const errors = [];
      await checker.checkJavaScript('invalid code', errors);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        severity: 'error',
        message: 'Parse error',
        line: 0,
        column: 0
      });
    });
  });

  describe('checkTypeScript()', () => {
    test('should skip TypeScript-specific syntax (import type)', async () => {
      const errors = [];
      await checker.checkTypeScript('import type { Foo } from "./foo";', errors);

      expect(errors).toHaveLength(0);
      expect(mockAcornParse).not.toHaveBeenCalled();
    });

    test('should skip TypeScript-specific syntax (export type)', async () => {
      const errors = [];
      await checker.checkTypeScript('export type MyType = string;', errors);

      expect(errors).toHaveLength(0);
      expect(mockAcornParse).not.toHaveBeenCalled();
    });

    test('should skip TypeScript-specific syntax (interface)', async () => {
      const errors = [];
      await checker.checkTypeScript('interface Foo { bar: string; }', errors);

      expect(errors).toHaveLength(0);
      expect(mockAcornParse).not.toHaveBeenCalled();
    });

    test('should skip TypeScript-specific syntax (type alias)', async () => {
      const errors = [];
      await checker.checkTypeScript('type MyType = string | number;', errors);

      expect(errors).toHaveLength(0);
      expect(mockAcornParse).not.toHaveBeenCalled();
    });

    test('should skip TypeScript-specific syntax (declare)', async () => {
      const errors = [];
      await checker.checkTypeScript('declare const API_KEY: string;', errors);

      expect(errors).toHaveLength(0);
      expect(mockAcornParse).not.toHaveBeenCalled();
    });

    test('should check valid JavaScript-compatible TypeScript', async () => {
      mockAcornParse.mockImplementation(() => {}); // No error
      const errors = [];

      await checker.checkTypeScript('const x: number = 1;', errors);

      // This has type annotation, should be skipped
      expect(mockAcornParse).not.toHaveBeenCalled();
    });

    test('should parse plain JavaScript in .ts files', async () => {
      mockAcornParse.mockImplementation(() => {}); // No error
      const errors = [];

      await checker.checkTypeScript('const x = 1; console.log(x);', errors);

      expect(mockAcornParse).toHaveBeenCalled();
      expect(errors).toHaveLength(0);
    });
  });

  describe('checkJSON()', () => {
    test('should validate correct JSON', () => {
      const errors = [];
      checker.checkJSON('{"valid": "json"}', errors);

      expect(errors).toHaveLength(0);
    });

    test('should detect JSON syntax errors', () => {
      const errors = [];
      checker.checkJSON('{"invalid": json}', errors);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        severity: 'error',
        message: expect.stringContaining('JSON'),
        column: 0
      });
    });

    test('should extract line number from error message', () => {
      const errors = [];
      const invalidJson = '{\n  "key": "value",\n  invalid\n}';
      checker.checkJSON(invalidJson, errors);

      expect(errors).toHaveLength(1);
      expect(errors[0].line).toBeGreaterThan(0);
    });

    test('should handle malformed JSON', () => {
      const errors = [];
      checker.checkJSON('{', errors);

      expect(errors).toHaveLength(1);
      expect(errors[0].severity).toBe('error');
    });
  });

  describe('extractCodeSnippet()', () => {
    test('should extract code snippet with context', () => {
      const lines = ['line 1', 'line 2', 'line 3 (error)', 'line 4', 'line 5'];
      const snippet = checker.extractCodeSnippet(lines, 3);

      expect(snippet).toContain('line 1');
      expect(snippet).toContain('line 2');
      expect(snippet).toContain('▶ 3 | line 3 (error)');
      expect(snippet).toContain('line 4');
      expect(snippet).toContain('line 5');
    });

    test('should handle error at start of file', () => {
      const lines = ['line 1 (error)', 'line 2', 'line 3'];
      const snippet = checker.extractCodeSnippet(lines, 1);

      expect(snippet).toContain('▶ 1 | line 1 (error)');
      expect(snippet).toContain('2 | line 2');
      expect(snippet).toContain('3 | line 3');
    });

    test('should handle error at end of file', () => {
      const lines = ['line 1', 'line 2', 'line 3 (error)'];
      const snippet = checker.extractCodeSnippet(lines, 3);

      expect(snippet).toContain('1 | line 1');
      expect(snippet).toContain('2 | line 2');
      expect(snippet).toContain('▶ 3 | line 3 (error)');
    });

    test('should mark error line with arrow prefix', () => {
      const lines = ['code', 'error here', 'more code'];
      const snippet = checker.extractCodeSnippet(lines, 2);

      expect(snippet).toContain('▶ 2 | error here');
      expect(snippet).not.toContain('▶ 1 |');
      expect(snippet).not.toContain('▶ 3 |');
    });
  });

  describe('checkFile() - Database Operations', () => {
    test('should clear old errors before inserting new ones', async () => {
      fs.readFileSync.mockReturnValue('const x = 1;');
      mockAcornParse.mockImplementation(() => {}); // No error

      await checker.checkFile('/path/to/file.js');

      expect(mockDb.clearSyntaxErrors).toHaveBeenCalledWith('/path/to/file.js');
    });

    test('should insert syntax errors into database', async () => {
      const syntaxError = new Error('Unexpected token');
      syntaxError.loc = { line: 2, column: 5 };

      fs.readFileSync.mockReturnValue('const x =');
      mockAcornParse.mockImplementation(() => {
        throw syntaxError;
      });

      await checker.checkFile('/path/to/file.js');

      expect(mockDb.insertSyntaxError).toHaveBeenCalled();
      expect(mockDb.insertSyntaxError).toHaveBeenCalledWith(
        expect.any(String), // timestamp
        '/path/to/file.js',
        'javascript',
        'error',
        'Unexpected token',
        2,
        5,
        expect.any(String), // code snippet
        projectName,
        sessionId
      );
    });

    test('should insert multiple errors', async () => {
      fs.readFileSync.mockReturnValue('{"invalid": json}');

      await checker.checkFile('/path/to/file.json');

      expect(mockDb.insertSyntaxError).toHaveBeenCalled();
      expect(mockDb.insertSyntaxError.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('checkFile() - WebSocket Operations', () => {
    test('should emit syntax errors via WebSocket', async () => {
      const syntaxError = new Error('Unexpected token');
      syntaxError.loc = { line: 2, column: 5 };

      fs.readFileSync.mockReturnValue('const x =');
      mockAcornParse.mockImplementation(() => {
        throw syntaxError;
      });

      await checker.checkFile('/path/to/file.js');

      expect(mockIo.emit).toHaveBeenCalledWith('syntax-error', {
        id: 1,
        timestamp: expect.any(String),
        filepath: '/path/to/file.js',
        language: 'javascript',
        severity: 'error',
        message: 'Unexpected token',
        line_number: 2,
        column_number: 5,
        code_snippet: expect.any(String),
        project_name: projectName,
        errors: expect.any(Array)
      });
    });

    test('should emit multiple errors', async () => {
      fs.readFileSync.mockReturnValue('{"invalid": json}');

      await checker.checkFile('/path/to/file.json');

      expect(mockIo.emit).toHaveBeenCalled();
      expect(mockIo.emit.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('checkFile() - Error Handling', () => {
    test('should handle file read errors', async () => {
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = await checker.checkFile('/nonexistent/file.js');

      expect(result).toEqual([]);
    });

    test('should handle encoding errors', async () => {
      fs.readFileSync.mockImplementation(() => {
        throw new Error('Invalid UTF-8');
      });

      const result = await checker.checkFile('/path/to/binary.js');

      expect(result).toEqual([]);
    });

    test('should not throw on database errors', async () => {
      fs.readFileSync.mockReturnValue('{"invalid": json}');
      mockDb.insertSyntaxError.mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = await checker.checkFile('/path/to/file.json');

      expect(result).toBeInstanceOf(Array);
    });

    test('should handle WebSocket emit errors', async () => {
      fs.readFileSync.mockReturnValue('{"invalid": json}');
      mockIo.emit.mockImplementation(() => {
        throw new Error('WebSocket error');
      });

      const result = await checker.checkFile('/path/to/file.json');

      expect(result).toBeInstanceOf(Array);
    });
  });

  describe('Integration', () => {
    test('should process JavaScript file with errors correctly', async () => {
      const jsContent = `
        const x = 1;
        const y =
        console.log(x);
      `;

      const syntaxError = new Error('Unexpected token');
      syntaxError.loc = { line: 3, column: 8 };

      fs.readFileSync.mockReturnValue(jsContent);
      mockAcornParse.mockImplementation(() => {
        throw syntaxError;
      });

      const result = await checker.checkFile('/path/to/file.js');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        severity: 'error',
        message: 'Unexpected token',
        line: 3,
        column: 8
      });
      expect(mockDb.clearSyntaxErrors).toHaveBeenCalled();
      expect(mockDb.insertSyntaxError).toHaveBeenCalled();
      expect(mockIo.emit).toHaveBeenCalled();
    });

    test('should process JSON file with errors correctly', async () => {
      const jsonContent = '{"key": invalid}';
      fs.readFileSync.mockReturnValue(jsonContent);

      const result = await checker.checkFile('/path/to/file.json');

      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('error');
      expect(mockDb.clearSyntaxErrors).toHaveBeenCalled();
      expect(mockDb.insertSyntaxError).toHaveBeenCalled();
      expect(mockIo.emit).toHaveBeenCalled();
    });

    test('should process valid JavaScript file', async () => {
      const jsContent = 'const x = 1; console.log(x);';
      fs.readFileSync.mockReturnValue(jsContent);
      mockAcornParse.mockImplementation(() => {}); // No error

      const result = await checker.checkFile('/path/to/file.js');

      expect(result).toHaveLength(0);
      expect(mockDb.clearSyntaxErrors).toHaveBeenCalled();
      expect(mockDb.insertSyntaxError).not.toHaveBeenCalled();
      expect(mockIo.emit).not.toHaveBeenCalled();
    });

    test('should process valid JSON file', async () => {
      const jsonContent = '{"key": "value", "nested": {"prop": 123}}';
      fs.readFileSync.mockReturnValue(jsonContent);

      const result = await checker.checkFile('/path/to/file.json');

      expect(result).toHaveLength(0);
      expect(mockDb.clearSyntaxErrors).toHaveBeenCalled();
      expect(mockDb.insertSyntaxError).not.toHaveBeenCalled();
      expect(mockIo.emit).not.toHaveBeenCalled();
    });

    test('should handle empty files', async () => {
      fs.readFileSync.mockReturnValue('');
      mockAcornParse.mockImplementation(() => {}); // Empty is valid

      const result = await checker.checkFile('/path/to/empty.js');

      expect(result).toHaveLength(0);
      expect(mockDb.clearSyntaxErrors).toHaveBeenCalled();
    });

    test('should process files with multiple extensions', async () => {
      mockAcornParse.mockImplementation(() => {});
      fs.readFileSync.mockReturnValue('const x = 1;');

      await checker.checkFile('/path/to/file.mjs');
      expect(mockAcornParse).toHaveBeenCalled();

      mockAcornParse.mockClear();
      await checker.checkFile('/path/to/file.cjs');
      expect(mockAcornParse).toHaveBeenCalled();

      mockAcornParse.mockClear();
      await checker.checkFile('/path/to/component.jsx');
      expect(mockAcornParse).toHaveBeenCalled();
    });
  });

  describe('parseForErrors()', () => {
    test('should handle unsupported languages gracefully', async () => {
      const errors = await checker.parseForErrors('code', 'python', '/path/to/file.py');
      expect(errors).toEqual([]);
    });

    test('should catch and log parse errors', async () => {
      mockAcornParse.mockImplementation(() => {
        throw new Error('Critical parse error');
      });

      const errors = await checker.parseForErrors('invalid', 'javascript', '/path/to/file.js');

      // Should return empty array on critical errors
      expect(Array.isArray(errors)).toBe(true);
    });
  });
});
