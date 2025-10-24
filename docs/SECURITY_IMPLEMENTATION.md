# Raven Security Implementation Guide

**Version:** 0.11.0
**Last Updated:** 2025-01-24
**Status:** ✅ Implemented

This document explains the new security features added to Raven v0.11.0 and how to use them.

## 🚀 Quick Start

### Enable Security Features

1. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Set environment variables:**
   ```bash
   export JWT_SECRET=$(openssl rand -base64 64)
   export ADMIN_PASSWORD="your-secure-password"
   export NODE_ENV=production
   ```

3. **Start Raven:**
   ```bash
   npm start
   ```

4. **Login:**
   - Username: `admin`
   - Password: (value of `ADMIN_PASSWORD`)

---

## 📋 What's New

### ✅ Implemented Features

1. **JWT Authentication** - Secure token-based authentication
2. **Input Validation** - Joi schemas for all API endpoints
3. **Security Headers** - Helmet middleware with CSP
4. **Rate Limiting** - Protection against abuse
5. **File Path Sanitization** - Prevention of directory traversal
6. **User Management** - Role-based access control (RBAC)
7. **Comprehensive Testing** - Jest test suite for security features

---

## 🔐 Authentication System

### Architecture

```
┌─────────────┐     JWT Token      ┌─────────────┐
│   Client    │ ─────────────────> │   Backend   │
│  (Browser)  │ <───────────────── │   (Express) │
└─────────────┘                     └─────────────┘
                                           │
                                           v
                                    ┌──────────────┐
                                    │   Database   │
                                    │   (SQLite)   │
                                    └──────────────┘
```

### Files Created

```
backend/
├── middleware/
│   ├── auth.js           # JWT authentication middleware
│   ├── validation.js     # Input validation schemas
│   └── security.js       # Security middleware (helmet, rate limit)
├── services/
│   └── auth-service.js   # User management service
├── routes/
│   └── auth.js           # Authentication routes
└── __tests__/
    ├── auth-service.test.js    # Auth service tests
    └── validation.test.js      # Validation tests
```

### User Roles

| Role | Permissions |
|------|-------------|
| **admin** | Full access, can manage users |
| **user** | Standard monitoring access |
| **viewer** | Read-only access |

### Default Admin Account

On first startup, a default admin is created:
- **Username:** `admin`
- **Password:** Value of `ADMIN_PASSWORD` env var (or `admin` if not set)

**⚠️ SECURITY WARNING:** Change this password immediately after first login!

---

## 🛡️ Security Middleware

### 1. Helmet (Security Headers)

Protects against common web vulnerabilities:

```javascript
// Automatically applied to all routes
import { setupHelmet } from './middleware/security.js';
app.use(setupHelmet());
```

**Headers added:**
- Content-Security-Policy
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Strict-Transport-Security

### 2. Rate Limiting

Prevents abuse and brute force attacks:

| Limiter | Limit | Window | Applied To |
|---------|-------|--------|------------|
| **API Limiter** | 100 req | 15 min | All API routes |
| **Auth Limiter** | 5 req | 15 min | Login endpoint |
| **Telemetry Limiter** | 1000 req | 1 min | Telemetry endpoint |
| **Write Limiter** | 50 req | 15 min | Create/Update/Delete ops |

### 3. Input Validation

All inputs validated with Joi schemas:

```javascript
import { validate } from './middleware/validation.js';

// Example: Validate login request
router.post('/login', validate('login'), async (req, res) => {
  // req.body is now validated and sanitized
});
```

**Validation includes:**
- Type checking
- Length limits
- Pattern matching
- Sanitization (XSS prevention)
- File path traversal prevention

---

## 🔧 Environment Variables

### Required for Production

```bash
# JWT Secret (CRITICAL - use strong random string)
JWT_SECRET=your-super-secret-jwt-key-min-32-chars

# Admin Password (for initial setup)
ADMIN_PASSWORD=your-secure-admin-password

# Environment
NODE_ENV=production

# CORS Origins (comma-separated)
CORS_ORIGIN=https://yourdomain.com
```

### Optional Configuration

```bash
# JWT Token Expiration (default: 24h)
JWT_EXPIRES_IN=24h

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes in ms
RATE_LIMIT_MAX=100            # Max requests per window

# Request Size Limits
JSON_PAYLOAD_LIMIT=10mb

# Snapshot Retention
SNAPSHOT_TTL_DAYS=30

# Disable Auth (DEV ONLY - NOT for production)
DISABLE_AUTH=false
```

---

## 📡 API Usage

### Authentication Flow

#### 1. Login

```bash
POST /auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your-password"
}

Response:
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

#### 2. Use Token in Requests

```bash
GET /api/events
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

#### 3. WebSocket Authentication

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3030', {
  auth: {
    token: 'eyJhbGciOiJIUzI1NiIs...'
  }
});
```

### Frontend Integration

```javascript
// auth-service.js
class AuthService {
  async login(username, password) {
    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();
    if (data.success) {
      localStorage.setItem('auth_token', data.token);
      return data;
    }
    throw new Error(data.error);
  }

  getToken() {
    return localStorage.getItem('auth_token');
  }

  logout() {
    localStorage.removeItem('auth_token');
  }
}

// api-client.js
async function apiRequest(url, options = {}) {
  const token = authService.getToken();

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });

  if (response.status === 401) {
    authService.logout();
    window.location.href = '/login';
  }

  return response;
}
```

---

## 🧪 Testing

### Running Tests

```bash
cd backend
npm test                  # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report
```

### Test Coverage

Current coverage:
- **Auth Service:** 95%+
- **Validation:** 90%+
- **Middleware:** 85%+

### Example Test

```javascript
import { AuthService } from '../services/auth-service.js';

describe('AuthService', () => {
  it('should authenticate valid credentials', async () => {
    const result = await authService.authenticate('admin', 'password');
    expect(result).toHaveProperty('token');
    expect(result.user.username).toBe('admin');
  });

  it('should reject invalid password', async () => {
    await expect(
      authService.authenticate('admin', 'wrong')
    ).rejects.toThrow('Invalid username or password');
  });
});
```

---

## 🔄 Migration Guide

### From v0.10.x to v0.11.0

#### Step 1: Update Dependencies

```bash
cd backend
npm install
```

#### Step 2: Backwards Compatible Mode (Temporary)

To test without breaking existing setup:

```bash
export DISABLE_AUTH=true
npm start
```

**⚠️ WARNING:** Only use in development! Never in production!

#### Step 3: Configure Security

```bash
# Generate strong JWT secret
export JWT_SECRET=$(openssl rand -base64 64)

# Set admin password
export ADMIN_PASSWORD="your-secure-password"

# Enable auth
unset DISABLE_AUTH

# Restart
npm start
```

#### Step 4: Update Frontend

Add authentication UI and update API client (see [Frontend Integration](#frontend-integration)).

#### Step 5: Test

1. Login with admin credentials
2. Test API access with token
3. Test WebSocket connection
4. Change admin password

---

## 🎯 Security Best Practices

### For Development

1. **Use .env file for secrets**
   ```bash
   # .env
   JWT_SECRET=dev-secret-change-in-production
   ADMIN_PASSWORD=admin
   DISABLE_AUTH=true
   ```

2. **Never commit secrets**
   ```bash
   echo ".env" >> .gitignore
   ```

3. **Test authentication flows**
   ```bash
   npm test
   ```

### For Production

1. **Generate strong JWT secret**
   ```bash
   openssl rand -base64 64
   ```

2. **Use HTTPS only**
   - Configure nginx/Apache reverse proxy
   - Obtain SSL certificate (Let's Encrypt)

3. **Set secure CORS**
   ```bash
   export CORS_ORIGIN=https://yourdomain.com
   ```

4. **Enable all security features**
   ```bash
   unset DISABLE_AUTH  # Ensure auth is enabled
   export NODE_ENV=production
   ```

5. **Monitor and log**
   - Check error logs daily
   - Monitor failed login attempts
   - Set up alerting for suspicious activity

6. **Regular updates**
   ```bash
   npm audit
   npm update
   ```

7. **Backup regularly**
   ```bash
   # Backup database
   cp .raven/db/raven.db .raven/db/backups/raven-$(date +%Y%m%d).db
   ```

---

## 🐛 Troubleshooting

### Common Issues

#### "Invalid or expired token"

**Cause:** Token has expired or is malformed.

**Solution:**
```javascript
// Login again to get new token
const { token } = await authService.login(username, password);
```

#### "Too many requests"

**Cause:** Rate limit exceeded.

**Solution:**
- Wait 15 minutes, or
- Increase rate limit:
  ```bash
  export RATE_LIMIT_MAX=200
  ```

#### "Authentication required"

**Cause:** Missing or invalid Authorization header.

**Solution:**
```javascript
// Ensure token is included
headers: {
  'Authorization': `Bearer ${token}`
}
```

#### WebSocket connection fails

**Cause:** Token not passed in handshake.

**Solution:**
```javascript
const socket = io(url, {
  auth: { token: yourToken }  // ← Add this
});
```

#### Cannot login with default credentials

**Cause:** `ADMIN_PASSWORD` not set or wrong.

**Solution:**
```bash
# Check what password was used
echo $ADMIN_PASSWORD

# Reset if needed
export ADMIN_PASSWORD="newpassword"
# Restart server
```

---

## 📊 Security Checklist

### Pre-Deployment

- [ ] Generated strong `JWT_SECRET` (64+ random bytes)
- [ ] Set secure `ADMIN_PASSWORD`
- [ ] Configured `CORS_ORIGIN` to production domain
- [ ] Set `NODE_ENV=production`
- [ ] Disabled `DISABLE_AUTH` (must be `false` or unset)
- [ ] Configured HTTPS (reverse proxy)
- [ ] Tested authentication flow
- [ ] Tested rate limiting
- [ ] Reviewed all environment variables
- [ ] Set up database backups

### Post-Deployment

- [ ] Changed default admin password
- [ ] Created additional user accounts
- [ ] Verified all APIs require authentication
- [ ] Tested WebSocket authentication
- [ ] Configured monitoring/alerting
- [ ] Reviewed security logs
- [ ] Documented access procedures
- [ ] Set up regular security updates

---

## 📚 API Reference

### Authentication Endpoints

```
POST   /auth/login                    # Login, get JWT token
POST   /auth/register                 # Create user (admin only)
POST   /auth/change-password          # Change own password
GET    /auth/me                       # Get current user info
GET    /auth/users                    # List users (admin only)
PATCH  /auth/users/:id/role           # Update user role (admin)
PATCH  /auth/users/:id/active         # Enable/disable user (admin)
DELETE /auth/users/:id                # Delete user (admin)
```

### Protected Endpoints

All `/api/*` endpoints now require authentication:

```
GET    /api/events                    # Get events
GET    /api/agents                    # Get agents
POST   /api/telemetry                 # Send telemetry
GET    /api/storage                   # Storage info
...
```

---

## 🔍 Validation Schemas

Available validation schemas:

- `login` - Username and password
- `register` - User registration
- `changePassword` - Password change
- `filePath` - File path (with sanitization)
- `fileContent` - File content
- `eventQuery` - Event filtering
- `errorLog` - Error logging
- `errorQuery` - Error filtering
- `notificationQuery` - Notification filtering
- `createNotification` - Create notification
- `storageCleanup` - Storage cleanup options
- `syncConfig` - Sync configuration
- `telemetry` - Telemetry data
- `pagination` - Pagination parameters
- `id` - ID parameter

---

## 💡 Examples

### Complete Authentication Flow

```javascript
// 1. Login
const loginResponse = await fetch('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'admin',
    password: 'secure-password'
  })
});

const { token, user } = await loginResponse.json();

// 2. Store token
localStorage.setItem('token', token);

// 3. Use in subsequent requests
const eventsResponse = await fetch('/api/events?limit=50', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const events = await eventsResponse.json();

// 4. Connect WebSocket
const socket = io('http://localhost:3030', {
  auth: { token }
});

socket.on('connect', () => {
  console.log('Connected with authentication');
});

// 5. Handle token expiration
socket.on('connect_error', (error) => {
  if (error.message === 'Authentication required') {
    // Token expired, redirect to login
    window.location.href = '/login';
  }
});
```

### User Management

```javascript
// Create new user (admin only)
const createResponse = await fetch('/auth/register', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    username: 'newuser',
    password: 'securepass123',
    role: 'user'
  })
});

// List all users
const usersResponse = await fetch('/auth/users', {
  headers: { 'Authorization': `Bearer ${adminToken}` }
});

const { users } = await usersResponse.json();

// Update user role
await fetch('/auth/users/2/role', {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ role: 'admin' })
});

// Disable user
await fetch('/auth/users/2/active', {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ active: false })
});
```

---

## 🆘 Support

### Getting Help

1. **Documentation:** Check this guide and `/docs/SECURITY.md`
2. **Tests:** Review test files for usage examples
3. **Issues:** Report bugs on GitHub
4. **Email:** security@yourdomain.com (for security issues only)

### Security Issues

**DO NOT create public GitHub issues for security vulnerabilities!**

Report privately via:
- GitHub Security Advisories
- Email: security@yourdomain.com

---

## 📈 Roadmap

### Completed (v0.11.0)

- ✅ JWT authentication
- ✅ Input validation (Joi)
- ✅ Security headers (Helmet)
- ✅ Rate limiting
- ✅ File path sanitization
- ✅ User management
- ✅ Comprehensive tests

### Planned (v0.12.0+)

- [ ] OAuth2/OIDC integration
- [ ] Multi-factor authentication (MFA)
- [ ] API key authentication
- [ ] Audit log (track all user actions)
- [ ] Session management UI
- [ ] Password reset flow
- [ ] Email notifications
- [ ] RBAC permission system (granular)

---

**Last Updated:** 2025-01-24
**Version:** 0.11.0
**Author:** Raven Security Team
