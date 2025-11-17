/**
 * MSW API Mock Handlers
 * Provides mock responses for API endpoints during testing
 */
import { http, HttpResponse } from 'msw';

const baseURL = 'http://localhost:9100';

export const handlers = [
  // Status endpoint
  http.get(`${baseURL}/api/status`, () => {
    return HttpResponse.json({
      status: 'ok',
      uptime: 12345,
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  }),

  // Health endpoint
  http.get(`${baseURL}/api/health`, () => {
    return HttpResponse.json({
      status: 'healthy',
      checks: {
        database: 'ok',
        memory: 'ok',
        disk: 'ok'
      }
    });
  }),

  // Events endpoint
  http.get(`${baseURL}/api/events`, () => {
    return HttpResponse.json({
      events: [
        {
          id: 1,
          timestamp: new Date().toISOString(),
          filepath: 'test.js',
          change_type: 'modified',
          session_id: 'test-session'
        }
      ],
      total: 1,
      hasMore: false
    });
  }),

  // Errors endpoint
  http.get(`${baseURL}/api/errors`, () => {
    return HttpResponse.json({
      errors: [],
      total: 0,
      hasMore: false
    });
  }),

  // Notifications endpoint
  http.get(`${baseURL}/api/notifications`, () => {
    return HttpResponse.json({
      notifications: [
        {
          id: 1,
          message: 'Test notification',
          type: 'info',
          severity: 'low',
          read: false,
          timestamp: new Date().toISOString()
        }
      ],
      total: 1,
      hasMore: false,
      unread: 1
    });
  }),

  // Notification stats
  http.get(`${baseURL}/api/notifications/stats`, () => {
    return HttpResponse.json({
      total: 1,
      unread: 1,
      by_type: { info: 1 },
      by_severity: { low: 1 }
    });
  }),

  // Mark notification as read
  http.post(`${baseURL}/api/notifications/:id/read`, ({ params }) => {
    return HttpResponse.json({
      success: true,
      id: params.id
    });
  }),

  // Mark all notifications as read
  http.post(`${baseURL}/api/notifications/mark-all-read`, () => {
    return HttpResponse.json({
      success: true,
      updated: 1
    });
  }),

  // Delete notification
  http.delete(`${baseURL}/api/notifications/:id`, ({ params }) => {
    return HttpResponse.json({
      success: true,
      id: params.id
    });
  }),

  // Delete all notifications
  http.delete(`${baseURL}/api/notifications`, () => {
    return HttpResponse.json({
      success: true,
      deleted: 1
    });
  }),

  // Endpoints discovery
  http.get(`${baseURL}/api/endpoints`, () => {
    return HttpResponse.json({
      endpoints: [
        { path: '/api/status', method: 'GET', category: 'Core', description: 'Server status' },
        { path: '/api/health', method: 'GET', category: 'Core', description: 'Health check' },
        { path: '/api/events', method: 'GET', category: 'Data', description: 'List events' },
        { path: '/api/errors', method: 'GET', category: 'Data', description: 'List errors' },
        {
          path: '/api/notifications',
          method: 'GET',
          category: 'Data',
          description: 'List notifications'
        }
      ]
    });
  }),

  // Sync configuration
  http.get(`${baseURL}/api/sync/config`, () => {
    return HttpResponse.json({
      config: {
        enabled: false,
        remoteUrl: '',
        syncInterval: 300,
        autoSync: false,
        syncTypes: ['events', 'agent-events', 'errors']
      },
      lastSync: null,
      history: []
    });
  })
];
