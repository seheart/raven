/**
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Table from './Table.svelte';

describe('Table Component', () => {
  it('renders table with headers and data', () => {
    const headers = ['Name', 'Age', 'Email'];
    const rows = [
      ['John Doe', '30', 'john@example.com'],
      ['Jane Smith', '25', 'jane@example.com']
    ];

    render(Table, { headers, rows });

    // Check headers
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Age')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();

    // Check data
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('renders empty state when no rows provided', () => {
    const headers = ['Name', 'Age'];
    const rows = [];

    render(Table, { headers, rows });

    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });

  it('handles missing headers gracefully', () => {
    const rows = [['Data 1', 'Data 2']];

    render(Table, { rows });

    expect(screen.getByText('Data 1')).toBeInTheDocument();
  });

  it('applies hover class correctly', () => {
    const headers = ['Column 1'];
    const rows = [['Value 1']];
    const hover = true;

    const { container } = render(Table, { headers, rows, hover });

    const table = container.querySelector('table');
    expect(table).toHaveClass('hover');
  });

  it('renders with striped variant', () => {
    const headers = ['Column 1'];
    const rows = [['Value 1'], ['Value 2']];
    const variant = 'striped';

    const { container } = render(Table, { headers, rows, variant });

    const table = container.querySelector('table');
    expect(table).toHaveClass('striped');
  });
});
