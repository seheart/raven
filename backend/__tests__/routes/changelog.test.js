/**
 * Tests for Changelog Routes
 */

import request from 'supertest';
import express from 'express';
import { createChangelogRoutes } from '../../routes/changelog.js';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Changelog Routes', () => {
  let app;
  let testDir;
  let docsDir;
  let changelogPath;
  let originalCwd;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Create temp directories with unique name including process ID for parallel test safety
    // The changelog route does join(process.cwd(), '..', 'docs', 'CHANGELOG.md')
    // So if cwd is /tmp/test/backend, it will look for /tmp/test/docs/CHANGELOG.md
    testDir = join(tmpdir(), `changelog-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const backendDir = join(testDir, 'backend');
    docsDir = join(testDir, 'docs');
    mkdirSync(backendDir, { recursive: true });
    mkdirSync(docsDir, { recursive: true });
    changelogPath = join(docsDir, 'CHANGELOG.md');

    // Mock process.cwd() to point to our backend directory
    originalCwd = process.cwd;
    process.cwd = () => backendDir;

    const deps = {};
    app.use('/api', createChangelogRoutes(deps));
  });

  afterEach(async () => {
    // Restore process.cwd immediately to avoid affecting other tests
    if (originalCwd) {
      process.cwd = originalCwd;
      originalCwd = null;
    }

    // Small delay to allow any pending file operations to complete
    await new Promise(resolve => setTimeout(resolve, 10));

    // Clean up test directory
    if (testDir && existsSync(testDir)) {
      try {
        rmSync(testDir, { recursive: true, force: true, maxRetries: 3 });
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  });

  describe('GET /api/changelog', () => {
    test('should return 404 when CHANGELOG.md does not exist', async () => {
      const response = await request(app)
        .get('/api/changelog')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body.error).toBe('CHANGELOG.md not found');
      expect(response.body.changelog).toEqual([]);
    });

    test('should parse a simple changelog with one release', async () => {
      const changelogContent = `# Changelog

## [1.0.0] - 2025-10-28

### Added
- New feature added
- Another feature

### Fixed
- Bug fix 1
- Bug fix 2
`;

      writeFileSync(changelogPath, changelogContent);

      const response = await request(app)
        .get('/api/changelog')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        version: '1.0.0',
        date: '2025-10-28'
      });
      expect(response.body[0].changes).toHaveLength(4);

      // Check feature changes
      const features = response.body[0].changes.filter(c => c.type === 'feature');
      expect(features).toHaveLength(2);

      // Check fix changes
      const fixes = response.body[0].changes.filter(c => c.type === 'fix');
      expect(fixes).toHaveLength(2);
    });

    test('should parse multiple releases', async () => {
      const changelogContent = `# Changelog

## [2.0.0] - 2025-10-28
### Added
- Feature in v2

## [1.5.0] - 2025-10-20
### Fixed
- Fix in v1.5

## [1.0.0] - 2025-10-01
### Added
- Initial release
`;

      writeFileSync(changelogPath, changelogContent);

      const response = await request(app)
        .get('/api/changelog')
        .expect(200);

      expect(response.body).toHaveLength(3);
      expect(response.body[0].version).toBe('2.0.0');
      expect(response.body[1].version).toBe('1.5.0');
      expect(response.body[2].version).toBe('1.0.0');
    });

    test('should parse emoji-based bullet points', async () => {
      const changelogContent = `# Changelog

## [1.0.0] - 2025-10-28
- ✨ New Feature
- ⚡ Fast Update
`;

      writeFileSync(changelogPath, changelogContent);

      const response = await request(app)
        .get('/api/changelog')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].changes.length).toBeGreaterThan(0);

      // Check that emoji-based bullets are parsed
      const hasFeature = response.body[0].changes.some(c => c.type === 'feature');
      const hasImprovement = response.body[0].changes.some(c => c.type === 'improvement');

      expect(hasFeature || hasImprovement).toBe(true);
    });

    test('should handle section-based categorization', async () => {
      const changelogContent = `# Changelog

## [1.0.0] - 2025-10-28

### Added
- New feature without emoji

### Fixed
- Bug fix without emoji

### Changed
- Improvement without emoji

### Performance
- Speed optimization

### Security
- Security enhancement
`;

      writeFileSync(changelogPath, changelogContent);

      const response = await request(app)
        .get('/api/changelog')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].changes).toHaveLength(5);

      const changesByType = response.body[0].changes.reduce((acc, change) => {
        acc[change.type] = (acc[change.type] || 0) + 1;
        return acc;
      }, {});

      expect(changesByType.feature).toBe(1); // Added section
      expect(changesByType.fix).toBe(1); // Fixed section
      expect(changesByType.improvement).toBe(2); // Changed + Performance
      expect(changesByType.security).toBe(1); // Security section
    });

    test('should remove markdown bold formatting from descriptions', async () => {
      const changelogContent = `# Changelog

## [1.0.0] - 2025-10-28
- ✨ **Bold Feature Name** - with description
### Added
- **Bold text in bullet** point
`;

      writeFileSync(changelogPath, changelogContent);

      const response = await request(app)
        .get('/api/changelog')
        .expect(200);

      expect(response.body[0].changes[0].description).not.toContain('**');
      expect(response.body[0].changes[0].description).toContain('Bold Feature Name');
      expect(response.body[0].changes[1].description).not.toContain('**');
    });

    test('should handle empty changelog file', async () => {
      writeFileSync(changelogPath, '');

      const response = await request(app)
        .get('/api/changelog')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    test('should handle changelog with only header', async () => {
      const changelogContent = `# Changelog

All notable changes to this project will be documented in this file.
`;

      writeFileSync(changelogPath, changelogContent);

      const response = await request(app)
        .get('/api/changelog')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    test('should handle mixed emoji and section-based bullets', async () => {
      const changelogContent = `# Changelog

## [1.0.0] - 2025-10-28
- ✨ **Emoji feature**

### Added
- Section-based feature

- 🐛 **Emoji fix**

### Fixed
- Section-based fix
`;

      writeFileSync(changelogPath, changelogContent);

      const response = await request(app)
        .get('/api/changelog')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].changes).toHaveLength(4);
    });

    test('should handle bullets without current section or release', async () => {
      const changelogContent = `# Changelog

This is a preamble

- Random bullet not in a release
- Another random bullet

## [1.0.0] - 2025-10-28
- ✨ Actual release feature
`;

      writeFileSync(changelogPath, changelogContent);

      const response = await request(app)
        .get('/api/changelog')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].version).toBe('1.0.0');
      // Should only have the bullet from the release, not the random ones
      expect(response.body[0].changes).toHaveLength(1);
    });

    test('should handle version without changes', async () => {
      const changelogContent = `# Changelog

## [1.0.0] - 2025-10-28

## [0.9.0] - 2025-10-20
- ✨ Some feature
`;

      writeFileSync(changelogPath, changelogContent);

      const response = await request(app)
        .get('/api/changelog')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].version).toBe('1.0.0');
      expect(response.body[0].changes).toHaveLength(0);
      expect(response.body[1].version).toBe('0.9.0');
      expect(response.body[1].changes).toHaveLength(1);
    });

    test('should handle malformed version headers', async () => {
      const changelogContent = `# Changelog

## [1.0.0] - 2025-10-28
- ✨ Valid release

## Invalid Version Header
- This should be ignored

## [0.9.0] - 2025-10-20
- ✨ Another valid release
`;

      writeFileSync(changelogPath, changelogContent);

      const response = await request(app)
        .get('/api/changelog')
        .expect(200);

      // Should only parse the valid version headers
      expect(response.body).toHaveLength(2);
      expect(response.body[0].version).toBe('1.0.0');
      expect(response.body[1].version).toBe('0.9.0');
    });

    test('should handle complex version formats', async () => {
      const changelogContent = `# Changelog

## [1.0.0-beta.1] - 2025-10-28
- ✨ Beta feature

## [0.9.0-alpha] - 2025-10-20
- ✨ Alpha feature
`;

      writeFileSync(changelogPath, changelogContent);

      const response = await request(app)
        .get('/api/changelog')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].version).toBe('1.0.0-beta.1');
      expect(response.body[1].version).toBe('0.9.0-alpha');
    });

    test('should handle whitespace variations', async () => {
      const changelogContent = `# Changelog

##   [1.0.0]   -   2025-10-28

###   Added
-   Feature with extra spaces
  - Feature with leading spaces

- ✨  Feature with emoji and spaces
`;

      writeFileSync(changelogPath, changelogContent);

      const response = await request(app)
        .get('/api/changelog')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].version).toBe('1.0.0');
      expect(response.body[0].changes.length).toBeGreaterThan(0);
    });

    test('should handle section headers with various capitalizations', async () => {
      const changelogContent = `# Changelog

## [1.0.0] - 2025-10-28

### ADDED
- Feature in ADDED

### Fixed
- Fix in Fixed

### changed
- Change in changed
`;

      writeFileSync(changelogPath, changelogContent);

      const response = await request(app)
        .get('/api/changelog')
        .expect(200);

      const features = response.body[0].changes.filter(c => c.type === 'feature');
      const fixes = response.body[0].changes.filter(c => c.type === 'fix');
      const improvements = response.body[0].changes.filter(c => c.type === 'improvement');

      expect(features).toHaveLength(1);
      expect(fixes).toHaveLength(1);
      expect(improvements).toHaveLength(1);
    });

    test('should handle file read errors gracefully', async () => {
      // Create changelog then make it unreadable
      writeFileSync(changelogPath, '# Changelog');
      // Delete the docs directory to cause a read error
      rmSync(docsDir, { recursive: true, force: true });

      const response = await request(app)
        .get('/api/changelog')
        .expect(404);

      expect(response.body.error).toBe('CHANGELOG.md not found');
      expect(response.body.changelog).toEqual([]);
    });

    test('should include all change types in response structure', async () => {
      const changelogContent = `# Changelog

## [1.0.0] - 2025-10-28
### Added
- New feature

### Fixed
- Bug fix

### Changed
- Improvement

### Security
- Security fix
`;

      writeFileSync(changelogPath, changelogContent);

      const response = await request(app)
        .get('/api/changelog')
        .expect(200);

      const types = new Set(response.body[0].changes.map(c => c.type));
      expect(types).toContain('feature');
      expect(types).toContain('fix');
      expect(types).toContain('improvement');
      expect(types).toContain('security');
    });

    test('should handle real-world changelog format', async () => {
      const changelogContent = `# Changelog

All notable changes to this project will be documented in this file.

## [1.6.0] - 2025-10-28

### Added
- ✨ **Storage Management** - Comprehensive storage overview and cleanup tools
- 🔒 **Security Enhancements** - Improved path validation and table whitelisting
- 📊 **Coverage Improvements** - Test coverage increased to 88%

### Fixed
- 🐛 **Database Vacuum** - Fixed space calculation edge cases
- 🐛 **Retention Policy** - Improved error handling for policy persistence

### Performance
- ⚡ **Query Optimization** - Faster storage statistics retrieval
- ⚡ **Cache Improvements** - Better caching for frequently accessed data

## [1.5.0] - 2025-10-20

### Added
- 🎉 **New Dashboard** - Completely redesigned dashboard UI
- 🏗️ **Project Comparison** - Side-by-side project metrics

### Changed
- 📝 **Documentation** - Updated API documentation
`;

      writeFileSync(changelogPath, changelogContent);

      const response = await request(app)
        .get('/api/changelog')
        .expect(200);

      expect(response.body).toHaveLength(2);

      // Check v1.6.0
      expect(response.body[0].version).toBe('1.6.0');
      expect(response.body[0].date).toBe('2025-10-28');
      expect(response.body[0].changes.length).toBeGreaterThan(5);

      // Check v1.5.0
      expect(response.body[1].version).toBe('1.5.0');
      expect(response.body[1].date).toBe('2025-10-20');
    });

    test('should preserve description content after emoji and bold removal', async () => {
      const changelogContent = `# Changelog

## [1.0.0] - 2025-10-28
### Added
- **Feature Name** - This is a detailed description with multiple words

### Fixed
- **Bug Fix** - Fixed issue where users could not access the feature
`;

      writeFileSync(changelogPath, changelogContent);

      const response = await request(app)
        .get('/api/changelog')
        .expect(200);

      expect(response.body[0].changes.length).toBeGreaterThanOrEqual(2);
      const descriptions = response.body[0].changes.map(c => c.description);
      expect(descriptions.some(d => d.includes('Feature Name'))).toBe(true);
      expect(descriptions.some(d => d.includes('Bug Fix'))).toBe(true);
    });

    test('should handle changelog with only unreleased section', async () => {
      const changelogContent = `# Changelog

## [Unreleased]
- ✨ Upcoming feature
- 🐛 Fix in progress
`;

      writeFileSync(changelogPath, changelogContent);

      const response = await request(app)
        .get('/api/changelog')
        .expect(200);

      // Should not match because [Unreleased] doesn't have a date
      expect(response.body).toEqual([]);
    });

    test('should handle empty lines and irregular spacing', async () => {
      const changelogContent = `# Changelog


## [1.0.0] - 2025-10-28


### Added

- Feature 1


- Feature 2


`;

      writeFileSync(changelogPath, changelogContent);

      const response = await request(app)
        .get('/api/changelog')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].changes).toHaveLength(2);
    });
  });
});
