# Contributing to Raven

Thank you for your interest in contributing to Raven! We welcome contributions from the community and are excited to work with you.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When creating a bug report, include as many details as possible using our bug report template.

**Good bug reports include:**
- Clear, descriptive title
- Exact steps to reproduce the issue
- Expected vs actual behavior
- Screenshots/logs if applicable
- Environment details (OS, Node.js version, etc.)

### Suggesting Features

Feature requests are welcome! Please use the feature request template and include:
- Clear use case and problem it solves
- Proposed solution or API
- Alternative approaches considered
- Examples from similar projects (if applicable)

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Install dependencies:** `npm install` in both `/backend` and `/frontend`
3. **Make your changes** following our coding standards
4. **Test your changes** thoroughly
5. **Update documentation** if needed
6. **Commit using conventional commits** (see below)
7. **Open a PR** using our template

## Development Setup

### Prerequisites

- Node.js 18+ and npm 9+
- Git

### Quick Start

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/raven.git
cd raven

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Start backend (in one terminal)
cd backend
npm start

# Start frontend (in another terminal)
cd frontend
npm run dev

# Backend: http://localhost:3030
# Frontend: http://localhost:5173
```

### Project Structure

```
raven/
├── backend/          # Node.js + Express API server
│   ├── server.js     # Main server with REST + WebSocket
│   ├── db.js         # SQLite database wrapper
│   ├── triggers.js   # Alert/trigger engine
│   └── package.json
├── frontend/         # Svelte web UI
│   ├── src/
│   │   ├── App.svelte
│   │   └── lib/      # Svelte components
│   └── package.json
├── docs/             # Documentation
└── .github/          # GitHub templates & workflows
```

## Coding Standards

### JavaScript/Node.js

- Use ES6+ features (import/export, async/await, etc.)
- Use **2 spaces** for indentation
- Use **single quotes** for strings
- Use **semicolons**
- Run `npm run lint` before committing (once ESLint is set up)
- Run `npm run format` to auto-format code (once Prettier is set up)

### Svelte

- Follow [Svelte style guide](https://svelte.dev/docs/svelte/overview)
- Keep components focused and single-purpose
- Use props for component communication
- Use stores for shared state
- Document props with JSDoc comments

### Commit Messages

We use **Conventional Commits** for clear, semantic commit history:

```
<type>(<scope>): <subject>

<body>

<footer>
```

#### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style/formatting (no logic change)
- `refactor`: Code refactoring
- `test`: Adding/updating tests
- `chore`: Build process, dependencies, tooling
- `perf`: Performance improvements

#### Examples

```bash
feat(backend): add export JSON/CSV endpoints

Implements API endpoints for exporting file events and agent 
telemetry to JSON and CSV formats.

Closes #42

---

fix(frontend): prevent WebSocket reconnection loop

Added exponential backoff to WebSocket reconnection logic 
to prevent rapid reconnection attempts.

Fixes #67

---

docs(api): add REST endpoint documentation

Created comprehensive documentation for all 21 REST API 
endpoints with examples.
```

#### Scope
Use one of: `backend`, `frontend`, `api`, `db`, `ui`, `docs`, `ci`, `deps`

## Testing Requirements

### Before Submitting a PR

- [ ] All existing tests pass
- [ ] New features include tests
- [ ] Manual testing completed
- [ ] No console errors or warnings
- [ ] Documentation updated

### Running Tests

```bash
# Backend tests (once test suite is implemented)
cd backend
npm test

# Frontend tests (once test suite is implemented)
cd frontend
npm test

# Lint check
npm run lint

# Format check
npm run format:check
```

## Pull Request Process

### 1. Create Your Branch

```bash
git checkout -b feat/your-feature-name
# or
git checkout -b fix/bug-description
```

### 2. Make Changes

- Write clean, documented code
- Follow coding standards
- Keep commits atomic and focused
- Test thoroughly

### 3. Commit Changes

```bash
# Stage your changes
git add .

# Commit with conventional commit message
git commit -m "feat(backend): add new monitoring feature"
```

### 4. Push to Your Fork

```bash
git push origin feat/your-feature-name
```

### 5. Open Pull Request

- Use our PR template
- Fill out all sections completely
- Link related issues
- Add screenshots for UI changes
- Request review from maintainers

### 6. Code Review

- Address reviewer feedback promptly
- Push new commits to update the PR
- Keep discussion professional and constructive
- Use "Resolves #123" to auto-close issues

### PR Checklist

Before requesting review, ensure:

- [ ] Code follows project style guide
- [ ] Commits use conventional commit format
- [ ] Tests pass locally
- [ ] Documentation updated (README, API docs, etc.)
- [ ] No merge conflicts with `main`
- [ ] PR description is clear and complete
- [ ] Screenshots included (for UI changes)
- [ ] Breaking changes documented
- [ ] Migration guide provided (if needed)

## Code Review Guidelines

### As a Reviewer

- Be respectful and constructive
- Explain the "why" behind suggestions
- Distinguish between required changes and suggestions
- Approve when ready, request changes if needed
- Test the PR locally when possible

### As a Contributor

- Don't take feedback personally
- Ask questions if unclear
- Update based on feedback
- Mark conversations as resolved when addressed
- Thank reviewers for their time

## Style Guide

### File Naming

- **Backend:** `kebab-case.js` (e.g., `trigger-engine.js`)
- **Frontend Components:** `PascalCase.svelte` (e.g., `EventFeed.svelte`)
- **Utilities:** `camelCase.js` (e.g., `formatDate.js`)
- **Tests:** `*.test.js` or `*.spec.js`

### Code Comments

```javascript
// ✅ GOOD: Explains WHY, not WHAT
// Use exponential backoff to prevent overwhelming the server
const delay = Math.min(1000 * Math.pow(2, attempts), 30000);

// ❌ BAD: States the obvious
// Set delay to exponential value
const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
```

### Function Documentation

```javascript
/**
 * Calculate file hash using SHA-256
 * @param {string} content - File content to hash
 * @returns {string} Hex-encoded SHA-256 hash
 */
function calculateFileHash(content) {
  return createHash('sha256').update(content).digest('hex');
}
```

## Documentation

### When to Update Docs

- New features → Update `docs/FEATURES.md`
- API changes → Update `docs/api/` files
- Architecture changes → Update `ARCHITECTURE.md`
- Breaking changes → Update `CHANGELOG.md`
- New dependencies → Update `package.json` + README

### Documentation Standards

- Use **Markdown** for all docs
- Include code examples
- Add screenshots for UI features
- Keep language clear and concise
- Update table of contents if applicable

## Getting Help

- **Questions:** Open a [GitHub Discussion](https://github.com/seheart/raven/discussions)
- **Bugs:** Open a [Bug Report](https://github.com/seheart/raven/issues/new?template=bug_report.md)
- **Features:** Open a [Feature Request](https://github.com/seheart/raven/issues/new?template=feature_request.md)
- **Chat:** Email seheart@gmail.com

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (see LICENSE file).

## Recognition

Contributors will be recognized in:
- `CONTRIBUTORS.md` (alphabetical)
- Release notes for significant contributions
- Git history (please use your real name and email)

---

Thank you for contributing to Raven!

Your contributions help make AI agent monitoring better for everyone.
