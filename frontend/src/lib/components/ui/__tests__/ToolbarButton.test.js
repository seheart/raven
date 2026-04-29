import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import ToolbarButton from '../ToolbarButton.svelte';

const labelSnippet = label =>
  createRawSnippet(() => ({
    render: () => `<span>${label}</span>`
  }));

describe('ToolbarButton', () => {
  it('renders the default variant', () => {
    const { container } = render(ToolbarButton, {
      props: { onClick: () => {}, children: labelSnippet('Export') }
    });
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-surface');
  });

  it('applies the primary variant style', () => {
    const { container } = render(ToolbarButton, {
      props: { onClick: () => {}, variant: 'primary', children: labelSnippet('+ Add') }
    });
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-accent');
  });

  it('applies the danger variant style', () => {
    const { container } = render(ToolbarButton, {
      props: { onClick: () => {}, variant: 'danger', children: labelSnippet('Delete') }
    });
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('text-error');
    expect(btn?.className).toContain('border-error');
  });

  it('respects the disabled prop', () => {
    const { container } = render(ToolbarButton, {
      props: { onClick: () => {}, disabled: true, children: labelSnippet('Disabled') }
    });
    const btn = container.querySelector('button');
    expect(btn?.disabled).toBe(true);
  });

  it('fires onClick when enabled', async () => {
    const handler = vi.fn();
    const { container } = render(ToolbarButton, {
      props: { onClick: handler, children: labelSnippet('Click me') }
    });
    await fireEvent.click(container.querySelector('button'));
    expect(handler).toHaveBeenCalledOnce();
  });
});
