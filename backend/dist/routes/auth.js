/**
 * Authentication Routes for Raven
 */
import express from 'express';
import { validate } from '../middleware/validation.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { authLimiter } from '../middleware/security.js';
export function createAuthRoutes(authService) {
    const router = express.Router();
    /**
     * POST /auth/login
     * Authenticate user and return JWT token
     */
    router.post('/login', authLimiter, validate('login'), async (req, res) => {
        try {
            const { username, password } = req.body;
            const result = await authService.authenticate(username, password);
            res.json({
                success: true,
                token: result.token,
                user: result.user
            });
        }
        catch (error) {
            res.status(401).json({
                success: false,
                error: error.message
            });
        }
    });
    /**
     * POST /auth/register
     * Register a new user (admin only)
     */
    router.post('/register', authenticate, authorize('admin'), validate('register'), async (req, res) => {
        try {
            const { username, password, role } = req.body;
            const userId = await authService.createUser(username, password, role);
            res.status(201).json({
                success: true,
                userId,
                message: 'User created successfully'
            });
        }
        catch (error) {
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    });
    /**
     * POST /auth/change-password
     * Change current user's password
     */
    router.post('/change-password', authenticate, validate('changePassword'), async (req, res) => {
        try {
            const { oldPassword, newPassword } = req.body;
            await authService.changePassword(req.user.id, oldPassword, newPassword);
            res.json({
                success: true,
                message: 'Password changed successfully'
            });
        }
        catch (error) {
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    });
    /**
     * GET /auth/me
     * Get current user info
     */
    router.get('/me', authenticate, (req, res) => {
        const user = authService.getUserById(req.user.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                createdAt: user.created_at,
                lastLogin: user.last_login
            }
        });
    });
    /**
     * GET /auth/users
     * Get all users (admin only)
     */
    router.get('/users', authenticate, authorize('admin'), (req, res) => {
        const users = authService.getAllUsers();
        res.json({
            success: true,
            users: users.map(u => ({
                id: u.id,
                username: u.username,
                role: u.role,
                active: Boolean(u.active),
                createdAt: u.created_at,
                lastLogin: u.last_login
            }))
        });
    });
    /**
     * PATCH /auth/users/:id/role
     * Update user role (admin only)
     */
    router.patch('/users/:id/role', authenticate, authorize('admin'), async (req, res) => {
        try {
            const userId = parseInt(req.params.id);
            const { role } = req.body;
            if (!role) {
                return res.status(400).json({
                    success: false,
                    error: 'Role is required'
                });
            }
            authService.updateUserRole(userId, role);
            res.json({
                success: true,
                message: 'User role updated'
            });
        }
        catch (error) {
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    });
    /**
     * PATCH /auth/users/:id/active
     * Enable/disable user (admin only)
     */
    router.patch('/users/:id/active', authenticate, authorize('admin'), async (req, res) => {
        try {
            const userId = parseInt(req.params.id);
            const { active } = req.body;
            if (typeof active !== 'boolean') {
                return res.status(400).json({
                    success: false,
                    error: 'Active must be a boolean'
                });
            }
            authService.setUserActive(userId, active);
            res.json({
                success: true,
                message: `User ${active ? 'enabled' : 'disabled'}`
            });
        }
        catch (error) {
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    });
    /**
     * DELETE /auth/users/:id
     * Delete user (admin only)
     */
    router.delete('/users/:id', authenticate, authorize('admin'), async (req, res) => {
        try {
            const userId = parseInt(req.params.id);
            // Prevent deleting yourself
            if (userId === req.user.id) {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot delete your own account'
                });
            }
            authService.deleteUser(userId);
            res.json({
                success: true,
                message: 'User deleted'
            });
        }
        catch (error) {
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    });
    return router;
}
//# sourceMappingURL=auth.js.map