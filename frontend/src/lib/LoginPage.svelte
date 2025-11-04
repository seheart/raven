<script>
  import { onMount } from 'svelte';
  import { authService, authLoading } from './authStore.js';
  import RavenLogo from './RavenLogo.svelte';

  export let onLoginSuccess = () => {};

  let username = '';
  let password = '';
  let error = '';
  let showPassword = false;

  async function handleSubmit() {
    error = '';

    // Basic validation
    if (!username || !password) {
      error = 'Please enter both username and password';
      return;
    }

    if (username.length < 3) {
      error = 'Username must be at least 3 characters';
      return;
    }

    if (password.length < 8) {
      error = 'Password must be at least 8 characters';
      return;
    }

    // Attempt login
    const success = await authService.login(username, password);

    if (success) {
      onLoginSuccess();
    } else {
      error = 'Invalid username or password';
    }
  }

  function handleKeyPress(event) {
    if (event.key === 'Enter') {
      handleSubmit();
    }
  }

  onMount(() => {
    // Focus username field on mount
    document.getElementById('username')?.focus();
  });
</script>

<div class="login-container" role="main" aria-label="Login page">
  <div class="login-card">
    <div class="login-header">
      <RavenLogo size={48} />
      <h1 id="login-title">Welcome to Raven</h1>
      <p>Sign in to continue</p>
    </div>

    <form on:submit|preventDefault={handleSubmit} class="login-form" aria-busy={$authLoading} aria-labelledby="login-title" aria-describedby={error ? 'login-error' : undefined}>
      {#if error}
        <div id="login-error" class="error-message" role="alert" aria-live="assertive">
          {error}
        </div>
      {/if}

      <div class="form-group">
        <label for="username">Username</label>
        <input
          id="username"
          type="text"
          bind:value={username}
          on:keypress={handleKeyPress}
          placeholder="Enter your username"
          autocomplete="username"
          disabled={$authLoading}
          aria-required="true"
          aria-invalid={error && !username}
        />
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <div class="password-input">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            bind:value={password}
            on:keypress={handleKeyPress}
            placeholder="Enter your password"
            autocomplete="current-password"
            disabled={$authLoading}
            aria-required="true"
            aria-invalid={error && !password}
          />
          <button
            type="button"
            class="toggle-password"
            on:click={() => showPassword = !showPassword}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            disabled={$authLoading}
          >
            <span aria-hidden="true">{showPassword ? '👁️' : '👁️‍🗨️'}</span>
          </button>
        </div>
      </div>

      <button
        type="submit"
        class="login-button"
        disabled={$authLoading}
        aria-label={$authLoading ? 'Signing in, please wait' : 'Sign in to Raven'}
      >
        {$authLoading ? 'Signing in...' : 'Sign In'}
      </button>
    </form>

    <div class="login-footer" role="complementary" aria-label="Login information">
      <p class="hint" role="note">
        <strong>Default credentials:</strong><br>
        Username: <code>admin</code><br>
        Password: <code>admin123</code>
      </p>
      <p class="security-note" role="note">
        <span aria-hidden="true">🔒</span> Change the default password after first login
      </p>
    </div>
  </div>
</div>

<style>
  .login-container {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--bg) 0%, var(--surface-2) 100%);
    z-index: 10000;
  }

  .login-card {
    width: 100%;
    max-width: 420px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-4xl);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .login-header {
    text-align: center;
    margin-bottom: var(--space-4xl);
  }

  .login-header h1 {
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 600;
    margin: var(--space-2xl) 0 var(--space-lg);
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2, var(--accent)) 100%);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .login-header p {
    color: var(--muted);
    font-size: 11px;
    margin: 0;
  }

  .login-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .error-message {
    padding: var(--space-xl);
    background: rgba(255, 100, 100, 0.1);
    border: 1px solid rgba(255, 100, 100, 0.3);
    border-radius: var(--radius-sm);
    color: #ff6464;
    font-size: 13px;
    font-family: var(--sans);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .form-group label {
    font-family: var(--sans);
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .form-group input {
    padding: var(--space-xl);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: var(--sans);
    font-size: 11px;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .form-group input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(var(--accent-rgb, 139, 233, 253), 0.1);
  }

  .form-group input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .password-input {
    position: relative;
  }

  .password-input input {
    width: 100%;
    padding-right: 44px;
  }

  .toggle-password {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 11px;
    padding: var(--space-sm) var(--space-lg);
    opacity: 0.6;
    transition: opacity var(--duration-base) var(--ease-smooth);
  }

  .toggle-password:hover {
    opacity: 1;
  }

  .toggle-password:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    opacity: 1;
  }

  .toggle-password:disabled {
    cursor: not-allowed;
  }

  .login-button {
    padding: var(--space-xl);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
    margin-top: var(--space-lg);
  }

  .login-button:hover:not(:disabled) {
    background: var(--accent-2, var(--accent));
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(var(--accent-rgb, 139, 233, 253), 0.3);
  }

  .login-button:active:not(:disabled) {
    transform: translateY(0);
  }

  .login-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .login-footer {
    margin-top: var(--space-4xl);
    text-align: center;
  }

  .hint {
    padding: var(--space-2xl);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 12px;
    color: var(--muted);
    margin: 0 0 var(--space-md) 0;
    line-height: 1.6;
  }

  .hint code {
    background: var(--bg);
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-sm);
    font-family: var(--mono);
    color: var(--accent);
  }

  .security-note {
    font-size: 11px;
    color: var(--muted);
    margin: 0;
  }

  @media (max-width: 768px) {
    .login-card {
      max-width: 90%;
      padding: var(--space-lg);
    }

    .login-header h1 {
      font-size: 13px;
    }
  }
</style>
