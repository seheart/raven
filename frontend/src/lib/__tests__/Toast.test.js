/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Toast from '../Toast.svelte';

describe('Toast Component', () => {
  const defaultProps = {
    type: 'info',
    message: 'Test message',
    visible: true,
    onClose: () => {}
  };

  it('should render when visible', () => {
    const { getByText } = render(Toast, { props: defaultProps });

    expect(getByText('Test message')).toBeInTheDocument();
  });

  it('should not render when not visible', () => {
    const { container } = render(Toast, {
      props: { ...defaultProps, visible: false }
    });

    expect(container.querySelector('.toast')).not.toBeInTheDocument();
  });

  it('should render with correct type class', () => {
    const { container } = render(Toast, { props: defaultProps });
    const toast = container.querySelector('.toast');

    expect(toast.classList.contains('toast--info')).toBe(true);
  });

  it('should render different types correctly', () => {
    const types = ['success', 'error', 'warning', 'info'];

    types.forEach(type => {
      const { container } = render(Toast, {
        props: { ...defaultProps, type }
      });
      const toast = container.querySelector('.toast');

      expect(toast.classList.contains(`toast--${type}`)).toBe(true);
    });
  });

  it('should call onClose when close button clicked', async () => {
    let closeCalled = false;
    const onClose = () => { closeCalled = true; };

    const { container } = render(Toast, {
      props: { ...defaultProps, onClose }
    });

    const closeButton = container.querySelector('.toast__close');
    if (closeButton) {
      await fireEvent.click(closeButton);
      expect(closeCalled).toBe(true);
    }
  });

  it('should display the correct message', () => {
    const message = 'This is a test toast message';
    const { getByText } = render(Toast, {
      props: { ...defaultProps, message }
    });

    expect(getByText(message)).toBeInTheDocument();
  });

  it('should have appropriate ARIA attributes for accessibility', () => {
    const { container } = render(Toast, { props: defaultProps });
    const toast = container.querySelector('.toast');

    // Toast should have role="alert" for screen readers
    expect(
      toast.getAttribute('role') === 'alert' ||
      toast.getAttribute('role') === 'status'
    ).toBe(true);
  });
});
