import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import FilterToggle from '../FilterToggle.svelte';

const labelSnippet = label =>
  createRawSnippet(() => ({
    render: () => `<span>${label}</span>`
  }));

describe('FilterToggle', () => {
  it('applies accent-subtle styling when active', () => {
    const { container } = render(FilterToggle, {
      props: { active: true, onClick: () => {}, children: labelSnippet('All') }
    });
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-accent-subtle');
    expect(btn?.className).toContain('border-accent');
  });

  it('applies surface styling when inactive', () => {
    const { container } = render(FilterToggle, {
      props: { active: false, onClick: () => {}, children: labelSnippet('Errors') }
    });
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-surface');
    expect(btn?.className).not.toContain('bg-accent-subtle');
  });

  it('respects the disabled prop', () => {
    const { container } = render(FilterToggle, {
      props: { active: false, onClick: () => {}, disabled: true, children: labelSnippet('Off') }
    });
    expect(container.querySelector('button')?.disabled).toBe(true);
  });

  it('fires onClick when enabled', async () => {
    const handler = vi.fn();
    const { container } = render(FilterToggle, {
      props: { active: false, onClick: handler, children: labelSnippet('Click') }
    });
    await fireEvent.click(container.querySelector('button'));
    expect(handler).toHaveBeenCalledOnce();
  });
});
