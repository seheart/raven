/**
 * Process attribution for inbound connections.
 *
 * Given a source TCP port (req.socket.remotePort), figure out which
 * local process opened the connection and what project directory it's
 * running from. Used by the Ollama proxy to tag each inference event
 * with the project that triggered it — no app-side cooperation needed.
 *
 * Strategy:
 *   1. Read /proc/net/tcp{,6} → find the line where local_address ends
 *      with the source port; pull the socket inode.
 *   2. Walk /proc/*\/fd → find the PID whose fd table contains a socket
 *      link for that inode.
 *   3. Read /proc/PID/cwd → resolve the working directory.
 *   4. Match cwd against known project paths.
 *
 * Linux-only. Falls back to null on any error (other-OS, permission
 * issues, vanished processes). Per-port and per-pid caches keep
 * the cost negligible across HTTP keep-alive bursts.
 */

import fs from 'fs/promises';

const PID_CACHE_TTL_MS = 5_000;
const CWD_CACHE_TTL_MS = 30_000;

const portToPidCache = new Map<number, { pid: number | null; ts: number }>();
const cwdCache = new Map<number, { cwd: string | null; ts: number }>();

interface ProjectPath {
  name: string;
  path: string;
}

interface AttributionResult {
  pid: number | null;
  cwd: string | null;
  project: string | null;
}

async function findPidByPort(srcPort: number): Promise<number | null> {
  const cached = portToPidCache.get(srcPort);
  if (cached && Date.now() - cached.ts < PID_CACHE_TTL_MS) return cached.pid;

  const portHex = srcPort.toString(16).toUpperCase().padStart(4, '0');
  let inode: string | null = null;

  for (const tcpFile of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let text: string;
    try {
      text = await fs.readFile(tcpFile, 'utf-8');
    } catch {
      continue;
    }
    const lines = text.split('\n').slice(1);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10) continue;
      // local_address is HEX_IP:HEX_PORT — match suffix only, IP family is irrelevant.
      if (!parts[1].endsWith(':' + portHex)) continue;
      // Accept any non-listening state. Short bursty client connections can
      // transition past ESTABLISHED (to CLOSE_WAIT etc.) before our handler
      // runs, especially for HTTP/1 without keep-alive — being too strict
      // here was dropping attributions for poll-style traffic.
      if (parts[3] === '0A') continue; // skip LISTEN
      inode = parts[9];
      // Don't break on first match; prefer ESTABLISHED if we find one.
      if (parts[3] === '01') break;
    }
    if (inode) break;
  }

  if (!inode || inode === '0') {
    portToPidCache.set(srcPort, { pid: null, ts: Date.now() });
    return null;
  }

  let pid: number | null = null;
  try {
    const entries = await fs.readdir('/proc');
    outer: for (const e of entries) {
      if (!/^\d+$/.test(e)) continue;
      let fdEntries: string[];
      try {
        fdEntries = await fs.readdir(`/proc/${e}/fd`);
      } catch {
        continue;
      }
      for (const fd of fdEntries) {
        let link: string;
        try {
          link = await fs.readlink(`/proc/${e}/fd/${fd}`);
        } catch {
          continue;
        }
        const m = /^socket:\[(\d+)\]$/.exec(link);
        if (m && m[1] === inode) {
          pid = parseInt(e, 10);
          break outer;
        }
      }
    }
  } catch {
    // /proc unreadable — fall through to null.
  }

  portToPidCache.set(srcPort, { pid, ts: Date.now() });
  return pid;
}

async function getProcessCwdCached(pid: number): Promise<string | null> {
  const cached = cwdCache.get(pid);
  if (cached && Date.now() - cached.ts < CWD_CACHE_TTL_MS) return cached.cwd;
  let cwd: string | null = null;
  try {
    cwd = await fs.readlink(`/proc/${pid}/cwd`);
  } catch {
    cwd = null;
  }
  cwdCache.set(pid, { cwd, ts: Date.now() });
  return cwd;
}

export function cwdToProject(cwd: string | null, projects: ProjectPath[]): string | null {
  if (!cwd) return null;
  // Prefer the most specific (longest) matching path so nested projects
  // attribute to the closer one.
  let best: ProjectPath | null = null;
  for (const p of projects) {
    if (cwd === p.path || cwd.startsWith(p.path + '/')) {
      if (!best || p.path.length > best.path.length) best = p;
    }
  }
  return best?.name ?? null;
}

export async function attributeConnection(
  srcPort: number,
  projects: ProjectPath[]
): Promise<AttributionResult> {
  const pid = await findPidByPort(srcPort);
  if (pid === null) return { pid: null, cwd: null, project: null };
  const cwd = await getProcessCwdCached(pid);
  return { pid, cwd, project: cwdToProject(cwd, projects) };
}

/**
 * Find all PIDs currently holding a connection (any state) where the
 * REMOTE end is the given port — i.e., processes calling out to that
 * service. Used to detect who loaded a model into Ollama at the moment
 * we observe `/api/ps` go from "absent" to "resident."
 *
 * Best-effort: a process whose request already completed before we
 * scanned won't appear. We pick up long-lived ones (ollama run from a
 * terminal, Aider/Continue with keep-alive, etc.).
 */
export async function findPidsByDestPort(destPort: number): Promise<number[]> {
  const portHex = destPort.toString(16).toUpperCase().padStart(4, '0');
  const inodes = new Set<string>();

  for (const tcpFile of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let text: string;
    try {
      text = await fs.readFile(tcpFile, 'utf-8');
    } catch {
      continue;
    }
    const lines = text.split('\n').slice(1);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10) continue;
      // rem_address (parts[2]) is HEX_IP:HEX_PORT — match where the
      // connection goes TO destPort. Skip LISTEN sockets (they have
      // rem_address 00000000:0000).
      if (!parts[2].endsWith(':' + portHex)) continue;
      if (parts[3] === '0A') continue; // LISTEN
      if (parts[9] && parts[9] !== '0') inodes.add(parts[9]);
    }
  }

  if (inodes.size === 0) return [];

  const pids = new Set<number>();
  try {
    const entries = await fs.readdir('/proc');
    for (const e of entries) {
      if (!/^\d+$/.test(e)) continue;
      let fdEntries: string[];
      try {
        fdEntries = await fs.readdir(`/proc/${e}/fd`);
      } catch {
        continue;
      }
      for (const fd of fdEntries) {
        let link: string;
        try {
          link = await fs.readlink(`/proc/${e}/fd/${fd}`);
        } catch {
          continue;
        }
        const m = /^socket:\[(\d+)\]$/.exec(link);
        if (m && inodes.has(m[1])) {
          pids.add(parseInt(e, 10));
          break; // this PID has at least one matching socket; move on
        }
      }
    }
  } catch {
    // /proc unreadable
  }

  return Array.from(pids);
}

export async function getProcessCmd(pid: number): Promise<string | null> {
  try {
    const buf = await fs.readFile(`/proc/${pid}/cmdline`, 'utf-8');
    return buf.replace(/\0/g, ' ').trim() || null;
  } catch {
    return null;
  }
}

export async function getProcessCwd(pid: number): Promise<string | null> {
  return getProcessCwdCached(pid);
}
