# Raven Authentication

Raven includes a complete JWT-based authentication system for production deployments.

## Current Status

**Authentication is DISABLED by default** for local development convenience.

## How to Enable Authentication

### Option 1: Using start.sh

Edit `start.sh` and comment out this line:

```bash
export DISABLE_AUTH=true
```

Then restart:

```bash
./restart.sh
```

### Option 2: Environment Variable

```bash
# Start with auth enabled
./stop.sh
cd backend
npm start  # Auth enabled by default
```

### Option 3: Using .env File

Create `backend/.env`:

```
# Uncomment to disable authentication
# DISABLE_AUTH=true

# Custom admin password (optional)
# ADMIN_PASSWORD=your-secure-password-here

# JWT secret (optional, auto-generated if not set)
# JWT_SECRET=your-secret-key-here
```

## Default Credentials

When authentication is enabled, use these credentials:

- **Username:** `admin`
- **Password:** `admin123`

⚠️ **IMPORTANT:** Change the default password immediately after first login!

## Features

### ✅ Backend Security

- JWT token-based authentication
- Role-based access control (Admin, User, Viewer)
- bcrypt password hashing
- Input validation on all endpoints
- Rate limiting (100 req/15min for API, 5 req/15min for auth)
- Security headers (Helmet)
- CORS protection
- SQL injection prevention

### ✅ Frontend Integration

- Beautiful login page
- Automatic token management
- Session persistence (localStorage)
- Auto-logout on token expiration
- User menu with role badge
- Token verification on app startup

### ✅ Test Coverage

- 74 tests (100% passing)
- 72% code coverage
- Unit tests for auth service
- Integration tests for all auth endpoints
- Validation tests for all schemas

## API Endpoints

### Authentication Endpoints

```
POST   /auth/login              - Login with username/password
POST   /auth/register           - Create new user (admin only)
POST   /auth/change-password    - Change your password
GET    /auth/me                 - Get current user info
GET    /auth/users              - List all users (admin only)
PATCH  /auth/users/:id/role     - Update user role (admin only)
PATCH  /auth/users/:id/active   - Enable/disable user (admin only)
DELETE /auth/users/:id          - Delete user (admin only)
```

### Protected API Endpoints

All `/api/*` endpoints require authentication when `DISABLE_AUTH` is not set.

Add JWT token to Authorization header:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3030/api/dashboard-stats
```

## User Roles

### Admin
- Full access to all features
- Can manage users
- Can change system settings

### User
- Can view all data
- Can trigger actions
- Cannot manage users

### Viewer
- Read-only access
- Cannot trigger actions
- Cannot manage users

## Security Best Practices

### For Development

1. Keep `DISABLE_AUTH=true` for local work
2. Test with authentication before deploying

### For Production

1. **Enable authentication** (remove `DISABLE_AUTH=true`)
2. **Change default password** immediately
3. **Set custom JWT_SECRET** environment variable
4. **Use HTTPS** in production
5. **Review rate limits** for your traffic
6. **Regularly update** dependencies

## Troubleshooting

### "No data showing after enabling auth"

1. Clear browser localStorage:
   ```javascript
   localStorage.clear()
   ```
2. Refresh the page
3. Login with `admin` / `admin123`

### "Session expired" errors

1. Token lifetime is 24 hours
2. Login again to get new token
3. Check system clock (time sync)

### "Too many requests" (429 error)

Rate limiter triggered. Wait 15 minutes or restart backend:
```bash
./restart.sh
```

### "Invalid token" errors

1. Backend restarted (JWT secret changed)
2. Token expired
3. Token manually edited

**Solution:** Logout and login again

## Development Workflow

### Recommended Setup

```bash
# 1. Start with auth disabled (default)
./start.sh

# 2. Develop and test features

# 3. Before committing, test with auth enabled
./stop.sh
cd backend && npm start  # Auth enabled
cd ../frontend && npm run dev

# 4. Test login flow and protected endpoints

# 5. Run tests
cd backend && npm test
```

## Architecture

### Backend (Node.js + Express)

```
backend/
├── middleware/
│   ├── auth.js           - JWT verification
│   ├── validation.js     - Input validation
│   └── security.js       - Rate limiting, headers
├── services/
│   └── auth-service.js   - User management
├── routes/
│   └── auth.js           - Auth endpoints
└── __tests__/
    ├── auth-service.test.js
    ├── auth-routes.test.js
    └── validation.test.js
```

### Frontend (Svelte)

```
frontend/src/lib/
├── authStore.js          - JWT state management
├── LoginPage.svelte      - Login interface
├── UserMenu.svelte       - User dropdown
└── apiClient.js          - Automatic JWT headers
```

## Performance

- **Token size:** ~200 bytes
- **Login time:** ~50-100ms
- **Auth check:** <1ms (cached)
- **Rate limits:** Minimal overhead

## Version History

- **v0.11.0** - Full authentication system
- **v0.10.0** - Base Raven functionality

---

**Questions?** Check the logs:
- Backend: `tail -f /tmp/raven-backend.log`
- Frontend: `tail -f /tmp/raven-frontend.log`
