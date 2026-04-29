import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import ProseBlock from '../ProseBlock.svelte';

const innerSnippet = createRawSnippet(() => ({
  render: () => `<p>Some prose body content</p>`
}));

describe('ProseBlock', () => {
  it('uses the default 42rem width', () => {
    const { container } = render(ProseBlock, { props: { children: innerSnippet } });
    const wrapper = container.querySelector('div');
    expect(wrapper?.className).toContain('max-w-[42rem]');
  });

  it('uses the wide variant when width="wide"', () => {
    const { container } = render(ProseBlock, {
      props: { children: innerSnippet, width: 'wide' }
    });
    expect(container.querySelector('div')?.className).toContain('max-w-[48rem]');
  });

  it('left-aligns by default', () => {
    const { container } = render(ProseBlock, { props: { children: innerSnippet } });
    expect(container.querySelector('div')?.className).not.toContain('mx-auto');
  });

  it('centers when align="center"', () => {
    const { container } = render(ProseBlock, {
      props: { children: innerSnippet, align: 'center' }
    });
    expect(container.querySelector('div')?.className).toContain('mx-auto');
  });

  it('appends the class prop to the wrapper', () => {
    const { container } = render(ProseBlock, {
      props: { children: innerSnippet, class: 'my-extra-class' }
    });
    expect(container.querySelector('div')?.className).toContain('my-extra-class');
  });
});
