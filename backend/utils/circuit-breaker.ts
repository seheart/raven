/**
 * CircuitBreaker — small no-dependency breaker for unreliable external services.
 *
 * States: closed (pass-through), open (fast-fail until cooldown), half-open
 * (one probe allowed; success → closed, failure → open). Defaults: 3 failures
 * opens, 30s cooldown. Shared across call sites via getBreaker(name).
 */

export class CircuitOpenError extends Error {
  constructor(name: string, retryInSec: number) {
    super(`Circuit "${name}" is open — retry in ${retryInSec}s`);
    this.name = 'CircuitOpenError';
  }
}

export type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
}

export class CircuitBreaker {
  readonly name: string;
  private consecutiveFailures = 0;
  private openUntil = 0;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;

  constructor(name: string, opts: CircuitBreakerOptions = {}) {
    this.name = name;
    this.failureThreshold = opts.failureThreshold ?? 3;
    this.cooldownMs = opts.cooldownMs ?? 30_000;
  }

  state(): CircuitState {
    if (this.consecutiveFailures < this.failureThreshold) return 'closed';
    return Date.now() >= this.openUntil ? 'half-open' : 'open';
  }

  isOpen(): boolean {
    return this.state() === 'open';
  }

  retryInSec(): number {
    return this.state() === 'open'
      ? Math.max(0, Math.ceil((this.openUntil - Date.now()) / 1000))
      : 0;
  }

  /** Run fn through the breaker. Throws CircuitOpenError when open. */
  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen()) throw new CircuitOpenError(this.name, this.retryInSec());
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openUntil = 0;
  }

  recordFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.openUntil = Date.now() + this.cooldownMs;
    }
  }

  snapshot(): { name: string; state: CircuitState; failures: number; retryInSec: number } {
    return {
      name: this.name,
      state: this.state(),
      failures: this.consecutiveFailures,
      retryInSec: this.retryInSec()
    };
  }
}

// Process-wide registry so different routes/services share state per dependency.
const REGISTRY = new Map<string, CircuitBreaker>();

export function getBreaker(name: string, opts?: CircuitBreakerOptions): CircuitBreaker {
  let b = REGISTRY.get(name);
  if (!b) {
    b = new CircuitBreaker(name, opts);
    REGISTRY.set(name, b);
  }
  return b;
}

export function allBreakers(): CircuitBreaker[] {
  return Array.from(REGISTRY.values());
}
