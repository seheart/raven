#!/usr/bin/env node
/**
 * Health Check Script
 * Simple HTTP GET to /health endpoint
 * Exits with 0 if healthy (HTTP 200), 1 otherwise
 */

import http from 'node:http';

const options = {
  hostname: 'localhost',
  port: 9100,
  path: '/health',
  method: 'GET',
  timeout: 5000 // 5 second timeout
};

const req = http.request(options, res => {
  if (res.statusCode === 200) {
    process.exit(0); // Success
  } else {
    process.exit(1); // Failure
  }
});

req.on('error', () => {
  process.exit(1); // Connection error
});

req.on('timeout', () => {
  req.destroy();
  process.exit(1); // Timeout
});

req.end();
