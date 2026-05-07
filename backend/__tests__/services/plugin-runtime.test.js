/**
 * Tests for the Plugin Runtime — sandbox loading, enable/disable,
 * source readback, hot-reload. Event dispatch is tested at the
 * integration layer (the runtime wires into EventBus on init).
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createPluginRuntime } from '../../dist/services/plugin-runtime.js';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let tmpDir;
let runtime;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'raven-plugins-'));
});

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('PluginRuntime', () => {
  test('seeds an example plugin on init when the dir is empty', () => {
    runtime = createPluginRuntime(tmpDir);
    runtime.init();
    const plugins = runtime.list();
    expect(plugins.length).toBeGreaterThan(0);
    const example = plugins.find(p => p.name === 'example');
    expect(example).toBeDefined();
    expect(example.enabled).toBe(true);
    expect(example.last_loaded).toMatch(/^\d{4}-/);
  });

  test('loads a hand-authored plugin and exposes it via list()', () => {
    writeFileSync(join(tmpDir, 'foo.js'), `raven.log('hello from foo');\n`);
    runtime = createPluginRuntime(tmpDir);
    runtime.init();
    const plugins = runtime.list();
    const foo = plugins.find(p => p.name === 'foo');
    expect(foo).toBeDefined();
    expect(foo.last_error).toBeNull();
    expect(foo.logs.some(l => l.message.includes('hello from foo'))).toBe(true);
  });

  test('captures a load error without crashing the runtime', () => {
    writeFileSync(join(tmpDir, 'broken.js'), `this is not valid javascript ((`);
    runtime = createPluginRuntime(tmpDir);
    runtime.init();
    const plugins = runtime.list();
    const broken = plugins.find(p => p.name === 'broken');
    expect(broken).toBeDefined();
    expect(broken.last_error).toBeTruthy();
  });

  test('sandbox blocks access to require / fs / process', () => {
    writeFileSync(
      join(tmpDir, 'sneaky.js'),
      `try { require('fs'); raven.log('require leaked'); }
       catch (e) { raven.log('require blocked: ' + e.message); }`
    );
    runtime = createPluginRuntime(tmpDir);
    runtime.init();
    const plugins = runtime.list();
    const sneaky = plugins.find(p => p.name === 'sneaky');
    expect(sneaky).toBeDefined();
    const blocked = sneaky.logs.find(l => l.message.startsWith('require blocked'));
    expect(blocked).toBeDefined();
  });

  test('enable() / disable() round-trip + 404 for unknown', () => {
    writeFileSync(join(tmpDir, 'foo.js'), `raven.log('foo loaded');\n`);
    runtime = createPluginRuntime(tmpDir);
    runtime.init();
    expect(runtime.disable('foo')).toBe(true);
    expect(runtime.list().find(p => p.name === 'foo').enabled).toBe(false);
    expect(runtime.enable('foo')).toBe(true);
    expect(runtime.list().find(p => p.name === 'foo').enabled).toBe(true);
    expect(runtime.disable('does-not-exist')).toBe(false);
    expect(runtime.enable('does-not-exist')).toBe(false);
  });

  test('readSource() returns the on-disk plugin code', () => {
    writeFileSync(join(tmpDir, 'foo.js'), `// hand-written rule\nraven.log('x');\n`);
    runtime = createPluginRuntime(tmpDir);
    runtime.init();
    const src = runtime.readSource('foo');
    expect(src).toContain('hand-written rule');
    expect(runtime.readSource('does-not-exist')).toBeNull();
  });

  test('reload() picks up newly-added files without restart', () => {
    runtime = createPluginRuntime(tmpDir);
    runtime.init();
    const before = runtime.list().length;
    writeFileSync(join(tmpDir, 'late.js'), `raven.log('late arrival');\n`);
    const result = runtime.reload();
    const after = runtime.list();
    expect(after.length).toBe(before + 1);
    expect(after.find(p => p.name === 'late')).toBeDefined();
    expect(result.failed).not.toContain('late.js');
  });
});
