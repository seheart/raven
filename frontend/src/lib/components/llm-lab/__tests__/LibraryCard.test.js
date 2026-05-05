/**
 * LibraryCard tests — installed model catalog card.
 *
 * Mocks the api client at module level. The component polls /ollama/library
 * every 30s; we use fake timers to skip past the interval where useful.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';

const { mockApiGet } = vi.hoisted(() => ({ mockApiGet: vi.fn() }));
vi.mock('../../../apiClient.js', () => ({
  api: { get: mockApiGet, post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  apiFetch: vi.fn()
}));

import LibraryCard from '../LibraryCard.svelte';

describe('LibraryCard', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it('renders the empty-state when no models are installed', async () => {
    mockApiGet.mockResolvedValue({ models: [], count: 0, ollama_status: 'online' });
    render(LibraryCard);
    expect(await screen.findByText('No models installed')).toBeTruthy();
  });

  it('renders models sorted by size (largest first)', async () => {
    mockApiGet.mockResolvedValue({
      models: [
        {
          name: 'small',
          size: 1_000_000_000,
          parameter_size: '1B',
          quantization: 'Q4',
          family: 'llama'
        },
        {
          name: 'huge',
          size: 70_000_000_000,
          parameter_size: '70B',
          quantization: 'Q4',
          family: 'llama'
        },
        {
          name: 'medium',
          size: 14_000_000_000,
          parameter_size: '14B',
          quantization: 'Q4',
          family: 'qwen2'
        }
      ],
      count: 3,
      ollama_status: 'online'
    });
    const { container } = render(LibraryCard);
    await screen.findByText('huge');
    const rendered = Array.from(container.querySelectorAll('[title]')).map(el =>
      el.getAttribute('title')
    );
    expect(rendered).toEqual(['huge', 'medium', 'small']);
  });

  it('shows the count badge', async () => {
    mockApiGet.mockResolvedValue({
      models: [
        { name: 'a', size: 1e9, parameter_size: '1B', quantization: 'Q4', family: 'llama' },
        { name: 'b', size: 2e9, parameter_size: '2B', quantization: 'Q4', family: 'llama' }
      ],
      count: 2,
      ollama_status: 'online'
    });
    render(LibraryCard);
    await waitFor(() => expect(screen.getByText('2 installed')).toBeTruthy());
  });

  it('shows the error message when the api throws', async () => {
    mockApiGet.mockRejectedValue(new Error('Ollama unreachable'));
    render(LibraryCard);
    expect(await screen.findByText('Ollama unreachable')).toBeTruthy();
  });
});
