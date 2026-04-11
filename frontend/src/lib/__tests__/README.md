# Frontend Component Tests

This directory contains unit and integration tests for Svelte components using Vitest and @testing-library/svelte.

## Getting Started

### Running Tests

```bash
# Run all frontend tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## Test Structure

### Basic Component Test Template

```javascript
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import YourComponent from '../YourComponent.svelte';

describe('YourComponent', () => {
  it('should render correctly', () => {
    const { container } = render(YourComponent);
    expect(container).toBeTruthy();
  });

  it('should accept props', () => {
    const { getByText } = render(YourComponent, {
      props: { message: 'Hello' }
    });
    expect(getByText('Hello')).toBeInTheDocument();
  });
});
```

### Interactive Component Test Template

```javascript
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import YourComponent from '../YourComponent.svelte';

describe('YourComponent - Interactions', () => {
  it('should handle button clicks', async () => {
    const handleClick = vi.fn();
    const { getByRole } = render(YourComponent, {
      props: { onClick: handleClick }
    });

    const button = getByRole('button');
    await fireEvent.click(button);

    expect(handleClick).toHaveBeenCalledOnce();
  });
});
```

## Current Test Coverage

**Status:** Initial test suite (2 example tests)
**Components Tested:** 2/69 (~3%)
**Target:** 30-50% coverage

### Tested Components

- ✅ RavenLogo.svelte - Logo component with size props
- ✅ Toast.svelte - Toast notification with types and close

### Priority Components to Test Next

1. **Critical Components** (Test First)
   - [ ] OverviewPanel.svelte - Main dashboard panel
   - [ ] Dashboard.svelte - Main dashboard view
   - [ ] ErrorBoundary.svelte - Error handling
   - [ ] HealthWidget.svelte - System health display
   - [ ] NotificationsPanel.svelte - Notifications

2. **High-Value Components**
   - [ ] ProjectsOverview.svelte - Project listing
   - [ ] SessionDashboard.svelte - Session tracking
   - [ ] PerformancePanel.svelte - Performance metrics
   - [ ] AgentsPanel.svelte - Agent monitoring

3. **Utility Components**
   - [ ] LoadingSkeleton.svelte - Loading states
   - [ ] ConfirmDialog.svelte - Confirmation dialogs
   - [ ] ToastContainer.svelte - Toast management
   - [ ] KeyboardShortcuts.svelte - Keyboard handling

## Testing Best Practices

### 1. Test Behavior, Not Implementation

```javascript
// ❌ Bad - Testing implementation details
it('should have .active class', () => {
  expect(element.classList.contains('active')).toBe(true);
});

// ✅ Good - Testing user-visible behavior
it('should show as active', () => {
  expect(element).toHaveAttribute('aria-current', 'page');
});
```

### 2. Use Accessible Queries

```javascript
// Prefer (in order):
getByRole('button', { name: 'Submit' });
getByLabelText('Username');
getByPlaceholderText('Enter name');
getByText('Welcome');

// Avoid:
getByTestId('submit-button');
container.querySelector('.submit-btn');
```

### 3. Test User Interactions

```javascript
it('should submit form on enter key', async () => {
  const { getByRole } = render(FormComponent);
  const input = getByRole('textbox');

  await fireEvent.keyDown(input, { key: 'Enter' });

  expect(submitHandler).toHaveBeenCalled();
});
```

### 4. Mock External Dependencies

```javascript
import { vi } from 'vitest';

// Mock API calls
vi.mock('../lib/apiClient.js', () => ({
  fetchData: vi.fn().mockResolvedValue({ data: [] })
}));

// Mock stores
vi.mock('../lib/stores.js', () => ({
  settings: { subscribe: vi.fn() }
}));
```

### 5. Test Error States

```javascript
it('should display error message on API failure', async () => {
  apiClient.fetchData.mockRejectedValue(new Error('Network error'));

  const { findByText } = render(DataComponent);

  expect(await findByText(/error/i)).toBeInTheDocument();
});
```

## Common Testing Patterns

### Testing Svelte Stores

```javascript
import { writable } from 'svelte/store';

it('should update when store changes', async () => {
  const testStore = writable('initial');

  const { getByText, rerender } = render(Component, {
    props: { store: testStore }
  });

  expect(getByText('initial')).toBeInTheDocument();

  testStore.set('updated');
  await rerender({ store: testStore });

  expect(getByText('updated')).toBeInTheDocument();
});
```

### Testing Async Components

```javascript
it('should load data on mount', async () => {
  const { findByText } = render(AsyncComponent);

  // Use findBy* for async elements
  expect(await findByText('Loaded data')).toBeInTheDocument();
});
```

### Testing Component Events

```javascript
it('should emit custom event', async () => {
  const handleEvent = vi.fn();

  const { component } = render(Component);
  component.$on('customEvent', handleEvent);

  // Trigger event
  await fireEvent.click(button);

  expect(handleEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      detail: { value: 'test' }
    })
  );
});
```

### Testing Conditional Rendering

```javascript
it('should show loading state', () => {
  const { getByText } = render(Component, {
    props: { loading: true }
  });

  expect(getByText('Loading...')).toBeInTheDocument();
});

it('should show content when loaded', () => {
  const { getByText } = render(Component, {
    props: { loading: false, data: 'test' }
  });

  expect(getByText('test')).toBeInTheDocument();
});
```

## Accessibility Testing

Always include basic accessibility checks:

```javascript
it('should be keyboard accessible', async () => {
  const { getByRole } = render(Component);
  const button = getByRole('button');

  await fireEvent.keyDown(button, { key: 'Enter' });
  expect(handleClick).toHaveBeenCalled();
});

it('should have proper ARIA labels', () => {
  const { getByLabelText } = render(Component);

  expect(getByLabelText('Search')).toBeInTheDocument();
});

it('should announce status to screen readers', () => {
  const { getByRole } = render(Component);

  expect(getByRole('status')).toHaveTextContent('Loading');
});
```

## Debugging Tests

### View Component HTML

```javascript
const { container, debug } = render(Component);
debug(); // Prints component HTML to console
```

### Inspect Queries

```javascript
const { container } = render(Component);
screen.logTestingPlaygroundURL(); // Generates interactive playground URL
```

### Common Issues

1. **"Unable to find element"**
   - Use `findBy*` for async elements
   - Check if element is conditionally rendered
   - Use `debug()` to inspect DOM

2. **"Not wrapped in act(...)"**
   - Use `await` before `fireEvent`
   - Use `waitFor()` for async updates

3. **"Cannot read property of undefined"**
   - Mock all external dependencies
   - Provide default props
   - Check component lifecycle

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [@testing-library/svelte](https://testing-library.com/docs/svelte-testing-library/intro)
- [Testing Library Queries](https://testing-library.com/docs/queries/about)
- [Jest DOM Matchers](https://github.com/testing-library/jest-dom)

## Contributing

When adding new component tests:

1. Follow the naming convention: `ComponentName.test.js`
2. Group related tests with `describe()` blocks
3. Use descriptive test names: "should do X when Y"
4. Test happy path, error states, and edge cases
5. Include accessibility checks
6. Update this README with tested components

## Goals

**Short-term (Week 1):**

- [ ] Add tests for 5 critical components
- [ ] Achieve 10% component coverage

**Medium-term (Month 1):**

- [ ] Add tests for 20 components
- [ ] Achieve 30% component coverage
- [ ] Add E2E tests for main flows

**Long-term (Quarter):**

- [ ] 50%+ component coverage
- [ ] Comprehensive E2E test suite
- [ ] Integration tests for complex flows

---

**Last Updated:** October 26, 2025
**Status:** Initial test infrastructure created
**Next Steps:** Add tests for critical components
