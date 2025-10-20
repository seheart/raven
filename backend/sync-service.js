import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, mkdir, access, constants as fsConstants } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// Constants
const CONFIG_DIR = path.join(os.homedir(), '.config', 'raven');
const CONFIG_FILE = path.join(CONFIG_DIR, 'sync-config.json');
const SYNC_HISTORY_FILE = path.join(CONFIG_DIR, 'sync-history.json');

const SSH_TIMEOUT_MS = 30000;           // 30 seconds for connection tests
const RSYNC_TIMEOUT_MS = 300000;        // 5 minutes for sync operations
const STATS_TIMEOUT_MS = 60000;         // 1 minute for stats collection
const RSYNC_MAX_BUFFER = 10 * 1024 * 1024;  // 10 MB
const MAX_HISTORY_RECORDS = 100;

// Sync lock to prevent concurrent operations
let syncInProgress = false;
let syncCancelRequested = false;
let currentSyncProcess = null;

/**
 * Validate sync configuration inputs to prevent command injection
 */
function validateSyncConfig(config) {
  const { host, port, user, path: remotePath } = config;

  // Validate host (alphanumeric, dots, hyphens only)
  if (!host || typeof host !== 'string') {
    throw new Error('Host is required');
  }
  if (!/^[a-zA-Z0-9.-]+$/.test(host)) {
    throw new Error('Invalid host: only alphanumeric characters, dots, and hyphens allowed');
  }
  if (host.length > 253) {
    throw new Error('Host too long (max 253 characters)');
  }

  // Validate port
  const portNum = parseInt(port);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    throw new Error('Invalid port: must be between 1 and 65535');
  }

  // Validate user (alphanumeric, underscore, hyphen only)
  if (!user || typeof user !== 'string') {
    throw new Error('User is required');
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(user)) {
    throw new Error('Invalid user: only alphanumeric characters, underscores, and hyphens allowed');
  }
  if (user.length > 32) {
    throw new Error('User too long (max 32 characters)');
  }

  // Validate remote path (absolute path, no traversal)
  if (remotePath) {
    if (typeof remotePath !== 'string') {
      throw new Error('Invalid path type');
    }
    if (!remotePath.startsWith('/')) {
      throw new Error('Remote path must be absolute (start with /)');
    }
    if (remotePath.includes('..')) {
      throw new Error('Remote path cannot contain ".." (path traversal)');
    }
    if (remotePath.length > 255) {
      throw new Error('Remote path too long (max 255 characters)');
    }
    // Additional check: only allow safe characters in path
    if (!/^[a-zA-Z0-9._\-\/]+$/.test(remotePath)) {
      throw new Error('Remote path contains invalid characters');
    }
  }

  return true;
}

/**
 * Execute SSH command with timeout using execFile (safer than exec)
 */
async function execSSH(host, port, user, command, timeoutMs = SSH_TIMEOUT_MS) {
  validateSyncConfig({ host, port, user });

  const args = [
    '-p', port.toString(),
    '-o', 'ConnectTimeout=10',
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=no',
    `${user}@${host}`,
    command
  ];

  try {
    const { stdout, stderr } = await Promise.race([
      execFileAsync('ssh', args, { maxBuffer: RSYNC_MAX_BUFFER }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`SSH command timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);

    return { stdout, stderr, success: true };
  } catch (error) {
    return { stdout: '', stderr: error.message, success: false, error };
  }
}

/**
 * Check if rsync is installed
 */
export async function checkRsyncInstalled() {
  try {
    await execFileAsync('which', ['rsync']);
    return { installed: true };
  } catch (error) {
    return {
      installed: false,
      message: 'rsync is not installed. Install it with: sudo pacman -S rsync (or apt/yum/brew)'
    };
  }
}

/**
 * Load sync configuration from disk
 */
export async function loadConfig() {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return {
        config: null,
        lastSync: null,
        history: []
      };
    }

    const configData = await readFile(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(configData);

    // Load history
    let history = [];
    if (existsSync(SYNC_HISTORY_FILE)) {
      const historyData = await readFile(SYNC_HISTORY_FILE, 'utf-8');
      history = JSON.parse(historyData);
    }

    const lastSync = history.length > 0 ? history[0] : null;

    return { config, lastSync, history };
  } catch (error) {
    console.error('Failed to load sync config:', error);
    return { config: null, lastSync: null, history: [] };
  }
}

/**
 * Save sync configuration to disk
 */
export async function saveConfig(config) {
  try {
    // Validate before saving
    validateSyncConfig(config);

    // Ensure config directory exists
    if (!existsSync(CONFIG_DIR)) {
      await mkdir(CONFIG_DIR, { recursive: true });
    }

    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    return { success: true };
  } catch (error) {
    console.error('Failed to save sync config:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Test SSH connection to server
 */
export async function testConnection(config) {
  const { host, port = 22, user, path: remotePath } = config;

  try {
    // Validate inputs first
    validateSyncConfig(config);
  } catch (error) {
    return { success: false, error: error.message };
  }

  try {
    // Test SSH connection with simple command
    const result = await execSSH(host, port, user, "echo 'Connection OK'", SSH_TIMEOUT_MS);

    if (!result.success) {
      return parseSSHError(result.error);
    }

    if (result.stdout.trim() === 'Connection OK') {
      // Test if remote path exists (or can be created)
      if (remotePath) {
        const pathResult = await execSSH(
          host,
          port,
          user,
          `mkdir -p "${remotePath}" && test -d "${remotePath}" && echo 'Path OK'`,
          SSH_TIMEOUT_MS
        );

        if (!pathResult.success || pathResult.stdout.trim() !== 'Path OK') {
          return { success: false, error: 'Remote path does not exist and could not be created' };
        }
      }

      return { success: true, message: 'Connection successful' };
    } else {
      return { success: false, error: result.stderr || 'Connection failed' };
    }
  } catch (error) {
    console.error('SSH connection test failed:', error);
    return parseSSHError(error);
  }
}

/**
 * Parse common SSH errors into user-friendly messages
 */
function parseSSHError(error) {
  const errorMessage = error.message || error.stderr || 'Unknown error';

  if (errorMessage.includes('Permission denied')) {
    return { success: false, error: 'Permission denied - check SSH keys' };
  } else if (errorMessage.includes('Connection refused')) {
    return { success: false, error: 'Connection refused - check host and port' };
  } else if (errorMessage.includes('Host key verification failed')) {
    return { success: false, error: 'Host key verification failed - run: ssh-keyscan -H <host> >> ~/.ssh/known_hosts' };
  } else if (errorMessage.includes('No route to host')) {
    return { success: false, error: 'No route to host - check network and firewall' };
  } else if (errorMessage.includes('timeout')) {
    return { success: false, error: 'Connection timeout - server may be down or unreachable' };
  } else if (errorMessage.includes('rsync: command not found')) {
    return { success: false, error: 'rsync is not installed. Install it with: sudo pacman -S rsync' };
  } else {
    return { success: false, error: errorMessage.substring(0, 200) };
  }
}

/**
 * Perform sync to server
 */
export async function performSync(config, projectPath) {
  const { host, port = 22, user, path: remotePath, syncDatabases, syncSnapshots, syncConfig } = config;

  // Check if sync already in progress
  if (syncInProgress) {
    return { success: false, error: 'Sync already in progress' };
  }

  try {
    // Validate inputs
    validateSyncConfig(config);
  } catch (error) {
    return { success: false, error: error.message };
  }

  // Check if rsync is installed
  const rsyncCheck = await checkRsyncInstalled();
  if (!rsyncCheck.installed) {
    return { success: false, error: rsyncCheck.message };
  }

  try {
    syncInProgress = true;
    syncCancelRequested = false;

    const ravenDir = path.join(projectPath, '.raven');

    if (!existsSync(ravenDir)) {
      return { success: false, error: '.raven directory not found in project' };
    }

    // Build rsync include/exclude patterns
    const includes = [];
    const excludes = ['--exclude=*']; // Exclude everything by default

    if (syncDatabases) {
      includes.push('--include=db/', '--include=db/**');
    }

    if (syncSnapshots) {
      includes.push('--include=snapshots/', '--include=snapshots/**');
    }

    if (syncConfig) {
      includes.push('--include=config/', '--include=config/**');
    }

    // Always include base .raven directory
    includes.unshift('--include=.raven/');

    // Build rsync arguments array (safer than string concatenation)
    const rsyncArgs = [
      '-avz',                           // Archive, verbose, compress
      '--delete',                        // Delete files on dest that don't exist on source
      '-e', `ssh -p ${port}`,           // SSH with custom port (FIXED: removed extra quotes)
      ...includes,
      ...excludes,
      `${ravenDir}/`,                   // Source (trailing slash important!)
      `${user}@${host}:${remotePath}/`  // Destination
    ];

    console.log('Running rsync with args:', rsyncArgs);

    const startTime = Date.now();

    // Execute rsync with timeout
    const rsyncPromise = execFileAsync('rsync', rsyncArgs, { maxBuffer: RSYNC_MAX_BUFFER });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Sync timeout after ${RSYNC_TIMEOUT_MS}ms`)), RSYNC_TIMEOUT_MS)
    );

    const { stdout, stderr } = await Promise.race([rsyncPromise, timeoutPromise]);

    const duration = Date.now() - startTime;

    // Check if cancelled
    if (syncCancelRequested) {
      return { success: false, error: 'Sync cancelled by user' };
    }

    // Parse rsync output for statistics
    const stats = parseRsyncOutput(stdout);

    // Save to history
    const syncRecord = {
      timestamp: new Date().toISOString(),
      status: 'success',
      size: stats.totalSize || 0,
      files: stats.filesTransferred || 0,
      duration,
      host,
      remotePath
    };

    await addToHistory(syncRecord);

    return {
      success: true,
      size: stats.totalSize,
      files: stats.filesTransferred,
      duration,
      stats
    };

  } catch (error) {
    console.error('Sync failed:', error);

    // Save failed sync to history
    const syncRecord = {
      timestamp: new Date().toISOString(),
      status: 'failed',
      error: error.message || 'Unknown error',
      host,
      remotePath
    };

    await addToHistory(syncRecord);

    // Parse error for user-friendly message
    const parsedError = parseSSHError(error);

    return {
      success: false,
      error: parsedError.error || error.message || 'Sync failed'
    };
  } finally {
    syncInProgress = false;
    syncCancelRequested = false;
    currentSyncProcess = null;
  }
}

/**
 * Cancel ongoing sync operation
 */
export async function cancelSync() {
  if (!syncInProgress) {
    return { success: false, error: 'No sync in progress' };
  }

  syncCancelRequested = true;

  // Kill the process if it exists
  if (currentSyncProcess && currentSyncProcess.pid) {
    try {
      process.kill(currentSyncProcess.pid, 'SIGTERM');
    } catch (error) {
      console.error('Failed to kill sync process:', error);
    }
  }

  return { success: true, message: 'Sync cancellation requested' };
}

/**
 * Parse rsync output for statistics
 */
function parseRsyncOutput(output) {
  const stats = {
    filesTransferred: 0,
    totalSize: 0
  };

  try {
    // Look for "sent X bytes  received Y bytes"
    const sentMatch = output.match(/sent ([\d,]+) bytes/);
    const receivedMatch = output.match(/received ([\d,]+) bytes/);

    if (sentMatch) {
      const sent = parseInt(sentMatch[1].replace(/,/g, ''));
      stats.totalSize = sent;
    }

    // Count files transferred (lines that start with file operations)
    const fileLines = output.split('\n').filter(line => {
      return line.match(/^(sending|deleting|>f\+{9})/);
    });
    stats.filesTransferred = fileLines.length;

    // Try to find "total size" line
    const totalSizeMatch = output.match(/total size is ([\d,]+)/);
    if (totalSizeMatch) {
      stats.totalSize = parseInt(totalSizeMatch[1].replace(/,/g, ''));
    }

  } catch (error) {
    console.error('Failed to parse rsync output:', error);
  }

  return stats;
}

/**
 * Add sync record to history
 */
async function addToHistory(record) {
  try {
    let history = [];

    if (existsSync(SYNC_HISTORY_FILE)) {
      const data = await readFile(SYNC_HISTORY_FILE, 'utf-8');
      history = JSON.parse(data);
    }

    // Add new record at the beginning
    history.unshift(record);

    // Keep only last N records
    history = history.slice(0, MAX_HISTORY_RECORDS);

    await writeFile(SYNC_HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (error) {
    console.error('Failed to save sync history:', error);
  }
}

/**
 * Get SSH key path (looks for common key locations)
 */
export function getSSHKeyPath() {
  const homeDir = os.homedir();
  const commonKeys = [
    'raven-sync',
    'id_ed25519',
    'id_rsa',
    'id_ecdsa'
  ];

  for (const keyName of commonKeys) {
    const keyPath = path.join(homeDir, '.ssh', keyName);
    if (existsSync(keyPath)) {
      return keyPath;
    }
  }

  return null;
}

/**
 * Check if SSH is configured properly
 */
export async function checkSSHSetup() {
  const sshDir = path.join(os.homedir(), '.ssh');

  if (!existsSync(sshDir)) {
    return {
      configured: false,
      message: 'SSH directory not found. Run: mkdir -p ~/.ssh && chmod 700 ~/.ssh'
    };
  }

  const keyPath = getSSHKeyPath();

  if (!keyPath) {
    return {
      configured: false,
      message: 'No SSH key found. Generate one with: ssh-keygen -t ed25519 -f ~/.ssh/raven-sync -C "raven-backup"'
    };
  }

  return {
    configured: true,
    keyPath,
    message: 'SSH is configured'
  };
}

/**
 * Get remote storage statistics (OPTIMIZED: single SSH call instead of N+3)
 */
export async function getRemoteStorageStats(config) {
  const { host, port = 22, user, path: remotePath } = config;

  try {
    // Validate inputs
    validateSyncConfig(config);
  } catch (error) {
    return { success: false, error: error.message };
  }

  try {
    // Single SSH command that gathers ALL stats at once
    const combinedCommand = `
      cd "${remotePath}" 2>/dev/null || exit 1;
      echo "TOTAL_SIZE:$(du -sb . 2>/dev/null | cut -f1)";
      for dir in */; do
        if [ -d "\${dir}" ]; then
          dirname="\${dir%/}";
          size=$(du -sb "\${dir}" 2>/dev/null | cut -f1);
          files=$(find "\${dir}" -type f 2>/dev/null | wc -l);
          mtime=$(stat -c %Y "\${dir}" 2>/dev/null || echo 0);
          echo "PROJECT:\${dirname}|\${size}|\${files}|\${mtime}";
        fi;
      done
    `;

    const result = await execSSH(host, port, user, combinedCommand, STATS_TIMEOUT_MS);

    if (!result.success) {
      return { success: false, error: 'Failed to connect to server' };
    }

    const lines = result.stdout.split('\n').filter(l => l.trim());

    let totalSize = 0;
    const projects = [];

    for (const line of lines) {
      if (line.startsWith('TOTAL_SIZE:')) {
        totalSize = parseInt(line.split(':')[1]) || 0;
      } else if (line.startsWith('PROJECT:')) {
        const data = line.substring(8); // Remove "PROJECT:"
        const [name, size, files, mtime] = data.split('|');

        if (name) {
          projects.push({
            name,
            size: parseInt(size) || 0,
            files: parseInt(files) || 0,
            lastModified: parseInt(mtime) > 0 ? new Date(parseInt(mtime) * 1000).toISOString() : null
          });
        }
      }
    }

    return {
      success: true,
      totalSize,
      projects: projects.sort((a, b) => b.size - a.size),
      remotePath,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Failed to get remote storage stats:', error);
    return {
      success: false,
      error: error.message || 'Failed to get storage statistics'
    };
  }
}
