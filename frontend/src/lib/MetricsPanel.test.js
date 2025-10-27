import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
global.localStorage = localStorageMock;

// Mock logger
vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

// Mock websocket service
vi.mock('./websocket.js', () => ({
  websocketService: {
    connect: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    isConnected: vi.fn(() => true)
  }
}));

import MetricsPanel from './MetricsPanel.svelte';

// Mock fetch
global.fetch = vi.fn();

describe('MetricsPanel Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default localStorage mock
    localStorageMock.getItem.mockReturnValue(null);

    // Default mock responses
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        cpu: { usage: 45 },
        memory: { usedPercent: 60 }
      })
    });
  });

  it('renders without crashing', () => {
    const { container } = render(MetricsPanel);
    expect(container).toBeTruthy();
  });

  it('displays CPU metric', async () => {
    render(MetricsPanel);

    await waitFor(() => {
      const cpuLabel = screen.getByText(/CPU/i);
      expect(cpuLabel).toBeTruthy();
    });
  });

  it('displays Memory metric', async () => {
    render(MetricsPanel);

    await waitFor(() => {
      const memLabel = screen.getByText(/Memory/i);
      expect(memLabel).toBeTruthy();
    });
  });

  it('shows percentage values', async () => {
    render(MetricsPanel);

    await waitFor(() => {
      const percentages = screen.getAllByText(/%/i);
      expect(percentages.length).toBeGreaterThan(0);
    });
  });
});
