/**
 * API Client tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiClient } from '../apiClient.js';

global.fetch = vi.fn();

describe('API Client', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  it('should make GET request', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: 'test' })
    });

    const result = await apiClient.get('/test');
    expect(result).toEqual({ data: 'test' });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/test'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('should make POST request with body', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true })
    });

    const body = { name: 'test' };
    const result = await apiClient.post('/test', body);

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
      statusText: 'Not Found'
    });

    await expect(apiClient.get('/not-found')).rejects.toThrow();
  });

  it('should handle network errors', async () => {
    fetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(apiClient.get('/test')).rejects.toThrow('Network error');
  });
});
