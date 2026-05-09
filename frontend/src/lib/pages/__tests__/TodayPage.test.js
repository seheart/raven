/**
 * TodayPage tests — first-run landing view.
 *
 * Mocks the apiClient (createPageApi), websocketService, and the router so
 * we can render the page in jsdom. Confirms the cost number, narrative
 * beats, and file list all render with realistic data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  narrative = {
    today: {
      events: 33,
      files: 4,
      projects: [{ project: 'atf', events: 33, files: 4 }],
      top_project: 'atf',
      longest_session_seconds: 1840
    },
    week: {
      events: 6338,
      files: 2421,
      projects: [
        { project: 'raven', events: 3906, files: 1370, days_active: 3 },
        { project: 'atf', events: 364, files: 141, days_active: 2 }
      ],
      top_project: 'raven',
      days_active: 4
    },
    returning: [{ project: 'atf', days_since_last_event: 4 }]
  },
  insightsLatest = null
} = {}) {
  mockApiGet.mockImplementation(endpoint => {
    if (endpoint.startsWith('/costs/summary')) return Promise.resolve(costs);
    if (endpoint.startsWith('/session-activity')) return Promise.resolve({ entries: activity });
    if (endpoint.startsWith('/events/recent')) return Promise.resolve(events);
    if (endpoint.startsWith('/today/narrative')) return Promise.resolve(narrative);
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

  it('renders the "returning to" beat from narrative data', async () => {
    setupApi();
    render(TodayPage);
    // 4 days, "Back on atf after 4 days — welcome back."
    expect(await screen.findByText(/Back on atf after 4 days/)).toBeTruthy();
  });

  it('renders a focus beat when one project dominates today', async () => {
    setupApi({
      narrative: {
        today: {
          events: 33,
          files: 4,
          projects: [{ project: 'atf', events: 33, files: 4 }],
          top_project: 'atf',
          longest_session_seconds: 0
        },
        week: { events: 0, files: 0, projects: [], top_project: null, days_active: 0 },
        returning: []
      }
    });
    render(TodayPage);
    expect(await screen.findByText(/heads-down on atf/)).toBeTruthy();
  });

  it('renders the week leader beat when one project takes ≥40% of activity', async () => {
    setupApi({
      narrative: {
        today: { events: 0, files: 0, projects: [], top_project: null, longest_session_seconds: 0 },
        week: {
          events: 200,
          files: 50,
          projects: [
            { project: 'raven', events: 150, files: 40, days_active: 4 },
            { project: 'atf', events: 50, files: 10, days_active: 1 }
          ],
          top_project: 'raven',
          days_active: 5
        },
        returning: []
      }
    });
    render(TodayPage);
    expect(await screen.findByText(/raven has been your main focus/)).toBeTruthy();
  });

  it('renders the file list with shortened paths', async () => {
    setupApi();
    render(TodayPage);
    // The deep path gets ellipsized through shortPath().
    await waitFor(() =>
      expect(screen.getByTitle('raven/frontend/src/lib/pages/TodayPage.svelte')).toBeTruthy()
    );
  });

  it('renders narrative beats even when LLM summaries are disabled', async () => {
    // The previous version of this page showed a "Local-LLM summaries
    // are off" hint as the primary content when insights were disabled,
    // making the landing read as broken in the common dev case. The
    // rewrite renders deterministic templated beats from /today/narrative
    // as the page's actual content and silently hides the LLM section.
    // This test pins that contract: disabled insights MUST NOT be the
    // headline, and beats from real data MUST render regardless.
    setupApi();
    mockApiGet.mockImplementation(endpoint => {
      if (endpoint.startsWith('/insights/latest')) {
        return Promise.reject(new Error('API error (503): {"error":"Insights disabled"}'));
      }
      if (endpoint.startsWith('/costs/summary'))
        return Promise.resolve({ total_cost_usd: 1.23, total_requests: 7 });
      if (endpoint.startsWith('/session-activity')) return Promise.resolve({ entries: [] });
      if (endpoint.startsWith('/events/recent')) return Promise.resolve([]);
      if (endpoint.startsWith('/today/narrative'))
        return Promise.resolve({
          today: {
            events: 12,
            files: 3,
            projects: [{ project: 'raven', events: 12, files: 3 }],
            top_project: 'raven',
            longest_session_seconds: 0
          },
          week: { events: 12, files: 3, projects: [], top_project: null, days_active: 1 },
          returning: []
        });
      return Promise.resolve(null);
    });
    mockApiPost.mockRejectedValue(new Error('API error (503): {"error":"Insights disabled"}'));
    render(TodayPage);
    // A daily-tally beat must appear (cost + project + requests).
    await waitFor(() =>
      expect(screen.getByText(/Today you've spent \$1\.23 on raven/)).toBeTruthy()
    );
    // The disabled-insights hint must NOT be the primary content.
    expect(screen.queryByText(/Local-LLM summaries are off/)).toBeNull();
  });
});
