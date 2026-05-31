/**
 * Disk-full subsystem state — singleton tracker.
 *
 * When sqlite-retry (or any caller) detects ENOSPC, it flips a flag here. The
 * /api/health endpoint reads the flag so the UI can surface a banner, and
 * write-dependent routes can 503 instead of crashing. The flag clears the next
 * time any write succeeds — see markWriteSuccess().
 *
 * No external state file: this is a process-lifetime signal. If Raven restarts
 * we'll re-discover the condition on the first failed write.
 */

interface DiskState {
  diskFull: boolean;
  detectedAt: string | null;
  message: string | null;
}

let state: DiskState = {
  diskFull: false,
  detectedAt: null,
  message: null
};

type Listener = (s: DiskState) => void;
const listeners = new Set<Listener>();

export function markDiskFull(err: Error): void {
  if (state.diskFull) return; // already known
  state = {
    diskFull: true,
    detectedAt: new Date().toISOString(),
    message: err.message
  };
  for (const l of listeners) {
    try {
      l(state);
    } catch {
      /* listener must not throw */
    }
  }
}

/** Any successful write clears the flag. */
export function markWriteSuccess(): void {
  if (!state.diskFull) return;
  state = { diskFull: false, detectedAt: null, message: null };
  for (const l of listeners) {
    try {
      l(state);
    } catch {
      /* ignore */
    }
  }
}

export function getDiskState(): DiskState {
  return state;
}

export function onDiskStateChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
