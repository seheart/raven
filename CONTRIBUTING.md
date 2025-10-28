# Contributing to Raven

Thank you for your interest in contributing to Raven! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Style](#code-style)
- [Testing](#testing)
- [Commit Message Format](#commit-message-format)
- [Pull Request Process](#pull-request-process)
- [Code of Conduct](#code-of-conduct)

## Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- **Git** for version control
- Basic knowledge of Svelte, Node.js, and SQLite

### Initial Setup

1. **Fork the repository**
   - Visit https://github.com/seheart/raven
   - Click the "Fork" button in the top right

2. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/raven.git
   cd raven
   ```

3. **Install dependencies**
   ```bash
   npm install
   cd backend && npm install
   cd ../frontend && npm install
   cd ..
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Verify tests pass**
   ```bash
   npm test
   ```

## Development Workflow

### Creating a Feature Branch

```bash
# Update your main branch
git checkout main
git pull upstream main

# Create a feature branch
git checkout -b feature/my-awesome-feature
```

### Making Changes

1. **Write code** following our [Code Style](#code-style) guidelines
2. **Add tests** for new features or bug fixes
3. **Update documentation** if you change APIs or add features
4. **Run tests** to ensure nothing breaks
   ```bash
   npm test
   ```

### Committing Changes

We use [Conventional Commits](https://www.conventionalcommits.org/) for clear commit history:

```bash
git commit -m "feat: add real-time notification system"
git commit -m "fix: resolve memory leak in file watcher"
git commit -m "docs: update API documentation"
```

See [Commit Message Format](#commit-message-format) for details.

## Code Style

### General Guidelines

- **Consistency**: Follow existing code patterns
- **Clarity**: Write self-documenting code with descriptive names
- **Simplicity**: Prefer simple solutions over complex ones
- **Comments**: Add comments for complex logic, not obvious code

### JavaScript/Svelte

- **Indentation**: 2 spaces
- **Semicolons**: No semicolons (except where required)
- **Quotes**: Single quotes for strings
- **Line length**: Max 100 characters
- **Arrow functions**: Prefer arrow functions for callbacks

```javascript
// Good
const handleClick = () => {
  const result = processData(data)
  return result
}

// Avoid
function handleClick() {
  var result = processData(data);
  return result;
}
```

### Svelte Components

- **File structure**: script → markup → style
- **Props**: Use `export let` for props
- **Reactivity**: Use `$:` for reactive statements
- **Stores**: Use Svelte stores for shared state

```svelte
<script>
  export let title = 'Default'
  export let data = []

  $: filteredData = data.filter(item => item.active)

  function handleAction() {
    // ...
  }
</script>

<div class="component">
  <h2>{title}</h2>
  <!-- content -->
</div>

<style>
  .component {
    /* styles */
  }
</style>
```

### Backend Code

- **Error handling**: Always use try-catch for async operations
- **Logging**: Use the logger service, not console.log
- **Validation**: Validate all inputs
- **Security**: Never trust client input

```javascript
// Good
try {
  const result = await someAsyncOperation()
  logger.info('Operation successful', { result })
  return res.json({ success: true, data: result })
} catch (error) {
  logger.error('Operation failed', { error })
  return res.status(500).json({ error: 'Internal server error' })
}
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run backend tests only
npm run test:backend

# Run frontend tests only
npm run test:frontend

# Run E2E tests
npm run test:e2e

# Run specific test file
npm test -- path/to/test.js
```

### Writing Tests

- **Unit tests**: Test individual functions and methods
- **Component tests**: Test Svelte components in isolation
- **Integration tests**: Test feature flows
- **E2E tests**: Test critical user journeys

```javascript
// Example unit test
import { describe, it, expect } from 'vitest'
import { formatDateTime } from '../utils'

describe('formatDateTime', () => {
  it('should format ISO date correctly', () => {
    const result = formatDateTime('2025-10-27T12:00:00Z')
    expect(result).toBe('Oct 27, 2025 12:00 PM')
  })
})
```

### Test Coverage

We aim for high test coverage:
- **Minimum**: 80% coverage for all code
- **Target**: 90%+ coverage for critical paths
- **Required**: 100% coverage for security-related code

## Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, missing semi colons, etc)
- **refactor**: Code refactoring
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **chore**: Build process or auxiliary tool changes
- **ci**: CI/CD changes

### Scope (optional)

The scope should be the name of the component or module affected:

- `frontend`
- `backend`
- `api`
- `auth`
- `dashboard`
- `telemetry`

### Subject

- Use imperative mood: "add feature" not "added feature"
- Don't capitalize first letter
- No period at the end
- Max 50 characters

### Body (optional)

- Explain **what** and **why**, not **how**
- Wrap at 72 characters

### Footer (optional)

- Reference issues: `Fixes #123`, `Closes #456`
- Breaking changes: `BREAKING CHANGE: description`

### Examples

```bash
feat(dashboard): add real-time event streaming

Implement WebSocket connection for live event updates.
Users can now see events as they happen without refreshing.

Fixes #234

fix(auth): prevent token expiration race condition

Previously, concurrent requests could cause token refresh
to fail. Now using a mutex to ensure single refresh.

Closes #456

docs: update API documentation

Add examples for authentication endpoints.

BREAKING CHANGE: /api/login now requires email instead of username
```

## Pull Request Process

### Before Submitting

1. **Rebase** on latest main
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run tests**
   ```bash
   npm test
   ```

3. **Check code style**
   ```bash
   npm run lint
   ```

4. **Update documentation** if needed

### Submitting PR

1. **Push to your fork**
   ```bash
   git push origin feature/my-feature
   ```

2. **Create PR** on GitHub
   - Use a descriptive title following commit message format
   - Fill out the PR template
   - Link related issues
   - Add screenshots for UI changes
   - Request review from maintainers

3. **PR Template**
   ```markdown
   ## Description
   Brief description of changes

   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Breaking change
   - [ ] Documentation update

   ## Testing
   - [ ] Tests pass locally
   - [ ] Added new tests
   - [ ] Updated documentation

   ## Screenshots (if applicable)
   [Add screenshots here]

   ## Related Issues
   Fixes #123
   ```

### Review Process

- Maintainers will review your PR
- Address feedback and push new commits
- Once approved, maintainers will merge
- Your PR will be included in the next release

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive environment for all contributors.

### Standards

**Positive behavior:**
- Using welcoming and inclusive language
- Being respectful of differing viewpoints
- Gracefully accepting constructive criticism
- Focusing on what is best for the community

**Unacceptable behavior:**
- Trolling, insulting comments, or personal attacks
- Public or private harassment
- Publishing others' private information
- Other conduct which could reasonably be considered inappropriate

### Enforcement

Violations may result in temporary or permanent ban from the project.

## Questions?

- **Documentation**: Check [docs/](./docs/)
- **Issues**: Search [existing issues](https://github.com/seheart/raven/issues)
- **Discussions**: Start a [discussion](https://github.com/seheart/raven/discussions)
- **Email**: Contact the maintainer at seth@example.com

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to Raven!** 🚀
