import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import PlaceholderPage from '../PlaceholderPage.svelte';

describe('PlaceholderPage', () => {
  it('renders the default title and description', () => {
    render(PlaceholderPage);
    expect(screen.getByText('Coming Soon')).toBeTruthy();
    expect(screen.getByText('This page is under development.')).toBeTruthy();
  });

  it('renders custom title and description when provided', () => {
    render(PlaceholderPage, {
      props: { title: 'Insights', description: 'Coming in v2.5' }
    });
    expect(screen.getByText('Insights')).toBeTruthy();
    expect(screen.getByText('Coming in v2.5')).toBeTruthy();
  });
});
