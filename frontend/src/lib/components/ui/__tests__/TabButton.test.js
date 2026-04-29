import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import TabButton from '../TabButton.svelte';

const labelSnippet = label =>
  createRawSnippet(() => ({
    render: () => `<span>${label}</span>`
  }));

describe('TabButton', () => {
  it('applies active styles when active=true', () => {
    const { container } = render(TabButton, {
      props: { active: true, onClick: () => {}, children: labelSnippet('Today') }
    });
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-accent');
    expect(btn?.className).toContain('text-canvas');
  });

  it('applies muted styles when active=false', () => {
    const { container } = render(TabButton, {
      props: { active: false, onClick: () => {}, children: labelSnippet('Last 7d') }
    });
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('text-muted');
    expect(btn?.className).not.toContain('bg-accent');
  });

  it('fires onClick when clicked', async () => {
    const handler = vi.fn();
    const { container } = render(TabButton, {
      props: { active: false, onClick: handler, children: labelSnippet('Tab') }
    });
    await fireEvent.click(container.querySelector('button'));
    expect(handler).toHaveBeenCalledOnce();
  });
});
