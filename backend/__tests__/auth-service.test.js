/**
 * Authentication Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { AuthService } from '../services/auth-service.js';
import { unlink } from 'fs/promises';

describe('AuthService', () => {
  let db;
  let authService;
  const testDbPath = './__tests__/test-auth.db';

  beforeEach(async () => {
    db = new Database(testDbPath);
    authService = new AuthService(db);
    // Wait for async initialization to complete
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    // Give any pending operations time to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    if (db && db.open) {
      db.close();
    }

    try {
      await unlink(testDbPath);
    } catch (_error) {
      // Ignore errors if file doesn't exist
    }
  });

  describe('User Creation', () => {
    it('should create a new user successfully', async () => {
      const userId = await authService.createUser('testuser', 'password123', 'user');
      expect(userId).toBeGreaterThan(0);

      const user = authService.getUserById(userId);
      expect(user.username).toBe('testuser');
      expect(user.role).toBe('user');
    });

    it('should reject username shorter than 3 characters', async () => {
      await expect(
        authService.createUser('ab', 'password123')
      ).rejects.toThrow('Username must be at least 3 characters');
    });

    it('should reject password shorter than 8 characters', async () => {
      await expect(
        authService.createUser('testuser', 'pass')
      ).rejects.toThrow('Password must be at least 8 characters');
    });

    it('should reject duplicate usernames', async () => {
      await authService.createUser('testuser', 'password123');

      await expect(
        authService.createUser('testuser', 'password456')
      ).rejects.toThrow('Username already exists');
    });

    it('should hash passwords correctly', async () => {
      const userId = await authService.createUser('testuser', 'password123');
      const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);

      // Hash should not match plain password
      expect(user.password_hash).not.toBe('password123');
      expect(user.password_hash.length).toBeGreaterThan(50);
    });
  });

  describe('Authentication', () => {
    beforeEach(async () => {
      await authService.createUser('testuser', 'password123', 'user');
    });

    it('should authenticate valid credentials', async () => {
      const result = await authService.authenticate('testuser', 'password123');

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('user');
      expect(result.user.username).toBe('testuser');
      expect(result.user.role).toBe('user');
    });

    it('should reject invalid username', async () => {
      await expect(
        authService.authenticate('wronguser', 'password123')
      ).rejects.toThrow('Invalid username or password');
    });

    it('should reject invalid password', async () => {
      await expect(
        authService.authenticate('testuser', 'wrongpassword')
      ).rejects.toThrow('Invalid username or password');
    });

    it('should update last login timestamp', async () => {
      // Get the testuser (should be id 2, after the default admin)
      const allUsers = authService.getAllUsers();
      const testUser = allUsers.find(u => u.username === 'testuser');

      expect(testUser).toBeDefined();
      expect(testUser.last_login).toBeNull();

      await authService.authenticate('testuser', 'password123');

      const userAfter = authService.getUserById(testUser.id);
      expect(userAfter.last_login).not.toBeNull();
    });

    it('should reject disabled accounts', async () => {
      // Get testuser and disable it
      const allUsers = authService.getAllUsers();
      const testUser = allUsers.find(u => u.username === 'testuser');

      authService.setUserActive(testUser.id, false);

      await expect(
        authService.authenticate('testuser', 'password123')
      ).rejects.toThrow('Account is disabled');
    });
  });

  describe('Password Management', () => {
    let userId;

    beforeEach(async () => {
      userId = await authService.createUser('testuser', 'password123');
    });

    it('should change password successfully', async () => {
      await authService.changePassword(userId, 'password123', 'newpassword123');

      // Should authenticate with new password
      const result = await authService.authenticate('testuser', 'newpassword123');
      expect(result).toHaveProperty('token');
    });

    it('should reject wrong old password', async () => {
      await expect(
        authService.changePassword(userId, 'wrongpassword', 'newpassword123')
      ).rejects.toThrow('Invalid current password');
    });

    it('should reject weak new password', async () => {
      await expect(
        authService.changePassword(userId, 'password123', 'weak')
      ).rejects.toThrow('New password must be at least 8 characters');
    });
  });

  describe('User Management', () => {
    it('should get all users', async () => {
      await authService.createUser('user1', 'password123');
      await authService.createUser('user2', 'password456');

      const users = authService.getAllUsers();
      expect(users.length).toBeGreaterThanOrEqual(2);
    });

    it('should update user role', async () => {
      const userId = await authService.createUser('testuser', 'password123', 'user');

      authService.updateUserRole(userId, 'admin');

      const user = authService.getUserById(userId);
      expect(user.role).toBe('admin');
    });

    it('should reject invalid roles', () => {
      expect(() => {
        authService.updateUserRole(1, 'invalid');
      }).toThrow('Invalid role');
    });

    it('should disable user account', async () => {
      const userId = await authService.createUser('testuser', 'password123');

      authService.setUserActive(userId, false);

      const user = authService.getUserById(userId);
      expect(user.active).toBe(0);
    });

    it('should enable user account', async () => {
      const userId = await authService.createUser('testuser', 'password123');
      authService.setUserActive(userId, false);

      authService.setUserActive(userId, true);

      const user = authService.getUserById(userId);
      expect(user.active).toBe(1);
    });

    it('should delete user', async () => {
      // Create a non-admin user
      const userId = await authService.createUser('testuser', 'password123', 'user');

      authService.deleteUser(userId);

      const user = authService.getUserById(userId);
      expect(user).toBeUndefined();
    });

    it('should prevent deleting last admin', async () => {
      // The default admin is created automatically
      const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();

      if (admins.length === 1) {
        expect(() => {
          authService.deleteUser(admins[0].id);
        }).toThrow('Cannot delete the last admin user');
      }
    });
  });

  describe('Token Generation', () => {
    it('should generate valid JWT token', async () => {
      // eslint-disable-next-line no-unused-vars
      const userId = await authService.createUser('testuser', 'password123');
      const result = await authService.authenticate('testuser', 'password123');

      expect(result.token).toBeTruthy();
      expect(typeof result.token).toBe('string');
      expect(result.token.split('.')).toHaveLength(3); // JWT has 3 parts
    });
  });
});
