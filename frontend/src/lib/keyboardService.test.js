import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KeyboardService } from './keyboardService.js';

describe('KeyboardService', () => {
  let service;
  let handler;

  beforeEach(() => {
    service = new KeyboardService();
    handler = vi.fn();
  });

  afterEach(() => {
    service.clear();
  });

  it('creates a new instance', () => {
    expect(service).toBeTruthy();
    expect(service.handlers).toBeInstanceOf(Map);
  });

  it('registers a keyboard shortcut', () => {
    service.register('a', handler);

    expect(service.handlers.size).toBe(1);
    expect(service.listening).toBe(true);
  });

  it('calls handler when key is pressed', () => {
    service.register('a', handler);

    const event = new KeyboardEvent('keydown', { key: 'a' });
    window.dispatchEvent(event);

    expect(handler).toHaveBeenCalled();
  });

  it('supports modifier keys', () => {
    service.register('a', handler, { ctrlKey: true });

    // Without Ctrl
    let event = new KeyboardEvent('keydown', { key: 'a' });
    window.dispatchEvent(event);
    expect(handler).not.toHaveBeenCalled();

    // With Ctrl
    event = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true });
    window.dispatchEvent(event);
    expect(handler).toHaveBeenCalled();
  });

  it('unregisters shortcuts', () => {
    const unregister = service.register('a', handler);

    expect(service.handlers.size).toBe(1);

    unregister();

    expect(service.handlers.size).toBe(0);
    expect(service.listening).toBe(false);
  });

  it('clears all handlers', () => {
    service.register('a', handler);
    service.register('b', handler);
    service.register('c', handler);

    expect(service.handlers.size).toBe(3);

    service.clear();

    expect(service.handlers.size).toBe(0);
    expect(service.listening).toBe(false);
  });

  it('generates correct IDs for shortcuts', () => {
    const id1 = service._generateId('a', {});
    const id2 = service._generateId('a', { ctrlKey: true });
    const id3 = service._generateId('b', { ctrlKey: true, shiftKey: true });

    expect(id1).toBe('a');
    expect(id2).toBe('ctrl+a');
    expect(id3).toBe('ctrl+shift+b');
  });

  it('matches shortcuts correctly', () => {
    const event1 = new KeyboardEvent('keydown', { key: 'a' });
    const event2 = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true });

    expect(service._matchesShortcut(event1, 'a', {})).toBe(true);
    expect(service._matchesShortcut(event1, 'a', { ctrlKey: true })).toBe(false);
    expect(service._matchesShortcut(event2, 'a', { ctrlKey: true })).toBe(true);
  });

  it('is case insensitive', () => {
    service.register('a', handler);

    const event = new KeyboardEvent('keydown', { key: 'A' });
    window.dispatchEvent(event);

    expect(handler).toHaveBeenCalled();
  });

  it('stops listening when all handlers removed', () => {
    const unregister1 = service.register('a', handler);
    const unregister2 = service.register('b', handler);

    expect(service.listening).toBe(true);

    unregister1();
    expect(service.listening).toBe(true);

    unregister2();
    expect(service.listening).toBe(false);
  });
});
