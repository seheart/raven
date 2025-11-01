import { join, isAbsolute } from 'path';
import fs from 'fs';

/**
 * Initialize a single project (database, paths, git monitor)
 */
export function initializeProject({
  projectName,
  availableProjects,
  RAVEN_DIR,
  RavenDB,
  projectPaths,
  projectSnapshotDirs,
  projectDatabases,
  createAndRegisterGitMonitor,
  projectGitMonitors,
  GitMonitor,
  logger
}) {
  try {
    const project = availableProjects.find(p => p.name === projectName);
    if (!project) {
      logger.error(`❌ Project "${projectName}" not found`);
      return false;
    }

    const projectPath = isAbsolute(project.path)
      ? project.path
      : join(process.cwd(), '..', '..', project.path);
    const dbPath = join(RAVEN_DIR, 'db', `${projectName}.db`);
    const snapshotsDir = join(RAVEN_DIR, 'snapshots', projectName);

    projectPaths.set(projectName, projectPath);
    projectSnapshotDirs.set(projectName, snapshotsDir);

    const db = new RavenDB(dbPath);
    projectDatabases.set(projectName, db);

    fs.mkdirSync(snapshotsDir, { recursive: true });

    createAndRegisterGitMonitor({
      projectName,
      projectPath,
      projectGitMonitors,
      GitMonitor,
      logger
    });

    logger.info('Initialized project', {
      projectName,
      watchPath: projectPath,
      database: dbPath,
      snapshots: snapshotsDir
    });

    return true;
  } catch (error) {
    logger.error('Error initializing project', { error, projectName });
    return false;
  }
}

/**
 * Initialize ALL discovered projects for global monitoring
 */
export function initializeAllProjects({ availableProjects, initializeProject, logger }) {
  logger.info('Initializing projects for global monitoring', { projectCount: availableProjects.length });

  let successCount = 0;
  let failCount = 0;

  for (const project of availableProjects) {
    const success = initializeProject(project.name);
    if (success) successCount++; else failCount++;
  }

  logger.info('Project initialization complete', {
    successful: successCount,
    failed: failCount,
    total: availableProjects.length
  });

  return { successCount, failCount };
}
