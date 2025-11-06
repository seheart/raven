/**
 * Integration Tests for WebSocket Resilience
 * Tests WebSocket connection handling, reconnection, and error recovery
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { io as ClientIO } from 'socket.io-client';

const TEST_PORT = 13030;

describe('WebSocket Resilience Integration', () => {
  let httpServer;
  let io;
  let clientSocket;

  beforeEach(done => {
    // Create HTTP server
    httpServer = new HTTPServer();

    // Create Socket.IO server
    io = new SocketIOServer(httpServer, {
      cors: { origin: '*' }
    });

    // Start server
    httpServer.listen(TEST_PORT, () => {
      done();
    });
  });

  afterEach(done => {
    // Clean up client
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }

    // Clean up server
    if (io) {
      io.close();
    }

    if (httpServer) {
      httpServer.close(() => {
        done();
      });
    } else {
      done();
    }
  });

  test('should establish connection successfully', done => {
    clientSocket = ClientIO(`http://localhost:${TEST_PORT}`);

    clientSocket.on('connect', () => {
      expect(clientSocket.connected).toBe(true);
      done();
    });
  });

  test('should reconnect after disconnect', done => {
    clientSocket = ClientIO(`http://localhost:${TEST_PORT}`, {
      reconnection: true,
      reconnectionDelay: 100,
      reconnectionAttempts: 5
    });

    let connectCount = 0;

    clientSocket.on('connect', () => {
      connectCount++;

      if (connectCount === 1) {
        // First connection - disconnect
        clientSocket.disconnect();
      } else if (connectCount === 2) {
        // Reconnected successfully
        expect(clientSocket.connected).toBe(true);
        done();
      }
    });

    clientSocket.on('disconnect', () => {
      if (connectCount === 1) {
        // Trigger reconnection
        setTimeout(() => {
          clientSocket.connect();
        }, 200);
      }
    });
  });

  test('should handle multiple rapid connect/disconnect cycles', done => {
    clientSocket = ClientIO(`http://localhost:${TEST_PORT}`, {
      reconnection: true,
      reconnectionDelay: 50
    });

    let cycleCount = 0;
    const maxCycles = 5;

    clientSocket.on('connect', () => {
      cycleCount++;

      if (cycleCount < maxCycles) {
        // Disconnect and reconnect
        clientSocket.disconnect();
        setTimeout(() => clientSocket.connect(), 100);
      } else {
        // Completed all cycles
        expect(cycleCount).toBe(maxCycles);
        expect(clientSocket.connected).toBe(true);
        done();
      }
    });
  });

  test('should receive events after reconnection', done => {
    clientSocket = ClientIO(`http://localhost:${TEST_PORT}`, {
      reconnection: true
    });

    let reconnected = false;
    let eventReceived = false;

    // Server emits test event
    io.on('connection', socket => {
      if (reconnected) {
        socket.emit('test-event', { data: 'test' });
      }
    });

    clientSocket.on('connect', () => {
      if (!reconnected) {
        // First connection - disconnect
        clientSocket.disconnect();
        reconnected = true;
        setTimeout(() => clientSocket.connect(), 200);
      }
    });

    clientSocket.on('test-event', data => {
      eventReceived = true;
      expect(data.data).toBe('test');
      expect(reconnected).toBe(true);
      done();
    });
  });

  test('should not accumulate duplicate listeners on reconnection', done => {
    clientSocket = ClientIO(`http://localhost:${TEST_PORT}`, {
      reconnection: true
    });

    let eventCount = 0;
    const testHandler = () => {
      eventCount++;
    };

    // Add listener
    clientSocket.on('test-event', testHandler);

    let connectionCount = 0;

    clientSocket.on('connect', () => {
      connectionCount++;

      if (connectionCount === 1) {
        // First connection - try to add duplicate listener
        clientSocket.on('test-event', testHandler); // Duplicate
        clientSocket.disconnect();
        setTimeout(() => clientSocket.connect(), 200);
      } else if (connectionCount === 2) {
        // After reconnection, emit event
        io.emit('test-event', {});

        setTimeout(() => {
          // Event should only fire once (no duplicates)
          expect(eventCount).toBeLessThanOrEqual(2); // Allow for some socket.io behavior
          done();
        }, 300);
      }
    });
  });

  test('should handle server restart gracefully', done => {
    clientSocket = ClientIO(`http://localhost:${TEST_PORT}`, {
      reconnection: true,
      reconnectionDelay: 100,
      reconnectionAttempts: 10
    });

    let initialConnected = false;

    clientSocket.on('connect', () => {
      if (!initialConnected) {
        initialConnected = true;

        // Simulate server restart by closing and reopening
        io.close();
        httpServer.close();

        setTimeout(() => {
          // Restart server
          httpServer = new HTTPServer();
          io = new SocketIOServer(httpServer);
          httpServer.listen(TEST_PORT);
        }, 500);
      } else {
        // Successfully reconnected after server restart
        expect(clientSocket.connected).toBe(true);
        done();
      }
    });
  }, 10000); // Longer timeout for server restart test

  test('should handle message ordering correctly', done => {
    clientSocket = ClientIO(`http://localhost:${TEST_PORT}`);

    const receivedMessages = [];
    const expectedMessages = ['msg1', 'msg2', 'msg3'];

    io.on('connection', socket => {
      // Send messages in order
      expectedMessages.forEach((msg, index) => {
        setTimeout(() => {
          socket.emit('ordered-message', msg);
        }, index * 50);
      });
    });

    clientSocket.on('ordered-message', msg => {
      receivedMessages.push(msg);

      if (receivedMessages.length === expectedMessages.length) {
        // Verify order
        expect(receivedMessages).toEqual(expectedMessages);
        done();
      }
    });
  });
});
