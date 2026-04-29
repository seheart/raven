import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import RavenLogo from '../RavenLogo.svelte';

describe('RavenLogo', () => {
  it('renders an svg', () => {
    const { container } = render(RavenLogo);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('uses the default size of 16 when no size prop is provided', () => {
    const { container } = render(RavenLogo);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('16');
    expect(svg?.getAttribute('height')).toBe('16');
  });

  it('applies a custom size when provided', () => {
    const { container } = render(RavenLogo, { props: { size: 32 } });
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('32');
    expect(svg?.getAttribute('height')).toBe('32');
  });

  it('exposes an accessible label', () => {
    const { container } = render(RavenLogo);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toBe('Raven logo');
    expect(svg?.getAttribute('role')).toBe('img');
  });
});
