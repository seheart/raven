/**
 * Component tests for EmptyState — a reusable "no data" card used across the app.
 *
 * Establishes the pattern for Svelte 5 component tests in this project:
 *   - render with @testing-library/svelte
 *   - assert on text content / DOM structure (no snapshot brittleness)
 *   - keep tests behavioral, not pixel-level
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import EmptyState from '../EmptyState.svelte';

describe('EmptyState', () => {
  it('renders the title', () => {
    render(EmptyState, { props: { title: 'Nothing here yet' } });
    expect(screen.getByText('Nothing here yet')).toBeTruthy();
  });

  it('renders a description when provided', () => {
    render(EmptyState, {
      props: { title: 'No projects', description: 'Add a project to get started' }
    });
    expect(screen.getByText('Add a project to get started')).toBeTruthy();
  });

  it('renders an icon when provided', () => {
    const { container } = render(EmptyState, {
      props: { title: 'Empty', icon: '📦' }
    });
    expect(container.textContent).toContain('📦');
  });

  it('uses compact padding when size="compact"', () => {
    const { container } = render(EmptyState, {
      props: { title: 'Empty', size: 'compact' }
    });
    const card = container.querySelector('div');
    expect(card?.className).toContain('p-8');
    expect(card?.className).not.toContain('p-12');
  });

  it('uses default padding p-12 when size is omitted', () => {
    const { container } = render(EmptyState, {
      props: { title: 'Empty' }
    });
    const card = container.querySelector('div');
    expect(card?.className).toContain('p-12');
  });

  it('omits description block when description is not provided', () => {
    const { container } = render(EmptyState, {
      props: { title: 'Just title' }
    });
    expect(container.querySelector('p')).toBeNull();
  });
});
