/**
 * Tests for Control Route Module
 * Tests the self-healing control endpoints (restart-bridge, clear-cache, etc.)
 */
import express from 'express';
import request from 'supertest';
import { createControlRoutes } from '../../routes/control.js';
import fs from 'fs';
import { jest } from '@jest/globals';
// Mock fs and child_process modules
jest.mock('fs');
jest.unstable_mockModule('child_process', () => ({
    exec: jest.fn()
}));
describe('Control Routes', () => {
    let app;
    let mockDeps;
    let mockFileCache;
    let mockProjectStateMutex;
    let mockProjectState;
    let mockInitializeWatcher;
    let execAsync;
    beforeEach(async () => {
        // Import mocked exec after unstable_mockModule
        const { promisify } = await import('util');
        const { exec } = await import('child_process');
        execAsync = promisify(exec);
        // Create mock file cache
        mockFileCache = new Map();
        mockFileCache.set('file1.js', 'content1');
        mockFileCache.set('file2.js', 'content2');
        // Create mock project state
        mockProjectState = {
            watcher: {
                close: jest.fn().mockResolvedValue(undefined)
            },
            activeProject: 'test-project'
        };
        // Create mock mutex
        mockProjectStateMutex = {
            runExclusive: jest.fn(async (callback) => await callback())
        };
        // Create mock watcher initializer
        mockInitializeWatcher = jest.fn().mockReturnValue({
            on: jest.fn(),
            close: jest.fn()
        });
        // Create mock dependencies
        mockDeps = {
            fileCache: mockFileCache,
            projectState: mockProjectState,
            projectStateMutex: mockProjectStateMutex,
            initializeWatcher: mockInitializeWatcher,
            PORT: 3030
        };
        // Create Express app with control routes
        app = express();
        app.use(express.json());
        app.use('/api/control', createControlRoutes(mockDeps));
        // Reset mocks
        jest.clearAllMocks();
    });
    describe('POST /api/control/clear-cache', () => {
        test('should clear file cache successfully', async () => {
            const response = await request(app).post('/api/control/clear-cache');
            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                success: true,
                previousSize: 2,
                message: 'Cleared 2 cached files'
            });
            expect(mockFileCache.size).toBe(0);
        });
        test('should handle empty cache', async () => {
            mockFileCache.clear();
            const response = await request(app).post('/api/control/clear-cache');
            expect(response.status).toBe(200);
            expect(response.body.previousSize).toBe(0);
        });
        test('should handle errors during cache clear', async () => {
            // Override clear to throw error
            mockFileCache.clear = jest.fn(() => {
                throw new Error('Cache clear failed');
            });
            const response = await request(app).post('/api/control/clear-cache');
            expect(response.status).toBe(500);
            expect(response.body.error).toBeDefined();
        });
    });
    describe('POST /api/control/restart-watcher', () => {
        test('should restart file watcher successfully', async () => {
            const response = await request(app).post('/api/control/restart-watcher');
            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                success: true,
                message: 'File watcher restarted successfully',
                project: 'test-project'
            });
            // Should close existing watcher
            expect(mockProjectState.watcher.close).toHaveBeenCalled();
            // Should initialize new watcher
            expect(mockInitializeWatcher).toHaveBeenCalled();
        });
        test('should use mutex to prevent race conditions', async () => {
            await request(app).post('/api/control/restart-watcher');
            expect(mockProjectStateMutex.runExclusive).toHaveBeenCalled();
        });
        test('should handle watcher close errors gracefully', async () => {
            mockProjectState.watcher.close.mockRejectedValue(new Error('Close failed'));
            const response = await request(app).post('/api/control/restart-watcher');
            expect(response.status).toBe(500);
            expect(response.body.error).toBeDefined();
        });
        test('should handle case where no watcher exists', async () => {
            mockProjectState.watcher = null;
            const response = await request(app).post('/api/control/restart-watcher');
            expect(response.status).toBe(200);
            expect(mockInitializeWatcher).toHaveBeenCalled();
        });
    });
    describe('POST /api/control/restart-bridge - SELF-HEALING', () => {
        beforeEach(() => {
            // Mock fs.existsSync
            fs.existsSync = jest.fn().mockReturnValue(true);
            fs.readFileSync = jest.fn().mockReturnValue('12345');
            // Mock process.kill (for checking if PID is running)
            global.process.kill = jest.fn();
            // Mock execAsync
            execAsync.mockResolvedValue({ stdout: '', stderr: '' });
        });
        test('should restart bridge successfully', async () => {
            const response = await request(app).post('/api/control/restart-bridge');
            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                success: true,
                message: 'Telemetry bridge restarted successfully',
                pid: 12345
            });
            // Should call stop script
            expect(execAsync).toHaveBeenCalledWith(expect.stringContaining('stop-claude-bridge.sh'));
            // Should call start script
            expect(execAsync).toHaveBeenCalledWith(expect.stringContaining('start-claude-bridge.sh'));
        });
        test('should handle bridge not running initially', async () => {
            // First call to stop script fails (bridge not running)
            execAsync
                .mockRejectedValueOnce(new Error('Bridge not running'))
                .mockResolvedValueOnce({ stdout: '', stderr: '' });
            const response = await request(app).post('/api/control/restart-bridge');
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });
        test('should verify bridge started by checking PID file', async () => {
            await request(app).post('/api/control/restart-bridge');
            expect(fs.existsSync).toHaveBeenCalledWith('/tmp/claude-telemetry-bridge.pid');
            expect(fs.readFileSync).toHaveBeenCalledWith('/tmp/claude-telemetry-bridge.pid', 'utf-8');
            expect(process.kill).toHaveBeenCalledWith(12345, 0);
        });
        test('should fail if bridge does not start', async () => {
            fs.existsSync.mockReturnValue(false);
            const response = await request(app).post('/api/control/restart-bridge');
            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('failed to verify');
        });
        test('should fail if PID file exists but process is not running', async () => {
            process.kill.mockImplementation(() => {
                throw new Error('Process not found');
            });
            const response = await request(app).post('/api/control/restart-bridge');
            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
        });
        test('should include stdout/stderr on verification failure', async () => {
            fs.existsSync.mockReturnValue(false);
            execAsync.mockResolvedValue({
                stdout: 'Bridge output',
                stderr: 'Bridge error'
            });
            const response = await request(app).post('/api/control/restart-bridge');
            expect(response.status).toBe(500);
            expect(response.body.stdout).toBe('Bridge output');
            expect(response.body.stderr).toBe('Bridge error');
        });
        test('should handle script execution errors', async () => {
            execAsync.mockRejectedValue(new Error('Script execution failed'));
            const response = await request(app).post('/api/control/restart-bridge');
            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Script execution failed');
        });
        test('should wait 500ms between stop and start', async () => {
            jest.useFakeTimers();
            const responsePromise = request(app).post('/api/control/restart-bridge');
            // Fast-forward time
            jest.advanceTimersByTime(500);
            await responsePromise;
            jest.useRealTimers();
        });
    });
    describe('GET /api/control/export-health', () => {
        beforeEach(() => {
            // Mock global fetch
            global.fetch = jest.fn().mockResolvedValue({
                json: jest.fn().mockResolvedValue({
                    status: 'healthy',
                    version: '0.10.0',
                    uptime: 1000
                })
            });
        });
        test('should export health data with timestamp', async () => {
            const response = await request(app).get('/api/control/export-health');
            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toContain('application/json');
            expect(response.headers['content-disposition']).toContain('attachment');
            expect(response.headers['content-disposition']).toContain('raven-health-');
            expect(response.body.exported_at).toBeDefined();
            expect(response.body.status).toBe('healthy');
            expect(response.body.version).toBe('0.10.0');
            expect(response.body.uptime).toBe(1000);
        });
        test('should fetch from local health endpoint', async () => {
            await request(app).get('/api/control/export-health');
            expect(global.fetch).toHaveBeenCalledWith('http://localhost:3030/health');
        });
        test('should handle health endpoint errors', async () => {
            global.fetch.mockRejectedValue(new Error('Health endpoint unreachable'));
            const response = await request(app).get('/api/control/export-health');
            expect(response.status).toBe(500);
            expect(response.body.error).toBeDefined();
        });
        test('should set correct headers for file download', async () => {
            const response = await request(app).get('/api/control/export-health');
            expect(response.headers['content-disposition']).toMatch(/^attachment; filename="raven-health-\d+\.json"$/);
        });
    });
});
//# sourceMappingURL=control.test.js.map