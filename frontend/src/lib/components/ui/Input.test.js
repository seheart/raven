import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Input from './Input.svelte';

describe('Input Component', () => {
  it('renders with default props', () => {
    const { container } = render(Input);

    const input = container.querySelector('input');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'text');
    expect(input).not.toBeDisabled();
  });

  it('renders with label', () => {
    const { container } = render(Input, {
      props: {
        label: 'Email Address',
        id: 'email'
      }
    });

    const label = container.querySelector('label');
    expect(label).toBeInTheDocument();
    expect(label).toHaveTextContent('Email Address');
    expect(label).toHaveAttribute('for', 'email');
  });

  it('shows required indicator', () => {
    const { container } = render(Input, {
      props: {
        label: 'Email',
        required: true
      }
    });

    const label = container.querySelector('label');
    const required = label.querySelector('span');
    expect(required).toHaveTextContent('*');
  });

  it('renders with helper text', () => {
    render(Input, {
      props: {
        helper: 'Enter your email address',
        name: 'email'
      }
    });

    const helper = screen.getByText('Enter your email address');
    expect(helper).toBeInTheDocument();
    expect(helper).toHaveAttribute('id', 'email-description');
  });

  it('renders with error message', () => {
    const { container } = render(Input, {
      props: {
        error: 'Email is required',
        name: 'email'
      }
    });

    const error = screen.getByText('Email is required');
    expect(error).toBeInTheDocument();
    expect(error).toHaveClass('text-[var(--error)]');

    const input = container.querySelector('input');
    expect(input).toHaveClass('border-[var(--error)]');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('renders different input types', () => {
    const types = ['text', 'email', 'password', 'number'];

    types.forEach(type => {
      const { container } = render(Input, { props: { type } });
      const input = container.querySelector('input');
      expect(input).toHaveAttribute('type', type);
    });
  });

  it('handles disabled state', () => {
    const { container } = render(Input, {
      props: {
        disabled: true
      }
    });

    const input = container.querySelector('input');
    expect(input).toBeDisabled();
    expect(input).toHaveClass('opacity-50', 'cursor-not-allowed');
  });

  it('handles readonly state', () => {
    const { container } = render(Input, {
      props: {
        readonly: true
      }
    });

    const input = container.querySelector('input');
    expect(input).toHaveAttribute('readonly');
  });

  it('renders with icon', () => {
    const { container } = render(Input, {
      props: {
        icon: '📧'
      }
    });

    const icon = container.querySelector('.absolute');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveTextContent('📧');

    const input = container.querySelector('input');
    expect(input).toHaveClass('pl-10');
  });

  it('handles placeholder text', () => {
    const { container } = render(Input, {
      props: {
        placeholder: 'Enter your email'
      }
    });

    const input = container.querySelector('input');
    expect(input).toHaveAttribute('placeholder', 'Enter your email');
  });

  it('handles name and id attributes', () => {
    const { container } = render(Input, {
      props: {
        name: 'email-input',
        id: 'email-field'
      }
    });

    const input = container.querySelector('input');
    expect(input).toHaveAttribute('name', 'email-input');
    expect(input).toHaveAttribute('id', 'email-field');
  });

  it('handles autocomplete attribute', () => {
    const { container } = render(Input, {
      props: {
        autocomplete: 'email'
      }
    });

    const input = container.querySelector('input');
    expect(input).toHaveAttribute('autocomplete', 'email');
  });

  it('handles min and max for number inputs', () => {
    const { container } = render(Input, {
      props: {
        type: 'number',
        min: 0,
        max: 100
      }
    });

    const input = container.querySelector('input');
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '100');
  });

  it('accepts custom className', () => {
    const { container } = render(Input, {
      props: {
        class: 'custom-input'
      }
    });

    const input = container.querySelector('input');
    expect(input).toHaveClass('custom-input');
  });

  it('has proper ARIA attributes for errors', () => {
    const { container } = render(Input, {
      props: {
        error: 'Invalid input',
        id: 'test-input'
      }
    });

    const input = container.querySelector('input');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'test-input-description');
  });

  it('has proper ARIA attributes for helper text', () => {
    const { container } = render(Input, {
      props: {
        helper: 'Help text',
        id: 'test-input'
      }
    });

    const input = container.querySelector('input');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(input).toHaveAttribute('aria-describedby', 'test-input-description');
  });

  it('has base styling classes', () => {
    const { container } = render(Input);

    const input = container.querySelector('input');
    expect(input).toHaveClass('w-full');
    expect(input).toHaveClass('rounded-lg');
    expect(input).toHaveClass('border');
    expect(input).toHaveClass('outline-none');
  });

});
