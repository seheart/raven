# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.6.x   | :white_check_mark: |
| 1.5.x   | :white_check_mark: |
| < 1.5   | :x:                |

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them responsibly using one of these methods:

### Preferred Method: GitHub Security Advisories
1. Go to https://github.com/seheart/raven/security/advisories/new
2. Fill out the form with details about the vulnerability
3. Submit the advisory

### Alternative Method: Email
Send an email to `security@raven-monitor.dev` with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested fix (if you have one)
- Your contact information (if you want updates)

## What to Expect

- **Initial Response**: Within 48 hours
- **Status Updates**: Every 7 days until resolved
- **Fix Timeline**: We aim to patch critical vulnerabilities within 7 days
- **Public Disclosure**: After fix is released + 7 days (or 90 days, whichever is sooner)
- **Credit**: We'll credit you in our security acknowledgments (unless you prefer anonymity)

## Security Measures in Raven

Raven implements multiple security layers:

### Authentication & Authorization
- JWT-based authentication with bcrypt password hashing
- Session management with secure tokens
- Role-based access control (planned for v2.0)

### Input Validation
- All API inputs validated with Joi schemas
- SQL injection prevention via prepared statements
- XSS prevention via DOMPurify in frontend

### Network Security
- HTTPS enforcement in production
- CORS configuration
- Rate limiting (100 req/15min general, 10 req/15min expensive ops)
- Helmet.js security headers

### Data Protection
- Local-first architecture (no cloud data leakage)
- File permissions validated
- Sensitive data never logged
- JWT secrets auto-generated and stored securely

### Monitoring & Response
- Comprehensive error logging
- Security event monitoring
- Automated dependency scanning (Dependabot)
- Pre-commit hooks to prevent credential leaks

## Security Best Practices for Users

### Installation
```bash
# Always verify checksums
sha256sum raven-*.tar.gz

# Use latest version
git pull origin main
npm install
```

### Configuration
```bash
# Generate strong JWT secret (done automatically)
# But you can regenerate:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Set proper file permissions
chmod 700 .raven/
chmod 600 .raven/config.toml
chmod 600 .raven/.jwt-secret
```

### Production Deployment
```bash
# Use environment variables (never commit secrets)
export JWT_SECRET="$(cat .raven/.jwt-secret)"
export NODE_ENV=production

# Enable rate limiting
export ENABLE_RATE_LIMITING=true

# Disable authentication only in trusted environments
# export DISABLE_AUTH=true  # NOT RECOMMENDED
```

## Known Security Considerations

### Local-First Architecture
- Raven runs locally and stores all data on your machine
- If someone gains access to your machine, they can access Raven data
- Use disk encryption and secure your machine accordingly

### File System Access
- Raven needs read/write access to monitored projects
- Raven snapshots may contain sensitive code
- Ensure `.raven/` directory has proper permissions

### Network Access
- Raven binds to localhost:3030 by default
- If you expose it externally, use authentication
- Use reverse proxy with HTTPS in production

## Security Audit History

| Date       | Auditor | Scope          | Findings | Status  |
|------------|---------|----------------|----------|---------|
| 2024-10-30 | Internal| Code Quality   | 8 minor  | Fixed   |
| TBD        | TBD     | Penetration Test | TBD    | Planned |

## Compliance

Raven aims to comply with:
- OWASP Top 10 (2021)
- CWE Top 25
- Node.js Security Best Practices
- GDPR (local-first design)

## Security Contact

- Security Team: security@raven-monitor.dev
- Project Lead: Seth Eheart
- GitHub Security: https://github.com/seheart/raven/security

## Responsible Disclosure Program

We believe in responsible disclosure and will work with security researchers to:
1. Validate reported vulnerabilities
2. Develop and test fixes
3. Release patches quickly
4. Provide attribution to researchers
5. Maintain transparency with users

Thank you for helping keep Raven secure!
