# Raven Governance & Quality Assurance Plan

**Version:** 1.0
**Date:** 2025-10-18
**Purpose:** Establish world-class governance, security, testing, and developer experience

---

## 🎯 GOVERNANCE GOALS

1. **Security First** - Automated vulnerability scanning and security best practices
2. **Quality Assurance** - Comprehensive testing before every release
3. **Developer Experience** - Clear documentation and easy onboarding
4. **Community Ready** - Transparent governance and contribution process
5. **Operational Excellence** - Monitoring, alerts, and incident response

---

## 📊 CURRENT STATE ASSESSMENT

### ✅ What We Have
- [x] Basic documentation (ARCHITECTURE.md, DEPLOYMENT.md, FEATURES.md)
- [x] Some frontend tests (22 tests in EventFeed, MetricsPanel, keyboardService)
- [x] Git version control
- [x] Manual testing procedures (TEST_REPORT.md, FINAL_TEST_SUMMARY.md)
- [x] Basic .gitignore

### ❌ What We're Missing
- [ ] **Automated CI/CD pipeline**
- [ ] **Pre-commit hooks** for code quality
- [ ] **Backend tests** (0 tests currently)
- [ ] **End-to-end tests**
- [ ] **Security scanning** (dependency vulnerabilities)
- [ ] **Code coverage reporting**
- [ ] **Automated monitoring & alerts**
- [ ] **Contributing guidelines**
- [ ] **Issue/PR templates**
- [ ] **Code of Conduct**
- [ ] **Security policy**
- [ ] **Automated changelog**
- [ ] **API documentation** (Swagger/OpenAPI)
- [ ] **Branch protection rules**
- [ ] **Code review requirements**
- [ ] **Semantic versioning automation**

---

## 🚀 IMPLEMENTATION PLAN

### Phase 1: Testing Infrastructure (Week 1)

**Priority: CRITICAL**

#### 1.1 Backend Testing
**Goal:** Achieve 80%+ test coverage

**Setup:**
```bash
# Install testing dependencies
cd backend
npm install --save-dev vitest @vitest/coverage-v8 supertest
```

**Create test files:**
- `backend/tests/api.test.js` - REST endpoint tests
- `backend/tests/db.test.js` - Database operations
- `backend/tests/triggers.test.js` - Trigger engine
- `backend/tests/metrics.test.js` - Metrics collector
- `backend/tests/integration.test.js` - Full integration tests

**Test categories:**
- [ ] All 21 REST endpoints
- [ ] Database CRUD operations
- [ ] WebSocket events
- [ ] File watching logic
- [ ] Trigger evaluation
- [ ] Metrics collection
- [ ] Error handling

**Package.json scripts:**
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:integration": "vitest run --config vitest.integration.config.js"
  }
}
```

#### 1.2 End-to-End Testing
**Goal:** Test full user workflows

**Tools:** Playwright or Cypress

**Test scenarios:**
- [ ] User opens dashboard, sees real-time metrics
- [ ] File change triggers event and appears in feed
- [ ] Export JSON/CSV downloads correctly
- [ ] Agent telemetry appears in AgentsPanel
- [ ] Trigger fires and shows alert
- [ ] Session replay timeline works
- [ ] Time travel restore functionality

**Setup:**
```bash
cd frontend
npm install --save-dev @playwright/test
npx playwright install
```

#### 1.3 Pre-commit Hooks
**Goal:** Prevent bad code from being committed

**Install Husky:**
```bash
npm install --save-dev husky lint-staged
npx husky init
```

**Create `.husky/pre-commit`:**
```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Run linters
npm run lint
npm run format:check

# Run tests
npm test -- --run

# Security audit
npm audit --audit-level=moderate
```

**Configure lint-staged:**
```json
{
  "lint-staged": {
    "*.{js,jsx,svelte}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.md": [
      "prettier --write"
    ]
  }
}
```

---

### Phase 2: CI/CD Pipeline (Week 1)

**Priority: CRITICAL**

#### 2.1 GitHub Actions Workflows

**Create `.github/workflows/ci.yml`:**
```yaml
name: CI

on:
  push:
    branches: [ main, master, develop ]
  pull_request:
    branches: [ main, master ]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: cd backend && npm ci
      - name: Run tests
        run: cd backend && npm test
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./backend/coverage/coverage-final.json

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: cd frontend && npm ci
      - name: Run tests
        run: cd frontend && npm test
      - name: Build
        run: cd frontend && npm run build

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run npm audit
        run: |
          cd backend && npm audit --audit-level=moderate
          cd ../frontend && npm audit --audit-level=moderate
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          severity: 'CRITICAL,HIGH'

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - name: Run ESLint
        run: |
          cd backend && npm ci && npm run lint
          cd ../frontend && npm ci && npm run lint
```

**Create `.github/workflows/release.yml`:**
```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - name: Build frontend
        run: cd frontend && npm ci && npm run build
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          generate_release_notes: true
          files: |
            frontend/dist/**
```

#### 2.2 Dependabot Configuration

**Create `.github/dependabot.yml`:**
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/backend"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    reviewers:
      - "seheart"

  - package-ecosystem: "npm"
    directory: "/frontend"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    reviewers:
      - "seheart"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

---

### Phase 3: Security Hardening (Week 2)

**Priority: HIGH**

#### 3.1 Security Policy

**Create `SECURITY.md`:**
```markdown
# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.6.x   | :white_check_mark: |
| < 0.6   | :x:                |

## Reporting a Vulnerability

**DO NOT** create a public GitHub issue for security vulnerabilities.

Instead, report security issues to: security@yourproject.com (or create private security advisory on GitHub)

**Response Time:** We aim to respond within 48 hours.

## Security Best Practices

1. Keep dependencies updated
2. Run `npm audit` regularly
3. Review Dependabot PRs promptly
4. Enable 2FA on GitHub
5. Use environment variables for secrets
6. Never commit `.env` files
```

#### 3.2 Dependency Scanning

**Add to package.json:**
```json
{
  "scripts": {
    "audit": "npm audit --audit-level=moderate",
    "audit:fix": "npm audit fix",
    "audit:check": "npm audit --audit-level=moderate --json > audit-report.json"
  }
}
```

**Weekly automated scan** (already in CI/CD workflow above)

#### 3.3 SAST (Static Application Security Testing)

**Add CodeQL to `.github/workflows/codeql.yml`:**
```yaml
name: "CodeQL"

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
  schedule:
    - cron: '0 0 * * 1'  # Every Monday

jobs:
  analyze:
    name: Analyze
    runs-on: ubuntu-latest
    permissions:
      actions: read
      contents: read
      security-events: write

    steps:
    - name: Checkout repository
      uses: actions/checkout@v4

    - name: Initialize CodeQL
      uses: github/codeql-action/init@v2
      with:
        languages: javascript

    - name: Perform CodeQL Analysis
      uses: github/codeql-action/analyze@v2
```

---

### Phase 4: Monitoring & Alerts (Week 2)

**Priority: HIGH**

#### 4.1 Application Monitoring

**Option A: Self-hosted (Recommended for local)**

**Add health check monitoring:**

**Create `backend/monitoring/health-checker.js`:**
```javascript
import fetch from 'node-fetch';

const HEALTH_ENDPOINT = process.env.HEALTH_ENDPOINT || 'http://localhost:3030/health';
const ALERT_WEBHOOK = process.env.ALERT_WEBHOOK; // Slack, Discord, etc.

async function checkHealth() {
  try {
    const response = await fetch(HEALTH_ENDPOINT);
    const data = await response.json();

    if (response.ok && data.status === 'healthy') {
      console.log('✅ Health check passed');
      return true;
    } else {
      await sendAlert('⚠️ Health check failed: Unhealthy response');
      return false;
    }
  } catch (error) {
    await sendAlert(`❌ Health check failed: ${error.message}`);
    return false;
  }
}

async function sendAlert(message) {
  if (!ALERT_WEBHOOK) {
    console.error(message);
    return;
  }

  await fetch(ALERT_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message })
  });
}

// Run every 5 minutes
setInterval(checkHealth, 5 * 60 * 1000);
checkHealth();
```

**Option B: Cloud monitoring (for production)**

Services to consider:
- **UptimeRobot** - Free tier, 5-minute checks (already mentioned in docs)
- **Sentry** - Error tracking (frontend + backend)
- **Datadog** - Full observability (paid)
- **Prometheus + Grafana** - Self-hosted metrics

#### 4.2 Error Tracking

**Install Sentry (optional but recommended):**

```bash
npm install @sentry/node @sentry/browser
```

**Backend (`backend/server.js`):**
```javascript
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: 1.0,
});

// Error handler middleware
app.use(Sentry.Handlers.errorHandler());
```

**Frontend (`frontend/src/main.js`):**
```javascript
import * as Sentry from "@sentry/browser";

Sentry.init({
  dsn: process.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
});
```

#### 4.3 Log Aggregation

**Create `backend/logger.js`:**
```javascript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: '.raven/logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: '.raven/logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

export default logger;
```

---

### Phase 5: Documentation Hub (Week 3)

**Priority: MEDIUM**

#### 5.1 Developer Portal

**Create `docs/developers/README.md` - Developer Hub Index:**

```markdown
# Raven Developer Hub

## 🚀 Quick Start
- [Getting Started](GETTING_STARTED.md)
- [Development Setup](SETUP.md)
- [Contributing Guide](CONTRIBUTING.md)

## 📚 Documentation
- [Architecture](../ARCHITECTURE.md)
- [API Reference](API_REFERENCE.md)
- [Database Schema](DATABASE.md)
- [WebSocket Events](WEBSOCKET.md)

## 🧪 Testing
- [Testing Guide](TESTING.md)
- [Writing Tests](WRITING_TESTS.md)
- [CI/CD Pipeline](CI_CD.md)

## 🔐 Security
- [Security Policy](../../SECURITY.md)
- [Security Best Practices](SECURITY_BEST_PRACTICES.md)

## 🏗️ Architecture
- [Decision Records](adr/) - Architecture Decision Records
- [Design Patterns](DESIGN_PATTERNS.md)
- [Tech Stack](TECH_STACK.md)

## 🤝 Community
- [Code of Conduct](../../CODE_OF_CONDUCT.md)
- [Governance Model](GOVERNANCE.md)
- [Roadmap](../../ROADMAP.md)
```

#### 5.2 API Documentation

**Install Swagger/OpenAPI:**

```bash
cd backend
npm install swagger-jsdoc swagger-ui-express
```

**Create `backend/swagger.js`:**
```javascript
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Raven API',
      version: '0.6.1',
      description: 'AI Agent Monitoring API',
    },
    servers: [
      {
        url: 'http://localhost:3030',
        description: 'Development server',
      },
    ],
  },
  apis: ['./server.js', './routes/*.js'],
};

const specs = swaggerJsdoc(options);

export { specs, swaggerUi };
```

**Add to server.js:**
```javascript
import { specs, swaggerUi } from './swagger.js';

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
```

**Document endpoints with JSDoc:**
```javascript
/**
 * @swagger
 * /api/file-events:
 *   get:
 *     summary: Get file system events
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of events to return
 *       - in: query
 *         name: diff
 *         schema:
 *           type: boolean
 *         description: Include diff in response
 *     responses:
 *       200:
 *         description: Success
 */
app.get('/api/file-events', (req, res) => { ... });
```

#### 5.3 Contributing Guidelines

**Create `CONTRIBUTING.md`:**
```markdown
# Contributing to Raven

## How to Contribute

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Write tests** for your changes
4. **Run the test suite** (`npm test`)
5. **Commit your changes** using [Conventional Commits](https://www.conventionalcommits.org/)
6. **Push to your fork** (`git push origin feature/amazing-feature`)
7. **Open a Pull Request**

## Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, semicolons, etc.)
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance

**Examples:**
```
feat(api): add snapshot retrieval endpoint
fix(triggers): resolve placeholder formatting issue
docs(readme): update installation instructions
```

## Pull Request Process

1. Update documentation if needed
2. Add tests for new features
3. Ensure all tests pass
4. Update CHANGELOG.md
5. Request review from maintainers

## Code Review Checklist

- [ ] Code follows project style guide
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] No security vulnerabilities introduced
- [ ] Performance impact considered
```

#### 5.4 Issue & PR Templates

**Create `.github/ISSUE_TEMPLATE/bug_report.md`:**
```markdown
---
name: Bug Report
about: Report a bug in Raven
title: '[BUG] '
labels: bug
assignees: ''
---

**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. See error

**Expected behavior**
What you expected to happen.

**Screenshots**
If applicable, add screenshots.

**Environment:**
 - OS: [e.g., Ubuntu 22.04]
 - Node.js version: [e.g., 20.10.0]
 - Raven version: [e.g., 0.6.1]

**Additional context**
Add any other context about the problem.
```

**Create `.github/ISSUE_TEMPLATE/feature_request.md`:**
```markdown
---
name: Feature Request
about: Suggest an idea for Raven
title: '[FEATURE] '
labels: enhancement
assignees: ''
---

**Is your feature request related to a problem?**
A clear description of the problem.

**Describe the solution you'd like**
What you want to happen.

**Describe alternatives you've considered**
Other solutions you've thought about.

**Additional context**
Any other context or screenshots.
```

**Create `.github/PULL_REQUEST_TEMPLATE.md`:**
```markdown
## Description
Brief description of changes.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] All existing tests pass
- [ ] New tests added for changes
- [ ] Manual testing completed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings introduced
- [ ] Tests added/updated
- [ ] CHANGELOG.md updated

## Related Issues
Fixes #(issue number)
```

#### 5.5 Code of Conduct

**Create `CODE_OF_CONDUCT.md`:**
```markdown
# Contributor Covenant Code of Conduct

## Our Pledge

We as members, contributors, and leaders pledge to make participation in our
community a harassment-free experience for everyone.

## Our Standards

Examples of behavior that contributes to a positive environment:
- Using welcoming and inclusive language
- Being respectful of differing viewpoints
- Gracefully accepting constructive criticism
- Focusing on what is best for the community

Examples of unacceptable behavior:
- Trolling, insulting/derogatory comments
- Public or private harassment
- Publishing others' private information
- Other conduct which could reasonably be considered inappropriate

## Enforcement

Instances of abusive, harassing, or otherwise unacceptable behavior may be
reported to the project team at conduct@yourproject.com.

## Attribution

This Code of Conduct is adapted from the Contributor Covenant, version 2.1.
```

---

### Phase 6: Code Quality & Standards (Week 3)

**Priority: MEDIUM**

#### 6.1 Linting & Formatting

**Install ESLint & Prettier:**
```bash
npm install --save-dev eslint prettier eslint-config-prettier eslint-plugin-svelte3
```

**Create `.eslintrc.json`:**
```json
{
  "env": {
    "browser": true,
    "es2021": true,
    "node": true
  },
  "extends": [
    "eslint:recommended",
    "prettier"
  ],
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module"
  },
  "plugins": ["svelte3"],
  "overrides": [
    {
      "files": ["*.svelte"],
      "processor": "svelte3/svelte3"
    }
  ],
  "rules": {
    "no-console": "warn",
    "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  }
}
```

**Create `.prettierrc`:**
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

**Add to package.json:**
```json
{
  "scripts": {
    "lint": "eslint . --ext .js,.svelte",
    "lint:fix": "eslint . --ext .js,.svelte --fix",
    "format": "prettier --write \"**/*.{js,svelte,json,md}\"",
    "format:check": "prettier --check \"**/*.{js,svelte,json,md}\""
  }
}
```

#### 6.2 Branch Protection Rules

**Configure on GitHub:**

Settings → Branches → Add rule for `master`:
- [x] Require pull request reviews before merging (1 approval)
- [x] Require status checks to pass before merging
  - CI tests
  - Security scan
  - Lint check
- [x] Require branches to be up to date before merging
- [x] Require signed commits (optional but recommended)
- [x] Include administrators

#### 6.3 Semantic Versioning Automation

**Install semantic-release:**
```bash
npm install --save-dev semantic-release @semantic-release/git @semantic-release/changelog
```

**Create `.releaserc.json`:**
```json
{
  "branches": ["master"],
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/changelog",
    "@semantic-release/npm",
    "@semantic-release/git",
    "@semantic-release/github"
  ]
}
```

**Add to `.github/workflows/release.yml`:**
```yaml
- name: Semantic Release
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: npx semantic-release
```

---

## 📋 IMPLEMENTATION CHECKLIST

### Week 1: Testing & CI/CD
- [ ] Set up backend tests (Vitest + Supertest)
- [ ] Write tests for all 21 API endpoints
- [ ] Set up end-to-end tests (Playwright)
- [ ] Configure pre-commit hooks (Husky)
- [ ] Create GitHub Actions CI workflow
- [ ] Add Dependabot configuration
- [ ] Set up code coverage reporting (Codecov)

### Week 2: Security & Monitoring
- [ ] Create SECURITY.md policy
- [ ] Add CodeQL security scanning
- [ ] Set up npm audit in CI
- [ ] Implement health check monitoring
- [ ] Add error tracking (Sentry - optional)
- [ ] Set up log aggregation (Winston)
- [ ] Configure alerts (UptimeRobot or custom)

### Week 3: Documentation & Community
- [ ] Create Developer Hub (docs/developers/)
- [ ] Set up API documentation (Swagger)
- [ ] Write CONTRIBUTING.md
- [ ] Create issue/PR templates
- [ ] Add CODE_OF_CONDUCT.md
- [ ] Set up ESLint + Prettier
- [ ] Configure branch protection rules
- [ ] Document governance model

### Week 4: Polish & Launch
- [ ] Review all documentation
- [ ] Run full security audit
- [ ] Test all workflows
- [ ] Create project roadmap
- [ ] Write announcement blog post
- [ ] Submit to developer communities (Reddit, HN, etc.)

---

## 🎯 SUCCESS METRICS

### Testing
- **Target:** 80%+ code coverage
- **Measure:** Codecov reports, CI status

### Security
- **Target:** 0 critical/high vulnerabilities
- **Measure:** npm audit, CodeQL, Dependabot

### Documentation
- **Target:** All features documented, < 5 min onboarding
- **Measure:** Developer feedback, contribution rate

### Community
- **Target:** 10+ external contributors in first 3 months
- **Measure:** GitHub contributor graph

### Uptime
- **Target:** 99.9% uptime for production deployments
- **Measure:** UptimeRobot, health checks

---

## 🚀 PRIORITY ORDER

1. **CRITICAL (Week 1)**
   - Backend tests
   - CI/CD pipeline
   - Pre-commit hooks

2. **HIGH (Week 2)**
   - Security scanning
   - Health monitoring
   - SECURITY.md

3. **MEDIUM (Week 3)**
   - API documentation
   - Contributing guide
   - Code quality tools

4. **NICE TO HAVE (Week 4+)**
   - Error tracking (Sentry)
   - Automated releases (semantic-release)
   - Community building

---

## 📞 NEXT STEPS

Would you like me to:

**Option A:** Start implementing Phase 1 (Testing Infrastructure) right now?

**Option B:** Create a detailed task breakdown for your preferred phase?

**Option C:** Set up the GitHub repository settings and templates first?

**Option D:** Something else?

Let me know which path you'd like to take, and we'll make Raven world-class! 🚀
