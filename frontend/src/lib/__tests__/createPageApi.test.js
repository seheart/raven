/**
 * Tests for createPageApi - abort controller integration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPageApi } from '../apiClient.js';

// Mock dependencies
vi.mock('../logger.js', () => ({
  logger: { error: vi.fn() }
}));

vi.mock('../notificationService.js', () => ({
  notifications: {
    error: vi.fn(),
    apiError: vi.fn()
  }
}));

vi.mock('../errorLogger.js', () => ({
  logError: vi.fn(() => Promise.resolve())
}));

vi.mock('../services/websocket.js', () => ({
  websocketService: {
    isConnected: vi.fn(() => false),
    on: vi.fn(),
    off: vi.fn()
  }
}));

global.fetch = vi.fn();

describe('createPageApi', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  it('should return api object and abort function', () => {
    const { api, abort } = createPageApi();
    expect(api).toHaveProperty('get');
    expect(api).toHaveProperty('post');
    expect(api).toHaveProperty('put');
    expect(api).toHaveProperty('delete');
    expect(typeof abort).toBe('function');
  });

  it('should make requests with an abort signal', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ data: 'test' })
    });

    const { api } = createPageApi();
    await api.get('/test');

    const callArgs = fetch.mock.calls[0][1];
    expect(callArgs.signal).toBeInstanceOf(AbortSignal);
  });

  it('should abort in-flight requests when abort() is called', async () => {
    // Create a fetch that won't resolve immediately
    let rejectFetch;
    fetch.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectFetch = reject;
        })
    );

    const { api, abort } = createPageApi();
    const promise = api.get('/slow-endpoint');

    // Abort should cancel the request
    abort();

    // Simulate the abort error
    rejectFetch(new DOMException('The operation was aborted.', 'AbortError'));

    await expect(promise).rejects.toThrow();
  });

  it('should allow new requests after abort and re-use', async () => {
    const { api, abort } = createPageApi();

    // First abort
    abort();

    // New request should work (controller should be recreated)
    fetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ data: 'fresh' })
    });

    const result = await api.get('/new-request');
    expect(result).toEqual({ data: 'fresh' });
  });

  it('should pass through POST data correctly', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ created: true })
    });

    const { api } = createPageApi();
    await api.post('/create', { name: 'test' });

    const callArgs = fetch.mock.calls[0][1];
    expect(callArgs.method).toBe('POST');
    expect(callArgs.body).toBe(JSON.stringify({ name: 'test' }));
    expect(callArgs.signal).toBeInstanceOf(AbortSignal);
  });

  it('should not show timeout notification for navigation aborts', async () => {
    const { notifications } = await import('../notificationService.js');

    // Simulate an abort from navigation (external signal)
    const controller = new AbortController();
    fetch.mockImplementationOnce(() => {
      controller.abort();
      return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
    });

    const { api } = createPageApi();

    try {
      await api.get('/test');
    } catch (_e) {
      // Expected
    }

    // Should NOT have shown a timeout notification
    expect(notifications.error).not.toHaveBeenCalledWith(
      expect.stringContaining('timed out'),
      expect.anything()
    );
  });
});
