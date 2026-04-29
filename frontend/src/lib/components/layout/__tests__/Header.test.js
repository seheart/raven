/**
 * Header tests — the chrome that wraps every page.
 *
 * Header has live dependencies (api.get, projectFilter store, router.navigate,
 * websocket via app.svelte) so the tests mock those at the module level.
 * Focus is on what users notice: the right tabs are present, sub-tabs match
 * the active section, and clicking calls the router.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

// Mock api before importing Header.
vi.mock('../../../apiClient.js', () => ({
  api: {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({})
  },
  apiFetch: vi.fn().mockResolvedValue({})
}));

// Mock projectFilterStore — its real impl reads from localStorage on import,
// which throws in jsdom without a stub. Provide a writable-store-shaped
// mock so Header can subscribe and call set() without exploding.
vi.mock('../../../projectFilterStore.js', async () => {
  const { writable } = await import('svelte/store');
  return {
    projectFilter: writable('all'),
    availableProjects: writable([])
  };
});

// Stable router mock — assert against `mockNavigate` per test.
// Hoisted so the mock factory (also hoisted) can reference it.
const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock('../../../utils/router.svelte.js', () => ({
  navigate: (...args) => mockNavigate(...args),
  getPath: () => '/overview',
  router: { path: '/overview', isActive: () => false, navigate: mockNavigate }
}));

import Header from '../Header.svelte';

describe('Header', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders the canonical top-level tabs', () => {
    render(Header, { props: { activeTab: 'overview', activeSubTab: '' } });
    for (const label of ['Dashboard', 'Insights', 'Analysis', 'Code Changes', 'History', 'System']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('renders the History sub-tabs when activeTab="history"', () => {
    render(Header, { props: { activeTab: 'history', activeSubTab: '' } });
    expect(screen.getByText('Timeline')).toBeTruthy();
    expect(screen.getByText('File Browser')).toBeTruthy();
    expect(screen.getByText('Global Search')).toBeTruthy();
  });

  it('renders the Analysis sub-tabs when activeTab="analysis"', () => {
    render(Header, { props: { activeTab: 'analysis', activeSubTab: '' } });
    expect(screen.getByText('Token Usage')).toBeTruthy();
    expect(screen.getByText('Sub-Agents')).toBeTruthy();
    expect(screen.getByText('Triggers')).toBeTruthy();
  });

  it('does not render sub-tabs for sections without any (e.g. overview)', () => {
    render(Header, { props: { activeTab: 'overview', activeSubTab: '' } });
    // Analysis sub-tabs should not be present
    expect(screen.queryByText('Token Usage')).toBeNull();
    expect(screen.queryByText('Sub-Agents')).toBeNull();
  });

  it('navigates when a top-level tab is clicked', async () => {
    render(Header, { props: { activeTab: 'overview', activeSubTab: '' } });
    await fireEvent.click(screen.getByText('System'));
    expect(mockNavigate).toHaveBeenCalledWith('/system');
  });

  it('navigates with the sub-tab path when a sub-tab is clicked', async () => {
    render(Header, { props: { activeTab: 'history', activeSubTab: '' } });
    await fireEvent.click(screen.getByText('Timeline'));
    expect(mockNavigate).toHaveBeenCalledWith('/history/timeline');
  });
});
