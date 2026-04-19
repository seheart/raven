/**
 * API Client tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '../apiClient.js';

// Mock dependencies
vi.mock('../logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn()
  }
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

describe('API Client', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  it('should make GET request', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ data: 'test' })
    });

    const result = await api.get('/test');
    expect(result).toEqual({ data: 'test' });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/test'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('should make POST request with body', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ success: true })
    });

    const body = { name: 'test' };
    const result = await api.post('/test', body);

    expect(result).toEqual({ success: true });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/test'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(body)
      })
    );
  });

  it('should handle errors', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'Not Found'
    });

    await expect(api.get('/not-found')).rejects.toThrow();
  });

  it('should handle network errors', async () => {
    fetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(api.get('/test')).rejects.toThrow('Network error');
  });
});
