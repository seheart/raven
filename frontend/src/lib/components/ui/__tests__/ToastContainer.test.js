import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ToastContainer from '../ToastContainer.svelte';
import { toasts } from '../../../toastStore.js';

// jsdom doesn't implement Web Animations API — stub the bits Svelte transitions
// reach for so transition cleanup doesn't throw.
beforeAll(() => {
  if (typeof Element !== 'undefined') {
    if (!Element.prototype.getAnimations) {
      Element.prototype.getAnimations = () => [];
    }
    if (!Element.prototype.animate) {
      // @ts-ignore — minimal stub to satisfy Svelte's transition machinery
      Element.prototype.animate = () => ({
        cancel() {},
        finish() {},
        addEventListener() {},
        removeEventListener() {},
        finished: Promise.resolve()
      });
    }
  }
});

describe('ToastContainer', () => {
  beforeEach(() => {
    toasts.clear?.();
  });

  it('renders nothing when there are no toasts', () => {
    const { container } = render(ToastContainer);
    // The outer container exists but has no toast children
    const outer = container.querySelector('.fixed');
    expect(outer?.children.length ?? 0).toBe(0);
  });

  it('renders a toast with the message text', async () => {
    render(ToastContainer);
    toasts.show('Hello world', 'info', 0); // duration 0 = no auto-dismiss
    expect(await screen.findByText('Hello world')).toBeTruthy();
  });

  it('applies the success color class', async () => {
    const { container } = render(ToastContainer);
    toasts.success('Saved', 0);
    await screen.findByText('Saved');
    const toast = container.querySelector('[class*="success"]');
    expect(toast).not.toBeNull();
  });

  it('renders a dismiss button per toast', async () => {
    render(ToastContainer);
    toasts.show('Click to dismiss', 'info', 0);
    await screen.findByText('Click to dismiss');
    const dismissButtons = await screen.findAllByLabelText('Dismiss');
    expect(dismissButtons.length).toBe(1);
  });
});
