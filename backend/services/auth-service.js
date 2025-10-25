/**
 * Authentication Service for Raven
 * Manages user accounts and authentication
 */

import bcrypt from 'bcrypt';
import { generateToken } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const SALT_ROUNDS = 10;

export class AuthService {
  constructor(db) {
    this.db = db;
    this.initializeSchema();
  }

  /**
   * Initialize users table
   */
  initializeSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at TEXT NOT NULL,
        last_login TEXT,
        active INTEGER DEFAULT 1
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);
    `);

    // Create default admin user if no users exist
    const userCount = this.db.prepare('SELECT COUNT(*) as count FROM users').get();
    if (userCount.count === 0) {
      this.createDefaultAdmin();
    }
  }

  /**
   * Create default admin user
   */
  async createDefaultAdmin() {
    const defaultPassword = process.env.ADMIN_PASSWORD || 'admin123';
    logger.warn('Creating default admin user - CHANGE PASSWORD IMMEDIATELY!', {
      username: 'admin',
      password: defaultPassword
    });

    await this.createUser('admin', defaultPassword, 'admin');
  }

  /**
   * Create a new user
   */
  async createUser(username, password, role = 'user') {
    // Validate username
    if (!username || username.length < 3) {
      throw new Error('Username must be at least 3 characters');
    }

    // Validate password
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    // Check if user already exists
    const existing = this.db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      throw new Error('Username already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Insert user
    const stmt = this.db.prepare(`
      INSERT INTO users (username, password_hash, role, created_at)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      username,
      passwordHash,
      role,
      new Date().toISOString()
    );

    return result.lastInsertRowid;
  }

  /**
   * Authenticate user with username and password
   */
  async authenticate(username, password) {
    const user = this.db.prepare(`
      SELECT id, username, password_hash, role, active
      FROM users
      WHERE username = ?
    `).get(username);

    if (!user) {
      throw new Error('Invalid username or password');
    }

    if (!user.active) {
      throw new Error('Account is disabled');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new Error('Invalid username or password');
    }

    // Update last login
    this.db.prepare('UPDATE users SET last_login = ? WHERE id = ?')
      .run(new Date().toISOString(), user.id);

    // Generate token
    const token = generateToken(user);

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    };
  }

  /**
   * Change user password
   */
  async changePassword(userId, oldPassword, newPassword) {
    const user = this.db.prepare(`
      SELECT id, password_hash
      FROM users
      WHERE id = ?
    `).get(userId);

    if (!user) {
      throw new Error('User not found');
    }

    const valid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!valid) {
      throw new Error('Invalid current password');
    }

    if (!newPassword || newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters');
    }

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(newHash, userId);

    return true;
  }

  /**
   * Get user by ID
   */
  getUserById(id) {
    return this.db.prepare(`
      SELECT id, username, role, created_at, last_login, active
      FROM users
      WHERE id = ?
    `).get(id);
  }

  /**
   * Get all users
   * @param {number} limit - Maximum number of users to return (default: 100)
   */
  getAllUsers(limit = 100) {
    return this.db.prepare(`
      SELECT id, username, role, created_at, last_login, active
      FROM users
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Update user role
   */
  updateUserRole(userId, newRole) {
    const validRoles = ['admin', 'user', 'viewer'];
    if (!validRoles.includes(newRole)) {
      throw new Error('Invalid role');
    }

    this.db.prepare('UPDATE users SET role = ? WHERE id = ?')
      .run(newRole, userId);

    return true;
  }

  /**
   * Disable/Enable user account
   */
  setUserActive(userId, active) {
    this.db.prepare('UPDATE users SET active = ? WHERE id = ?')
      .run(active ? 1 : 0, userId);

    return true;
  }

  /**
   * Delete user
   */
  deleteUser(userId) {
    // Prevent deleting last admin
    const adminCount = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM users
      WHERE role = 'admin' AND active = 1
    `).get();

    const user = this.getUserById(userId);
    if (user.role === 'admin' && adminCount.count <= 1) {
      throw new Error('Cannot delete the last admin user');
    }

    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    return true;
  }
}
