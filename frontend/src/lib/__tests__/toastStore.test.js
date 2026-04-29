/**
 * Tests for the toast store. Pure store logic — no DOM.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { toasts } from '../toastStore.js';

describe('toastStore', () => {
  beforeEach(() => {
    toasts.clear();
    vi.useRealTimers();
  });

  it('starts empty', () => {
    expect(get(toasts)).toEqual([]);
  });

  it('show() adds a toast and returns its id', () => {
    const id = toasts.show('Hi', 'info', 0);
    const list = get(toasts);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(id);
    expect(list[0].message).toBe('Hi');
    expect(list[0].type).toBe('info');
  });

  it('success/warning/error/info convenience methods set the right type', () => {
    toasts.success('a', 0);
    toasts.warning('b', 0);
    toasts.error('c', 0);
    toasts.info('d', 0);
    const types = get(toasts).map(t => t.type);
    expect(types).toEqual(['success', 'warning', 'error', 'info']);
  });

  it('dismiss(id) removes the matching toast', () => {
    const id = toasts.show('Bye', 'info', 0);
    toasts.show('Stay', 'info', 0);
    toasts.dismiss(id);
    const remaining = get(toasts);
    expect(remaining.length).toBe(1);
    expect(remaining[0].message).toBe('Stay');
  });

  it('clear() removes all toasts', () => {
    toasts.show('a', 'info', 0);
    toasts.show('b', 'info', 0);
    toasts.clear();
    expect(get(toasts)).toEqual([]);
  });

  it('auto-dismisses after the configured duration', () => {
    vi.useFakeTimers();
    toasts.show('Auto-gone', 'info', 100);
    expect(get(toasts).length).toBe(1);
    vi.advanceTimersByTime(150);
    expect(get(toasts).length).toBe(0);
  });
});
