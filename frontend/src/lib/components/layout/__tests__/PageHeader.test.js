import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import PageHeader from '../PageHeader.svelte';

const actionSnippet = label =>
  createRawSnippet(() => ({
    render: () => `<button>${label}</button>`
  }));

describe('PageHeader', () => {
  it('renders the title at default size', () => {
    const { container } = render(PageHeader, { props: { title: 'Dashboard' } });
    const h1 = container.querySelector('h1');
    expect(h1?.textContent).toBe('Dashboard');
    expect(h1?.className).toContain('text-2xl');
  });

  it('renders the description when provided', () => {
    render(PageHeader, {
      props: { title: 'About', description: 'What Raven is for' }
    });
    expect(screen.getByText('What Raven is for')).toBeTruthy();
  });

  it('uses the medium size class when size="medium"', () => {
    const { container } = render(PageHeader, {
      props: { title: 'Overview', size: 'medium' }
    });
    expect(container.querySelector('h1')?.className).toContain('text-xl');
  });

  it('uses the compact size class when size="compact"', () => {
    const { container } = render(PageHeader, {
      props: { title: 'Network', size: 'compact' }
    });
    expect(container.querySelector('h1')?.className).toContain('text-sm');
  });

  it('renders an actions snippet when provided', () => {
    render(PageHeader, {
      props: { title: 'Live', actions: actionSnippet('Refresh') }
    });
    expect(screen.getByText('Refresh')).toBeTruthy();
  });
});
