/**
 * TodayPage tests — the Narrative landing view.
 *
 * Mocks the apiClient (createPageApi), websocketService, and the router so
 * we can render the page in jsdom. The page now leads with Raven's persona
 * (PersonaCard) and the daily + weekly digests (DailyDigest / WeekRecap),
 * each a child component fetching its own endpoint through the same mocked
 * api. These tests confirm the cost number, the persona, the digests, and
 * the file list all render with realistic data.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';

const { mockApiGet, mockApiPost } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPost: vi.fn()
}));

vi.mock('../../apiClient.js', () => {
  const api = {
    get: mockApiGet,
    post: mockApiPost,
    put: vi.fn(),
    delete: vi.fn()
  };
  return {
    api,
    apiFetch: vi.fn(),
    createPageApi: () => ({ api, abort: vi.fn() })
  };
});

vi.mock('../../services/websocket.js', () => ({
  websocketService: {
    isConnected: () => true,
    on: vi.fn(),
    off: vi.fn()
  }
}));

vi.mock('../../utils/router.svelte.js', () => ({
  navigate: vi.fn()
}));

import TodayPage from '../TodayPage.svelte';

/** Wire up a default set of mock responses keyed on endpoint. */
function setupApi({
  costs = {
    total_cost_usd: 4.32,
    total_requests: 17,
    total_input_tokens: 2000,
    total_output_tokens: 5000,
    total_cache_read_tokens: 9_000_000
  },
  activity = [
    {
      timestamp: new Date().toISOString(),
      type: 'tool',
      content: 'Bash: ls',
      metadata: { tool: 'Bash' }
    }
  ],
  events = [
    {
      id: 1,
      timestamp: new Date().toISOString(),
      filepath: 'raven/frontend/src/lib/pages/TodayPage.svelte',
      change_type: 'change',
      project_name: 'raven'
    }
  ],
  persona = {
    has_data: true,
    window_days: 30,
    tenure_days: 44,
    title: 'The Evening Juggler',
    tagline: 'You build in the evenings at a steady rhythm, mostly in Python.',
    current_streak: 2,
    languages: [
      { language: 'Python', share: 0.22 },
      { language: 'JavaScript', share: 0.12 }
    ],
    rhythm: { active_days: 15 },
    traits: [
      {
        glyph: '☾',
        tone: 'info',
        label: 'Evening',
        text: 'Evenings are when you come alive — your activity crests around 8pm.'
      }
    ]
  },
  dailyDigest = {
    day: '2026-05-31',
    day_label: 'Today',
    day_start: new Date().toISOString(),
    lead: { kind: 'top-project', text: 'raven led today with 241 changes.' },
    beats: [{ glyph: '$', tone: 'accent', text: '$6.75 across 4,407 requests.' }],
    stats: { events: 558 }
  },
  weeklyDigest = {
    week_key: '2026-W22',
    week_start: new Date().toISOString(),
    week_end: new Date().toISOString(),
    lead: { kind: 'returning', text: 'You came back to atf after 16 days away.' },
    beats: [{ glyph: '$', tone: 'accent', text: '$14,548 spent across 18,740 requests.' }],
    stats: { events: 1874 }
  },
  insightsLatest = null
} = {}) {
  mockApiGet.mockImplementation(endpoint => {
    if (endpoint.startsWith('/costs/summary')) return Promise.resolve(costs);
    if (endpoint.startsWith('/session-activity')) return Promise.resolve({ entries: activity });
    if (endpoint.startsWith('/events/recent')) return Promise.resolve(events);
    if (endpoint.startsWith('/persona')) return Promise.resolve(persona);
    if (endpoint.startsWith('/digests/daily')) return Promise.resolve(dailyDigest);
    if (endpoint.startsWith('/digests/weekly')) return Promise.resolve(weeklyDigest);
    if (endpoint.startsWith('/insights/latest')) return Promise.resolve(insightsLatest);
    return Promise.resolve(null);
  });
  // Insights generation: simulate "no fresh content yet" so the page falls
  // back to the inline "no summary" hint without polling.
  mockApiPost.mockResolvedValue({ message: 'no activity' });
}

describe('TodayPage', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the formatted spend so far today', async () => {
    setupApi();
    render(TodayPage);
    await waitFor(() => expect(screen.getByText('$4.32')).toBeTruthy());
  });

  it('renders the persona title and tagline from /persona', async () => {
    setupApi();
    render(TodayPage);
    expect(await screen.findByText('The Evening Juggler')).toBeTruthy();
    expect(await screen.findByText(/You build in the evenings at a steady rhythm/)).toBeTruthy();
  });

  it('renders a persona trait beat', async () => {
    setupApi();
    render(TodayPage);
    expect(await screen.findByText(/Evenings are when you come alive/)).toBeTruthy();
  });

  it('renders the daily digest lead from /digests/daily', async () => {
    setupApi();
    render(TodayPage);
    expect(await screen.findByText('raven led today with 241 changes.')).toBeTruthy();
  });

  it('renders the weekly recap lead from /digests/weekly', async () => {
    setupApi();
    render(TodayPage);
    expect(await screen.findByText('You came back to atf after 16 days away.')).toBeTruthy();
  });

  it('renders the file list with shortened paths', async () => {
    setupApi();
    render(TodayPage);
    // The deep path gets ellipsized through shortPath().
    await waitFor(() =>
      expect(screen.getByTitle('raven/frontend/src/lib/pages/TodayPage.svelte')).toBeTruthy()
    );
  });

  it('renders the full deduped count of files touched today, not just the displayed top-10', async () => {
    // Regression: filesToday used to slice(0, 10) BEFORE counting, so the
    // "X unique" label and the hero tile both silently capped at 10 even
    // when the user had touched 1,300+ unique files. Pin the contract:
    // count must reflect the whole deduped set; only the rendered list is
    // capped for screen real estate.
    const today = new Date().toISOString();
    const manyEvents = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      timestamp: today,
      filepath: `raven/path/file-${i}.ts`,
      change_type: 'change',
      project_name: 'raven'
    }));
    setupApi({ events: manyEvents });
    render(TodayPage);
    // PageSection renders meta inside a span as "· <count> unique"; the
    // findByText regex matches the count + label.
    expect(await screen.findByText(/·\s*50 unique/)).toBeTruthy();
    expect(screen.queryByText(/·\s*10 unique/)).toBeNull();
  });

  it('still renders the persona and digests when LLM narration is disabled', async () => {
    // The optional "Raven's note" (LLM summary) is supplemental color. When
    // insights are disabled (the common dev case) it must hide silently and
    // never become the headline — the deterministic persona + digests carry
    // the page regardless.
    setupApi();
    mockApiGet.mockImplementation(endpoint => {
      if (endpoint.startsWith('/insights/latest')) {
        return Promise.reject(new Error('API error (503): {"error":"Insights disabled"}'));
      }
      if (endpoint.startsWith('/costs/summary'))
        return Promise.resolve({ total_cost_usd: 1.23, total_requests: 7 });
      if (endpoint.startsWith('/session-activity')) return Promise.resolve({ entries: [] });
      if (endpoint.startsWith('/events/recent')) return Promise.resolve([]);
      if (endpoint.startsWith('/persona'))
        return Promise.resolve({
          has_data: true,
          window_days: 30,
          tenure_days: 12,
          title: 'The Nocturnal Specialist',
          tagline: 'You build after dark, in long stretches, mostly in Rust.',
          current_streak: 0,
          languages: [],
          rhythm: { active_days: 8 },
          traits: []
        });
      if (endpoint.startsWith('/digests/daily'))
        return Promise.resolve({
          day_label: 'Today',
          day_start: new Date().toISOString(),
          lead: { kind: 'focus', text: 'Heads-down on raven — 80% of today.' },
          beats: [],
          stats: { events: 12 }
        });
      return Promise.resolve(null);
    });
    mockApiPost.mockRejectedValue(new Error('API error (503): {"error":"Insights disabled"}'));
    render(TodayPage);
    // The persona headline must render even with the LLM disabled.
    await waitFor(() => expect(screen.getByText('The Nocturnal Specialist')).toBeTruthy());
    // The disabled-insights hint must NOT be the primary content.
    expect(screen.queryByText(/Local-LLM summaries are off/)).toBeNull();
  });
});
