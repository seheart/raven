/**
 * WebSocket Service Tests
 * Tests for real-time event broadcasting and connection management
 */

import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';

describe('WebSocket Service', () => {
  let httpServer;
  let io;
  let serverSocket;
  let clientSocket;

  beforeEach((done) => {
    // Create HTTP server
    httpServer = createServer();

    // Create Socket.IO server
    io = new SocketIOServer(httpServer);

    // Start server on random port
    httpServer.listen(() => {
      const port = httpServer.address().port;

      // Set up one-time connection handler for first client
      io.once('connection', (socket) => {
        serverSocket = socket;
      });

      // Import socket.io-client dynamically
      import('socket.io-client').then(({ io: ioClient }) => {
        // Create client connection
        clientSocket = ioClient(`http://localhost:${port}`);

        clientSocket.on('connect', () => {
          done();
        });
      });
    });
  });

  afterEach(() => {
    // Clean up connections
    if (clientSocket) {
      clientSocket.close();
    }
    if (io) {
      io.close();
    }
    if (httpServer) {
      httpServer.close();
    }
  });

  describe('Connection Management', () => {
    it('should establish WebSocket connection', () => {
      expect(clientSocket.connected).toBe(true);
      expect(serverSocket).toBeDefined();
    });

    it('should handle disconnection', (done) => {
      clientSocket.on('disconnect', () => {
        expect(clientSocket.connected).toBe(false);
        done();
      });

      clientSocket.disconnect();
    });

    it('should handle reconnection', (done) => {
      let wasDisconnected = false;

      // Track disconnection
      clientSocket.once('disconnect', () => {
        wasDisconnected = true;
      });

      // Set up reconnect listener
      clientSocket.on('connect', () => {
        // Only call done if we reconnected after being disconnected
        if (wasDisconnected) {
          expect(clientSocket.connected).toBe(true);
          done();
        }
      });

      clientSocket.disconnect();
      // Reconnect after a brief delay
      setTimeout(() => {
        clientSocket.connect();
      }, 100);
    });
  });

  describe('Event Broadcasting', () => {
    it('should broadcast file-changed event', (done) => {
      const testData = {
        filepath: 'test.js',
        change_type: 'change',
        project: 'test-project'
      };

      clientSocket.on('file-changed', (data) => {
        expect(data).toEqual(testData);
        done();
      });

      io.emit('file-changed', testData);
    });

    it('should broadcast system-metrics event', (done) => {
      const testMetrics = {
        cpu_percent: 45.2,
        memory_percent: 62.1,
        memory_used_mb: 4096,
        memory_total_mb: 8192
      };

      clientSocket.on('system-metrics', (data) => {
        expect(data).toEqual(testMetrics);
        done();
      });

      io.emit('system-metrics', testMetrics);
    });

    it('should broadcast syntax-error event', (done) => {
      const errorData = {
        filepath: 'test.js',
        line: 42,
        message: 'Unexpected token',
        severity: 'error'
      };

      clientSocket.on('syntax-error', (data) => {
        expect(data).toEqual(errorData);
        done();
      });

      io.emit('syntax-error', errorData);
    });

    it('should broadcast test-result event', (done) => {
      const testResult = {
        filepath: 'test.spec.js',
        passed: true,
        duration: 245
      };

      clientSocket.on('test-result', (data) => {
        expect(data).toEqual(testResult);
        done();
      });

      io.emit('test-result', testResult);
    });

    it('should broadcast project-switched event', (done) => {
      const projectData = {
        projectName: 'new-project',
        projectPath: '/path/to/new-project'
      };

      clientSocket.on('project-switched', (data) => {
        expect(data).toEqual(projectData);
        done();
      });

      io.emit('project-switched', projectData);
    });

    it('should broadcast storage-warning event', (done) => {
      const warningData = {
        percentage: '92.5',
        size: 950000000,
        critical: false
      };

      clientSocket.on('storage-warning', (data) => {
        expect(data).toEqual(warningData);
        done();
      });

      io.emit('storage-warning', warningData);
    });

    it('should broadcast health-check-failed event', (done) => {
      const healthData = {
        checkName: 'Database Connection',
        message: 'Connection timeout',
        severity: 'critical'
      };

      clientSocket.on('health-check-failed', (data) => {
        expect(data).toEqual(healthData);
        done();
      });

      io.emit('health-check-failed', healthData);
    });
  });

  describe('Room/Namespace Support', () => {
    it('should support rooms for project-specific events', (done) => {
      const testData = { message: 'test' };

      clientSocket.emit('join-project', 'test-project');

      serverSocket.on('join-project', (projectName) => {
        serverSocket.join(projectName);

        // Emit to room
        io.to('test-project').emit('project-event', testData);
      });

      clientSocket.on('project-event', (data) => {
        expect(data).toEqual(testData);
        done();
      });
    });

    it('should not receive events from other rooms', (done) => {
      let receivedEvent = false;

      clientSocket.emit('join-project', 'project-a');

      serverSocket.on('join-project', (projectName) => {
        serverSocket.join(projectName);

        // Emit to different room
        io.to('project-b').emit('project-event', { message: 'should not receive' });

        // Wait a bit to ensure event would have been received if it was going to be
        setTimeout(() => {
          expect(receivedEvent).toBe(false);
          done();
        }, 100);
      });

      clientSocket.on('project-event', () => {
        receivedEvent = true;
      });
    });
  });

  describe('Multiple Clients', () => {
    let clientSocket2;
    let serverSocket2;

    beforeEach((done) => {
      const port = httpServer.address().port;

      // Track second server socket connection
      const onSecondConnection = (socket) => {
        serverSocket2 = socket;
        io.off('connection', onSecondConnection);
      };
      io.on('connection', onSecondConnection);

      import('socket.io-client').then(({ io: ioClient }) => {
        clientSocket2 = ioClient(`http://localhost:${port}`);
        clientSocket2.on('connect', done);
      });
    });

    afterEach(() => {
      if (clientSocket2) {
        clientSocket2.close();
      }
    });

    it('should broadcast to all connected clients', (done) => {
      const testData = { message: 'broadcast to all' };
      let client1Received = false;
      let client2Received = false;

      clientSocket.on('broadcast-event', (data) => {
        expect(data).toEqual(testData);
        client1Received = true;
        checkBothReceived();
      });

      clientSocket2.on('broadcast-event', (data) => {
        expect(data).toEqual(testData);
        client2Received = true;
        checkBothReceived();
      });

      function checkBothReceived() {
        if (client1Received && client2Received) {
          done();
        }
      }

      io.emit('broadcast-event', testData);
    });

    it('should handle client-specific acknowledgments', (done) => {
      // Register listener BEFORE emitting the event
      clientSocket.on('request-ack', (data, callback) => {
        expect(data).toBe('test');
        callback('acknowledged');
      });

      // Add small delay to ensure listener is registered
      setTimeout(() => {
        // Now emit the event with acknowledgment callback
        serverSocket.emit('request-ack', 'test', (response) => {
          expect(response).toBe('acknowledged');
          done();
        });
      }, 50);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid event data gracefully', (done) => {
      clientSocket.on('invalid-event', (data) => {
        expect(data).toBeNull();
        done();
      });

      io.emit('invalid-event', null);
    });

    it('should handle connection errors', (done) => {
      const badPort = 9999;

      import('socket.io-client').then(({ io: ioClient }) => {
        const badClient = ioClient(`http://localhost:${badPort}`, {
          reconnection: false
        });

        badClient.on('connect_error', (error) => {
          expect(error).toBeDefined();
          badClient.close();
          done();
        });
      });
    });
  });

  describe('Event Throttling', () => {
    it('should handle rapid event emission', (done) => {
      let receivedCount = 0;
      const expectedCount = 100;

      clientSocket.on('rapid-event', () => {
        receivedCount++;
        if (receivedCount === expectedCount) {
          expect(receivedCount).toBe(expectedCount);
          done();
        }
      });

      // Emit 100 events rapidly
      for (let i = 0; i < expectedCount; i++) {
        io.emit('rapid-event', { index: i });
      }
    });
  });

  describe('Connection State', () => {
    it('should track connection count', () => {
      const sockets = io.sockets.sockets;
      expect(sockets.size).toBeGreaterThan(0);
    });

    it('should decrease connection count on disconnect', (done) => {
      const initialCount = io.sockets.sockets.size;

      serverSocket.on('disconnect', () => {
        const newCount = io.sockets.sockets.size;
        expect(newCount).toBe(initialCount - 1);
        done();
      });

      clientSocket.disconnect();
    });
  });
});
