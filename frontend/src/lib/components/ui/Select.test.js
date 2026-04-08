/**
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Select from './Select.svelte';

describe('Select Component', () => {
  it('renders select with options', () => {
    const options = [
      { value: '1', label: 'Option 1' },
      { value: '2', label: 'Option 2' },
      { value: '3', label: 'Option 3' }
    ];

    render(Select, { options });

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('Option 1')).toBeInTheDocument();
    expect(screen.getByText('Option 2')).toBeInTheDocument();
    expect(screen.getByText('Option 3')).toBeInTheDocument();
  });

  it('sets default value correctly', () => {
    const options = [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' }
    ];
    const value = 'b';

    const { container } = render(Select, { options, value });

    const select = container.querySelector('select');
    expect(select.value).toBe('b');
  });

  it('renders with placeholder', () => {
    const options = [{ value: '1', label: 'Option' }];
    const placeholder = 'Choose an option';

    render(Select, { options, placeholder });

    expect(screen.getByText('Choose an option')).toBeInTheDocument();
  });

  it('disables select when disabled prop is true', () => {
    const options = [{ value: '1', label: 'Option' }];
    const disabled = true;

    const { container } = render(Select, { options, disabled });

    const select = container.querySelector('select');
    expect(select).toBeDisabled();
  });

});
