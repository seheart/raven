/**
 * Create and register a GitMonitor for a project.
 *
 * @param {object} params
 * @param {string} params.projectName
 * @param {string} params.projectPath
 * @param {Map<string, any>} params.projectGitMonitors
 * @param {any} params.GitMonitor - GitMonitor class
 * @param {object} params.logger
 * @returns {any} The GitMonitor instance
 */
export function createAndRegisterGitMonitor({ projectName, projectPath, projectGitMonitors, GitMonitor, logger }) {
  const gitMonitor = new GitMonitor({
    repoPath: projectPath,
    pollIntervalMs: 2000,
    enableAutoPoll: false
  });
  projectGitMonitors.set(projectName, gitMonitor);
  logger?.debug?.('GitMonitor initialized', { projectName, projectPath });
  return gitMonitor;
}

/**
 * Emit real-time git status update via WebSocket for a specific project.
 *
 * @param {object} params
 * @param {string} params.projectName
 * @param {Map<string, any>} params.projectGitMonitors
 * @param {import('socket.io').Server} params.io
 * @param {object} params.logger
 */
export async function emitGitStatusUpdate({ projectName, projectGitMonitors, io, logger }) {
  const gitMonitor = projectGitMonitors.get(projectName);
  if (!gitMonitor) return;

  try {
    const isRepo = await gitMonitor.isGitRepo();
    if (!isRepo) return;

    const previousStatus = gitMonitor.lastStatus;
    gitMonitor.lastStatus = null;
    const status = await gitMonitor.checkStatus();
    if (!status && previousStatus) {
      gitMonitor.lastStatus = previousStatus;
    }

    if (status) {
      io.emit('git-status-updated', {
        project: projectName,
        branch: status.branch,
        modified: status.modified,
        created: status.created,
        deleted: status.deleted,
        ahead: status.ahead || 0,
        behind: status.behind || 0,
        timestamp: new Date().toISOString()
      });
      logger?.debug?.('Git status emitted via WebSocket', { projectName });
    }
  } catch (error) {
    logger?.error?.('Error emitting git status', { error, projectName });
  }
}


