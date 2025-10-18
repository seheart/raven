import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import MetricsPanel from './MetricsPanel.svelte';

describe('MetricsPanel Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
