/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import Toast from '../Toast.svelte';
import { toasts } from '../toastStore.js';

describe('Toast Component', () => {
  beforeEach(() => {
    // Mock element.animate for jsdom (Web Animations API not available)
    Element.prototype.animate = vi.fn((_keyframes, _options) => {
      // Create a mock animation that immediately completes
      const animation = {
        finished: Promise.resolve(),
        cancel: vi.fn(),
        onfinish: null,
        play: vi.fn(),
        pause: vi.fn()
      };

      // Immediately trigger onfinish callback if set
      setTimeout(() => {
        if (animation.onfinish) {
          animation.onfinish();
        }
      }, 0);

      return animation;
    });

    // Clear toasts before each test
    toasts.clear();
  });

  afterEach(() => {
    // Clear toasts after each test
    toasts.clear();
  });

  it('should render toast when notification is added', async () => {
    const { getByText } = render(Toast);

    // Add a toast
    toasts.show('Test message', 'info', 0);

    // Wait for the toast to appear
    await waitFor(() => {
      expect(getByText('Test message')).toBeInTheDocument();
    });
  });

  it('should not render any toast when no notifications', () => {
    const { container } = render(Toast);

    expect(container.querySelector('.toast')).not.toBeInTheDocument();
  });

  it('should render with correct type class', async () => {
    const { container } = render(Toast);

    toasts.show('Test', 'info', 0);

    await waitFor(() => {
      const toast = container.querySelector('.toast');
      expect(toast).toBeInTheDocument();
      expect(toast.classList.contains('toast-info')).toBe(true);
    });
  });

  it('should render different types correctly', async () => {
    const { container } = render(Toast);
    const types = ['success', 'error', 'warning', 'info'];

    for (const type of types) {
      toasts.clear();
      toasts.show(`Test ${type}`, type, 0);

      await waitFor(() => {
        const toast = container.querySelector('.toast');
        expect(toast).toBeInTheDocument();
        expect(toast.classList.contains(`toast-${type}`)).toBe(true);
      });
    }
  });

  it('should call remove when close button clicked', async () => {
    const { container, getByText, queryByText } = render(Toast);

    // eslint-disable-next-line no-unused-vars
    const id = toasts.show('Test message', 'info', 0);

    await waitFor(() => {
      expect(getByText('Test message')).toBeInTheDocument();
    });

    const closeButton = container.querySelector('.toast-close');
    expect(closeButton).toBeInTheDocument();

    await fireEvent.click(closeButton);

    // Wait for the toast to be removed from the store
    // Note: There may be a short transition period
    await waitFor(
      () => {
        expect(queryByText('Test message')).not.toBeInTheDocument();
      },
      { timeout: 1000 }
    );
  });

  it('should display the correct message', async () => {
    const message = 'This is a test toast message';
    const { getByText } = render(Toast);

    toasts.show(message, 'info', 0);

    await waitFor(() => {
      expect(getByText(message)).toBeInTheDocument();
    });
  });

  it('should have appropriate ARIA attributes for accessibility', async () => {
    const { container } = render(Toast);

    toasts.show('Test', 'info', 0);

    await waitFor(() => {
      const toast = container.querySelector('.toast');
      expect(toast).toBeInTheDocument();
      expect(toast.getAttribute('role')).toBe('alert');
    });
  });

  it('should support multiple notifications simultaneously', async () => {
    const { getByText } = render(Toast);

    toasts.show('Message 1', 'info', 0);
    toasts.show('Message 2', 'success', 0);

    await waitFor(() => {
      expect(getByText('Message 1')).toBeInTheDocument();
      expect(getByText('Message 2')).toBeInTheDocument();
    });
  });
});
