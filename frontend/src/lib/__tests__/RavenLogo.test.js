/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import RavenLogo from '../RavenLogo.svelte';

describe('RavenLogo Component', () => {
  it('should render with default size', () => {
    const { container } = render(RavenLogo);
    const logo = container.querySelector('.raven-logo');

    expect(logo).toBeTruthy();
    expect(logo).toBeInTheDocument();
  });

  it('should render with custom size', () => {
    const { container } = render(RavenLogo, { props: { size: 64 } });
    const svg = container.querySelector('svg');

    expect(svg).toBeTruthy();
    expect(svg.getAttribute('width')).toBe('64');
    expect(svg.getAttribute('height')).toBe('64');
  });

  it('should render with default size when no size prop provided', () => {
    const { container } = render(RavenLogo);
    const svg = container.querySelector('svg');

    expect(svg).toBeTruthy();
    // Default size should be applied
    const width = svg.getAttribute('width');
    expect(width).toBeTruthy();
  });

  it('should have correct structure', () => {
    const { container } = render(RavenLogo);

    // Should have raven logo class
    expect(container.querySelector('.raven-logo')).toBeInTheDocument();

    // Should have SVG element
    expect(container.querySelector('svg')).toBeInTheDocument();

    // Should have viewBox attribute
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('viewBox')).toBeTruthy();
  });
});
