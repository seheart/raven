/**
 * Host identity + peer secrets — Phase 1 of multi-machine roll-up.
 *
 * `.raven/host.json` carries this host's stable identity (uuid, hostname).
 * `.raven/peers.json` lists shared secrets that the sync export endpoint
 * accepts as Bearer tokens. Endpoint is dormant when peers.json is missing.
 *
 * Both files live alongside the rest of Raven's data (RAVEN_DIR), so the
 * `~/.raven` install and the dev `<repo>/.raven` install both Just Work.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { hostname } from 'os';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';

export interface HostIdentity {
  host_id: string;
  host_name: string;
  created_at: string;
}

export interface PeersConfig {
  peers: Array<{
    host_id: string;
    name: string;
    url: string;
    secret: string;
  }>;
}

let cachedIdentity: HostIdentity | null = null;
let cachedSecrets: Set<string> | null = null;
let cachedSecretsAt = 0;
const SECRETS_TTL_MS = 5_000;

export function getHostIdentity(ravenDir: string): HostIdentity {
  if (cachedIdentity) return cachedIdentity;

  const file = join(ravenDir, 'host.json');

  if (existsSync(file)) {
    try {
      const data = JSON.parse(readFileSync(file, 'utf-8')) as Partial<HostIdentity>;
      if (data.host_id && data.host_name && data.created_at) {
        cachedIdentity = data as HostIdentity;
        return cachedIdentity;
      }
      logger.warn(`host.json present but malformed at ${file}; regenerating`);
    } catch (err) {
      logger.warn(`Failed to read ${file}: ${(err as Error).message}; regenerating`);
    }
  }

  const identity: HostIdentity = {
    host_id: randomUUID(),
    host_name: process.env.RAVEN_HOST_NAME || hostname(),
    created_at: new Date().toISOString()
  };

  if (!existsSync(dirname(file))) mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(identity, null, 2), 'utf-8');
  logger.info(`🆔 Host identity created: ${identity.host_name} (${identity.host_id})`);
  cachedIdentity = identity;
  return identity;
}

/**
 * Load the set of accepted Bearer secrets from peers.json. Cached briefly
 * so adding a peer doesn't require a server restart.
 *
 * Empty set → sync export endpoint is dormant (returns 503).
 */
export function getAcceptedPeerSecrets(ravenDir: string): Set<string> {
  const now = Date.now();
  if (cachedSecrets && now - cachedSecretsAt < SECRETS_TTL_MS) return cachedSecrets;

  const file = join(ravenDir, 'peers.json');
  const secrets = new Set<string>();

  if (existsSync(file)) {
    try {
      const data = JSON.parse(readFileSync(file, 'utf-8')) as PeersConfig;
      for (const peer of data.peers || []) {
        if (peer.secret && typeof peer.secret === 'string') secrets.add(peer.secret);
      }
    } catch (err) {
      logger.warn(`peers.json malformed at ${file}: ${(err as Error).message}`);
    }
  }

  cachedSecrets = secrets;
  cachedSecretsAt = now;
  return secrets;
}

export function isPeerAuthEnabled(ravenDir: string): boolean {
  return getAcceptedPeerSecrets(ravenDir).size > 0;
}
