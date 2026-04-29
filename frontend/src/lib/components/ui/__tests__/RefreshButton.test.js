import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import RefreshButton from '../RefreshButton.svelte';

describe('RefreshButton', () => {
  it('renders the default label with the refresh glyph', () => {
    render(RefreshButton, { props: { onClick: () => {} } });
    expect(screen.getByText(/↻ Refresh/)).toBeTruthy();
  });

  it('shows ... when loading', () => {
    render(RefreshButton, { props: { onClick: () => {}, loading: true } });
    expect(screen.getByText(/\.\.\. Refresh/)).toBeTruthy();
  });

  it('disables the button while loading', () => {
    const { container } = render(RefreshButton, {
      props: { onClick: () => {}, loading: true }
    });
    const btn = container.querySelector('button');
    expect(btn?.disabled).toBe(true);
  });

  it('uses a custom label when provided', () => {
    render(RefreshButton, { props: { onClick: () => {}, label: 'Reload' } });
    expect(screen.getByText(/↻ Reload/)).toBeTruthy();
  });

  it('fires onClick when clicked', async () => {
    const handler = vi.fn();
    const { container } = render(RefreshButton, { props: { onClick: handler } });
    const btn = container.querySelector('button');
    await fireEvent.click(btn);
    expect(handler).toHaveBeenCalledOnce();
  });
});
