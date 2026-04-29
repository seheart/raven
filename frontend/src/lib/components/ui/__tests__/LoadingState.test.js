import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import LoadingState from '../LoadingState.svelte';

describe('LoadingState', () => {
  it('renders the default loading message', () => {
    render(LoadingState);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('renders a custom message when provided', () => {
    render(LoadingState, { props: { message: 'Fetching projects...' } });
    expect(screen.getByText('Fetching projects...')).toBeTruthy();
  });

  it('includes a spinner element', () => {
    const { container } = render(LoadingState);
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).not.toBeNull();
  });
});
