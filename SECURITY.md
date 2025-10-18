# Security Policy

## Supported Versions

We actively support the following versions of Raven with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.6.x   | :white_check_mark: |
| < 0.6   | :x:                |

## Reporting a Vulnerability

**IMPORTANT: DO NOT create a public GitHub issue for security vulnerabilities.**

### How to Report

We take security seriously. If you discover a security vulnerability, please report it via:

1. **GitHub Security Advisories** (Preferred)
   - Go to https://github.com/seheart/raven3/security/advisories
   - Click "Report a vulnerability"
   - Fill out the form with details

2. **Email** (Alternative)
   - Send to: seheart@gmail.com
   - Use subject: `[SECURITY] Raven Vulnerability Report`
   - Include details below

### What to Include

Please include as much information as possible:

- Type of vulnerability (e.g., SQL injection, XSS, authentication bypass)
- Full paths of source file(s) related to the vulnerability
- Location of the affected source code (tag/branch/commit)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the vulnerability (what an attacker could do)

### Response Timeline

- **Initial Response:** Within 48 hours
- **Status Update:** Within 7 days
- **Fix Timeline:** Depends on severity
  - Critical: Within 7 days
  - High: Within 14 days
  - Medium: Within 30 days
  - Low: Next scheduled release

### Disclosure Policy

- Security issues will be patched privately
- We'll create a security advisory once a fix is released
- We'll credit the reporter (unless they prefer to remain anonymous)
- We follow responsible disclosure practices

## Security Best Practices

### For Contributors

1. **Dependencies**
   - Run `npm audit` before submitting PRs
   - Keep dependencies up to date
   - Review Dependabot PRs promptly

2. **Code Review**
   - All code must be reviewed before merging
   - Look for common vulnerabilities (XSS, injection, etc.)
   - Check for hardcoded secrets or credentials

3. **Secrets Management**
   - NEVER commit API keys, passwords, or tokens
   - Use environment variables for sensitive data
   - Add sensitive files to `.gitignore`

4. **Authentication & Authorization**
   - Validate all user input
   - Use parameterized queries for database operations
   - Implement proper error handling

### For Deployments

1. **Environment Security**
   - Use HTTPS in production
   - Set secure HTTP headers
   - Keep Node.js and npm up to date

2. **Database Security**
   - Restrict database file permissions (`chmod 600`)
   - Use WAL mode for SQLite (already enabled)
   - Back up database regularly

3. **Network Security**
   - Use firewall rules to restrict access
   - Only expose necessary ports (3030 for API)
   - Consider using reverse proxy (nginx) for SSL termination

4. **Monitoring**
   - Enable health check monitoring
   - Set up alerts for suspicious activity
   - Review logs regularly

## Security Features

### Current Security Measures

- ✅ **Input Validation:** All API endpoints validate input
- ✅ **CORS Protection:** Configurable CORS settings
- ✅ **Error Handling:** Errors don't leak sensitive information
- ✅ **Database Safety:** Prepared statements prevent SQL injection
- ✅ **Dependencies:** Automated security scanning via Dependabot
- ✅ **Code Analysis:** CodeQL static analysis (coming soon)

### Planned Security Enhancements

- [ ] Rate limiting on API endpoints
- [ ] Authentication/authorization layer
- [ ] Request logging and audit trail
- [ ] Encrypted backup support
- [ ] Security headers middleware
- [ ] Content Security Policy (CSP)

## Security Audit History

| Date | Type | Findings | Status |
|------|------|----------|--------|
| 2025-10-18 | Initial Assessment | Manual review, no issues found | ✅ Clean |

## Compliance

Raven is designed with security in mind but is not currently certified for any specific compliance standards (SOC 2, ISO 27001, etc.). If you have specific compliance requirements, please contact us to discuss.

## Contact

For security-related questions (non-vulnerabilities):
- GitHub Discussions: https://github.com/seheart/raven3/discussions
- Email: seheart@gmail.com

Thank you for helping keep Raven secure! 🔒
