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
  getPath: () => '/today',
  router: { path: '/today', isActive: () => false, navigate: mockNavigate }
}));

import Header from '../Header.svelte';

describe('Header', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders the canonical top-level tabs', () => {
    render(Header, { props: { activeTab: 'today', activeSubTab: '' } });
    // The home tab now reads "Dashboard"; route id stays 'today' so existing
    // /today links and tests resolve. Activity / Agents / Insights / System
    // are unique strings.
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeTruthy();
    for (const label of ['Activity', 'Agents', 'Insights', 'System']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('renders the Activity sub-tabs when activeTab="activity"', () => {
    render(Header, { props: { activeTab: 'activity', activeSubTab: '' } });
    expect(screen.getByRole('button', { name: 'Changes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy();
  });

  it('renders the Agents sub-tabs when activeTab="agents"', () => {
    render(Header, { props: { activeTab: 'agents', activeSubTab: '' } });
    expect(screen.getByRole('button', { name: 'Conversations' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Models' })).toBeTruthy();
  });

  it('renders Insights sub-tabs including Looking Back', () => {
    render(Header, { props: { activeTab: 'insights', activeSubTab: '' } });
    expect(screen.getByText('Costs')).toBeTruthy();
    expect(screen.getByText('Looking Back')).toBeTruthy();
  });

  it('renders the culled System sub-tabs', () => {
    render(Header, { props: { activeTab: 'system', activeSubTab: '' } });
    expect(screen.getByRole('button', { name: 'Projects' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Errors' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Storage' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Plugins' })).toBeTruthy();
  });

  it('navigates when a top-level tab is clicked', async () => {
    render(Header, { props: { activeTab: 'today', activeSubTab: '' } });
    await fireEvent.click(screen.getByText('System'));
    expect(mockNavigate).toHaveBeenCalledWith('/system');
  });

  it('navigates with the sub-tab path when a sub-tab is clicked', async () => {
    render(Header, { props: { activeTab: 'activity', activeSubTab: '' } });
    await fireEvent.click(screen.getByText('Search'));
    expect(mockNavigate).toHaveBeenCalledWith('/activity/search');
  });
});
