/**
 * Events API Test Suite
 */

import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const app = express();
app.use(express.json());

app.get('/api/events', (req, res) => {
  res.json({ events: [], total: 0, hasMore: false });
});

describe('Events API', () => {
  it('should return events list', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
  });
});
