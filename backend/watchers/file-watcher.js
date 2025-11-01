import { join } from 'path';

/**
 * Create a chokidar watcher for a single project.
 *
 * @param {object} params
 * @param {string} params.projectName
 * @param {string} params.projectPath
 * @param {object} params.LIMITS - constants from config
 * @param {function} params.handleFileChange - (eventType, filepath) => void
 * @param {object} params.logger - logger instance
 * @param {import('socket.io').Server} params.io - socket.io server
 * @param {object} params.chokidar - chokidar module
 * @returns {import('chokidar').FSWatcher}
 */
export function createFileWatcher({ projectName, projectPath, LIMITS, handleFileChange, logger, io, chokidar }) {
  // Default ignore patterns
  const defaultIgnored = [
    /(^|[\/\\])\../, // Ignore dotfiles
    '**/node_modules/**',
    '**/.git/**',
    '**/target/**',
    '**/.raven/**',
    '**/*.log',
    '**/dist/**',
    '**/build/**',
    '**/.cache/**',
    '**/.next/**',
    '**/.turbo/**',
    '**/.svelte-kit/**',
    '**/coverage/**',
    '**/.DS_Store',
    // Python virtual environments
    '**/venv/**',
    '**/.venv/**',
    '**/env/**',
    '**/virtualenv/**',
    '**/__pycache__/**',
    '**/*.pyc',
    '**/*.pyo',
    '**/site-packages/**',
    '**/dist-packages/**'
  ];

  // Allow custom ignore patterns via environment variable (comma-separated)
  const customIgnored = process.env.CHOKIDAR_IGNORE_PATTERNS
    ? process.env.CHOKIDAR_IGNORE_PATTERNS.split(',').map(p => p.trim())
    : [];

  // macOS-optimized configuration for file watching
  const isMacOS = process.platform === 'darwin';

  // Special handling for raven project to avoid watching its own node_modules
  const isRavenProject = projectName === 'raven';

  // For raven project, only watch specific directories to avoid node_modules
  const watchPaths = isRavenProject ? [
    join(projectPath, 'docs'),
    join(projectPath, 'test_workspace'),
    join(projectPath, 'backend/*.js'),      // Only .js files in backend root
    join(projectPath, 'frontend/src'),      // Only src directory
    join(projectPath, '*.md'),              // Root markdown files
    join(projectPath, '*.sh')              // Shell scripts
  ] : projectPath;

  const watcher = chokidar.watch(watchPaths, {
    ignored: [...defaultIgnored, ...customIgnored],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: LIMITS.FILE.WATCH_DEBOUNCE_MS
    },
    // macOS-specific optimizations
    usePolling: false,           // Use native FSEvents on macOS
    useFsEvents: isMacOS,         // Enable FSEvents API on macOS for better performance
    depth: 99,
    ignorePermissionErrors: true  // Ignore permission errors on macOS
  });

  watcher
    .on('add', filepath => {
      handleFileChange('create', filepath);
    })
    .on('change', filepath => {
      handleFileChange('edit', filepath);
    })
    .on('unlink', filepath => {
      handleFileChange('delete', filepath);
    })
    .on('error', error => {
      logger.error(`❌ Watcher error [${projectName}]:`, error);

      // Emit file watcher error via WebSocket
      io.emit('file-watcher-error', {
        project: projectName,
        timestamp: new Date().toISOString(),
        message: error.message || 'File watcher encountered an error',
        error: error.toString()
      });
    })
    .on('ready', () => {
      logger.info('File watcher ready', { projectName });
    });

  return watcher;
}


