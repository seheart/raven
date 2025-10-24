/**
 * Authentication Routes Integration Tests
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { AuthService } from '../services/auth-service.js';
import { createAuthRoutes } from '../routes/auth.js';
import { unlink } from 'fs/promises';
describe('Auth Routes', () => {
    let app;
    let db;
    let authService;
    let adminToken;
    const testDbPath = './__tests__/test-routes-auth.db';
    beforeAll(async () => {
        // Create express app
        app = express();
        app.use(express.json());
        // Create auth service
        db = new Database(testDbPath);
        authService = new AuthService(db);
        // Wait for default admin to be created
        await new Promise(resolve => setTimeout(resolve, 100));
        // Mount auth routes
        app.use('/auth', createAuthRoutes(authService));
        // Login as admin to get token
        const response = await request(app)
            .post('/auth/login')
            .send({ username: 'admin', password: 'admin123' });
        adminToken = response.body.token;
    });
    afterAll(async () => {
        if (db && db.open) {
            db.close();
        }
        try {
            await unlink(testDbPath);
        }
        catch (error) {
            // Ignore
        }
    });
    describe('POST /auth/login', () => {
        it('should login with valid credentials', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                username: 'admin',
                password: 'admin123'
            })
                .expect(200);
            expect(response.body.success).toBe(true);
            expect(response.body).toHaveProperty('token');
            expect(response.body.user.username).toBe('admin');
            expect(response.body.user.role).toBe('admin');
        });
        it('should reject invalid credentials', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                username: 'admin',
                password: 'wrongpassword'
            })
                .expect(401);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBeTruthy();
        });
        it('should reject invalid username', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                username: 'nonexistent',
                password: 'password123'
            })
                .expect(401);
            expect(response.body.success).toBe(false);
        });
        it('should validate input', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                username: 'ab', // Too short
                password: 'pass' // Too short
            })
                .expect(400);
            expect(response.body.error).toBe('Validation failed');
        });
    });
    describe('POST /auth/register', () => {
        it('should create new user as admin', async () => {
            const response = await request(app)
                .post('/auth/register')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                username: 'newuser',
                password: 'password123',
                role: 'user'
            })
                .expect(201);
            expect(response.body.success).toBe(true);
            expect(response.body).toHaveProperty('userId');
        });
        it('should reject registration without token', async () => {
            await request(app)
                .post('/auth/register')
                .send({
                username: 'anotheruser',
                password: 'password123'
            })
                .expect(401);
        });
        it('should reject duplicate username', async () => {
            const response = await request(app)
                .post('/auth/register')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                username: 'admin', // Already exists
                password: 'password123'
            })
                .expect(400);
            expect(response.body.success).toBe(false);
        });
        it('should validate password length', async () => {
            const response = await request(app)
                .post('/auth/register')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                username: 'testuser2',
                password: 'short' // Too short
            })
                .expect(400);
            expect(response.body.error).toBe('Validation failed');
        });
    });
    describe('POST /auth/change-password', () => {
        it('should change password successfully', async () => {
            const response = await request(app)
                .post('/auth/change-password')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                oldPassword: 'admin123',
                newPassword: 'newpassword123'
            })
                .expect(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('Password changed');
            // Change it back
            await request(app)
                .post('/auth/change-password')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                oldPassword: 'newpassword123',
                newPassword: 'admin123'
            });
        });
        it('should reject wrong old password', async () => {
            const response = await request(app)
                .post('/auth/change-password')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                oldPassword: 'wrongpassword',
                newPassword: 'newpassword123'
            })
                .expect(400);
            expect(response.body.success).toBe(false);
        });
        it('should require authentication', async () => {
            await request(app)
                .post('/auth/change-password')
                .send({
                oldPassword: 'admin123',
                newPassword: 'newpassword123'
            })
                .expect(401);
        });
    });
    describe('GET /auth/me', () => {
        it('should return current user info', async () => {
            const response = await request(app)
                .get('/auth/me')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            expect(response.body.success).toBe(true);
            expect(response.body.user.username).toBe('admin');
            expect(response.body.user.role).toBe('admin');
        });
        it('should require authentication', async () => {
            await request(app)
                .get('/auth/me')
                .expect(401);
        });
    });
    describe('GET /auth/users', () => {
        it('should list all users as admin', async () => {
            const response = await request(app)
                .get('/auth/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            expect(response.body.success).toBe(true);
            expect(Array.isArray(response.body.users)).toBe(true);
            expect(response.body.users.length).toBeGreaterThan(0);
        });
        it('should require admin role', async () => {
            // Create a regular user and get their token
            await authService.createUser('regularuser', 'password123', 'user');
            const loginResponse = await request(app)
                .post('/auth/login')
                .send({ username: 'regularuser', password: 'password123' });
            const userToken = loginResponse.body.token;
            // Try to access admin endpoint - should be forbidden
            const response = await request(app)
                .get('/auth/users')
                .set('Authorization', `Bearer ${userToken}`);
            // Accept either 401 or 403 as both mean insufficient permissions
            expect([401, 403]).toContain(response.status);
        });
    });
    describe('PATCH /auth/users/:id/role', () => {
        it('should update user role as admin', async () => {
            // Create a test user
            const createResponse = await request(app)
                .post('/auth/register')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                username: 'roletest',
                password: 'password123',
                role: 'user'
            });
            const userId = createResponse.body.userId;
            // Update role
            const response = await request(app)
                .patch(`/auth/users/${userId}/role`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'admin' })
                .expect(200);
            expect(response.body.success).toBe(true);
        });
        it('should require admin role', async () => {
            const loginResponse = await request(app)
                .post('/auth/login')
                .send({ username: 'regularuser', password: 'password123' });
            const userToken = loginResponse.body.token;
            const response = await request(app)
                .patch('/auth/users/1/role')
                .set('Authorization', `Bearer ${userToken}`)
                .send({ role: 'admin' });
            // Accept either 401 or 403 as both mean insufficient permissions
            expect([401, 403]).toContain(response.status);
        });
    });
    describe('PATCH /auth/users/:id/active', () => {
        it('should enable/disable user as admin', async () => {
            // Create a test user
            const createResponse = await request(app)
                .post('/auth/register')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                username: 'activetest',
                password: 'password123'
            });
            const userId = createResponse.body.userId;
            // Disable user
            const disableResponse = await request(app)
                .patch(`/auth/users/${userId}/active`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ active: false })
                .expect(200);
            expect(disableResponse.body.success).toBe(true);
            // Enable user
            const enableResponse = await request(app)
                .patch(`/auth/users/${userId}/active`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ active: true })
                .expect(200);
            expect(enableResponse.body.success).toBe(true);
        });
    });
    describe('DELETE /auth/users/:id', () => {
        it('should delete user as admin', async () => {
            // Create a test user
            const createResponse = await request(app)
                .post('/auth/register')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                username: 'deletetest',
                password: 'password123'
            });
            const userId = createResponse.body.userId;
            // Delete user
            const response = await request(app)
                .delete(`/auth/users/${userId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);
            expect(response.body.success).toBe(true);
        });
        it('should not allow deleting yourself', async () => {
            // Get admin user ID
            const meResponse = await request(app)
                .get('/auth/me')
                .set('Authorization', `Bearer ${adminToken}`);
            const adminId = meResponse.body.user.id;
            await request(app)
                .delete(`/auth/users/${adminId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(400);
        });
        it('should require admin role', async () => {
            const loginResponse = await request(app)
                .post('/auth/login')
                .send({ username: 'regularuser', password: 'password123' });
            const userToken = loginResponse.body.token;
            const response = await request(app)
                .delete('/auth/users/1')
                .set('Authorization', `Bearer ${userToken}`);
            // Accept either 401 or 403 as both mean insufficient permissions
            expect([401, 403]).toContain(response.status);
        });
    });
});
//# sourceMappingURL=auth-routes.test.js.map