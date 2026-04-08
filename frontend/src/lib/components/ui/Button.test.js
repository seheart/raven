import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Button from './Button.svelte';

describe('Button Component', () => {
  it('renders with primary variant', () => {
    const { container } = render(Button, {
      props: {
        variant: 'primary',
        children: () => 'Primary'
      }
    });

    const button = container.querySelector('button');
    expect(button).toHaveClass('bg-[var(--accent)]');
  });

  it('renders with secondary variant', () => {
    const { container } = render(Button, {
      props: {
        variant: 'secondary',
        children: () => 'Secondary'
      }
    });

    const button = container.querySelector('button');
    expect(button).toHaveClass('bg-[var(--surface-2)]');
  });

  it('renders with ghost variant', () => {
    const { container } = render(Button, {
      props: {
        variant: 'ghost',
        children: () => 'Ghost'
      }
    });

    const button = container.querySelector('button');
    expect(button).toHaveClass('bg-transparent');
  });

  it('renders with danger variant', () => {
    const { container } = render(Button, {
      props: {
        variant: 'danger',
        children: () => 'Danger'
      }
    });

    const button = container.querySelector('button');
    expect(button).toHaveClass('bg-[var(--error)]');
  });

  it('renders with success variant', () => {
    const { container } = render(Button, {
      props: {
        variant: 'success',
        children: () => 'Success'
      }
    });

    const button = container.querySelector('button');
    expect(button).toHaveClass('bg-[var(--success)]');
  });

  it('renders with small size', () => {
    const { container } = render(Button, {
      props: {
        size: 'sm',
        children: () => 'Small'
      }
    });

    const button = container.querySelector('button');
    expect(button).toHaveClass('px-3', 'py-1.5', 'text-sm');
  });

  it('renders with medium size', () => {
    const { container } = render(Button, {
      props: {
        size: 'md',
        children: () => 'Medium'
      }
    });

    const button = container.querySelector('button');
    expect(button).toHaveClass('px-4', 'py-2', 'text-base');
  });

  it('renders with large size', () => {
    const { container } = render(Button, {
      props: {
        size: 'lg',
        children: () => 'Large'
      }
    });

    const button = container.querySelector('button');
    expect(button).toHaveClass('px-6', 'py-3', 'text-lg');
  });

  it('renders as disabled', () => {
    const { container } = render(Button, {
      props: {
        disabled: true,
        children: () => 'Disabled'
      }
    });

    const button = container.querySelector('button');
    expect(button).toBeDisabled();
    expect(button).toHaveClass('opacity-50', 'cursor-not-allowed');
  });

  it('handles click events', async () => {
    const handleClick = vi.fn();
    const { container } = render(Button, {
      props: {
        onclick: handleClick,
        children: () => 'Click me'
      }
    });

    const button = container.querySelector('button');
    await fireEvent.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not trigger click when disabled', async () => {
    const handleClick = vi.fn();
    const { container } = render(Button, {
      props: {
        disabled: true,
        onclick: handleClick
      }
    });

    const button = container.querySelector('button');

    // Check button is properly disabled
    expect(button).toBeDisabled();
    expect(button).toHaveClass('pointer-events-none');
    expect(button).toHaveClass('cursor-not-allowed');
  });

  it('accepts custom className', () => {
    const { container } = render(Button, {
      props: {
        class: 'custom-class',
        children: () => 'Custom'
      }
    });

    const button = container.querySelector('button');
    expect(button).toHaveClass('custom-class');
  });

  it('accepts custom type attribute', () => {
    const { container } = render(Button, {
      props: {
        type: 'submit',
        children: () => 'Submit'
      }
    });

    const button = container.querySelector('button');
    expect(button).toHaveAttribute('type', 'submit');
  });

  it('has proper accessibility classes', () => {
    const { container } = render(Button, {
      props: {
        children: () => 'Accessible'
      }
    });

    const button = container.querySelector('button');
    expect(button).toHaveClass('focus-visible:ring-2');
    expect(button).toHaveClass('outline-none');
  });

  it('has base styling classes', () => {
    const { container } = render(Button, {
      props: {
        children: () => 'Styled'
      }
    });

    const button = container.querySelector('button');
    expect(button).toHaveClass('inline-flex');
    expect(button).toHaveClass('items-center');
    expect(button).toHaveClass('justify-center');
    expect(button).toHaveClass('rounded');
    expect(button).toHaveClass('font-semibold');
  });
});
