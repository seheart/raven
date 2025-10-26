import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';

// Mock dependencies
vi.mock('./websocket.js', () => ({
  websocketService: {
    on: vi.fn(),
    off: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    connect: vi.fn()
  }
}));

vi.mock('./apiClient.js', () => ({
  api: {
    get: vi.fn(() => Promise.resolve([])),
    post: vi.fn(() => Promise.resolve({}))
  }
}));

import EventFeed from './EventFeed.svelte';

describe('EventFeed Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { container } = render(EventFeed);
    expect(container).toBeTruthy();
  });

  it('displays event count', async () => {
    render(EventFeed);

    await waitFor(() => {
      const countText = screen.getByText(/\d+\s*\/\s*\d+\s*events/i);
      expect(countText).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('shows export buttons', () => {
    render(EventFeed);

    const jsonButton = screen.getByText(/JSON/i);
    const csvButton = screen.getByText(/CSV/i);

    expect(jsonButton).toBeTruthy();
    expect(csvButton).toBeTruthy();
  });

  it('shows filter checkboxes', () => {
    render(EventFeed);

    const createdFilter = screen.getByText(/Created/i);
    const modifiedFilter = screen.getByText(/Modified/i);
    const deletedFilter = screen.getByText(/Deleted/i);

    expect(createdFilter).toBeTruthy();
    expect(modifiedFilter).toBeTruthy();
    expect(deletedFilter).toBeTruthy();
  });

  it('has search input', () => {
    render(EventFeed);

    const searchInput = screen.getByPlaceholderText(/Search by filename or conversation/i);
    expect(searchInput).toBeTruthy();
  });

  it('allows typing in search input', async () => {
    render(EventFeed);

    const searchInput = screen.getByPlaceholderText(/Search by filename or conversation/i);
    await fireEvent.input(searchInput, { target: { value: 'test.rs' } });

    expect(searchInput.value).toBe('test.rs');
  });

  it('shows clear button', () => {
    render(EventFeed);

    const clearButton = screen.getByText(/Clear/i);
    expect(clearButton).toBeTruthy();
  });

  it('shows empty state when no events', () => {
    render(EventFeed);

    const emptyMessage = screen.getByText(/No events yet/i);
    expect(emptyMessage).toBeTruthy();
  });
});
