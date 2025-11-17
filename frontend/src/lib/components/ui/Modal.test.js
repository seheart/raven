import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Modal from './Modal.svelte';

describe('Modal Component', () => {
  let originalOverflow;

  beforeEach(() => {
    originalOverflow = document.body.style.overflow;
  });

  afterEach(() => {
    document.body.style.overflow = originalOverflow;
  });

  it.skip('renders when open is true', () => {
    render(Modal, {
      props: {
        open: true,
        title: 'Test Modal',
        children: () => 'Modal content'
      }
    });

    expect(screen.getByText('Test Modal')).toBeInTheDocument();
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    render(Modal, {
      props: {
        open: false,
        title: 'Test Modal',
        children: () => 'Modal content'
      }
    });

    expect(screen.queryByText('Test Modal')).not.toBeInTheDocument();
    expect(screen.queryByText('Modal content')).not.toBeInTheDocument();
  });

  it('renders with title', () => {
    render(Modal, {
      props: {
        open: true,
        title: 'Confirm Action'
      }
    });

    const title = screen.getByText('Confirm Action');
    expect(title).toBeInTheDocument();
    expect(title).toHaveAttribute('id', 'modal-title');
  });

  it('renders different sizes', () => {
    const { container: sm } = render(Modal, {
      props: { open: true, size: 'sm', children: () => 'Content' }
    });
    expect(sm.querySelector('.max-w-sm')).toBeInTheDocument();

    const { container: md } = render(Modal, {
      props: { open: true, size: 'md', children: () => 'Content' }
    });
    expect(md.querySelector('.max-w-md')).toBeInTheDocument();

    const { container: lg } = render(Modal, {
      props: { open: true, size: 'lg', children: () => 'Content' }
    });
    expect(lg.querySelector('.max-w-lg')).toBeInTheDocument();

    const { container: xl } = render(Modal, {
      props: { open: true, size: 'xl', children: () => 'Content' }
    });
    expect(xl.querySelector('.max-w-xl')).toBeInTheDocument();

    const { container: full } = render(Modal, {
      props: { open: true, size: 'full', children: () => 'Content' }
    });
    expect(full.querySelector('.max-w-full')).toBeInTheDocument();
  });

  it('shows close button by default', () => {
    render(Modal, {
      props: {
        open: true,
        title: 'Test Modal'
      }
    });

    const closeButton = screen.getByLabelText('Close modal');
    expect(closeButton).toBeInTheDocument();
  });

  it('hides close button when showClose is false', () => {
    render(Modal, {
      props: {
        open: true,
        title: 'Test Modal',
        showClose: false
      }
    });

    expect(screen.queryByLabelText('Close modal')).not.toBeInTheDocument();
  });

  it('has proper ARIA attributes', () => {
    const { container } = render(Modal, {
      props: {
        open: true,
        title: 'Test Modal'
      }
    });

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');
  });

  it.skip('renders children content', () => {
    render(Modal, {
      props: {
        open: true,
        children: () => 'This is the modal body'
      }
    });

    expect(screen.getByText('This is the modal body')).toBeInTheDocument();
  });

  it('accepts custom className', () => {
    const { container } = render(Modal, {
      props: {
        open: true,
        class: 'custom-modal',
        children: () => 'Content'
      }
    });

    const modal = container.querySelector('.custom-modal');
    expect(modal).toBeInTheDocument();
  });

  it('has backdrop with proper styling', () => {
    const { container } = render(Modal, {
      props: {
        open: true,
        children: () => 'Content'
      }
    });

    const backdrop = container.querySelector('.fixed.inset-0');
    expect(backdrop).toBeInTheDocument();
    expect(backdrop).toHaveClass('bg-black', 'bg-opacity-50', 'z-50');
  });

  it('has base modal styling', () => {
    const { container } = render(Modal, {
      props: {
        open: true,
        title: 'Test Modal',
        children: () => 'Content'
      }
    });

    const modal = container.querySelector('.rounded-lg.shadow-xl');
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveClass('bg-[var(--surface)]');
  });
});
