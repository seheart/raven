import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import PageSection from '../PageSection.svelte';

const labelSnippet = label =>
  createRawSnippet(() => ({
    render: () => `<span>${label}</span>`
  }));

describe('PageSection', () => {
  it('renders the title when provided', () => {
    render(PageSection, {
      props: { title: 'Watchers', children: labelSnippet('content') }
    });
    expect(screen.getByText('Watchers')).toBeTruthy();
  });

  it('renders the meta tail when provided', () => {
    render(PageSection, {
      props: { title: 'Routes', meta: 'live (14 endpoints)', children: labelSnippet('content') }
    });
    // The component renders meta with a "· " prefix; assert the meta text appears.
    expect(screen.getByText(/live \(14 endpoints\)/)).toBeTruthy();
  });

  it('omits the heading when no title is provided', () => {
    const { container } = render(PageSection, {
      props: { children: labelSnippet('just content') }
    });
    expect(container.querySelector('h2')).toBeNull();
  });

  it('renders its children', () => {
    render(PageSection, {
      props: { title: 'Section', children: labelSnippet('inside body') }
    });
    expect(screen.getByText('inside body')).toBeTruthy();
  });
});
