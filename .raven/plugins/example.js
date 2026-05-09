/**
 * Example Raven plugin.
 *
 * Plugins are plain JavaScript files dropped into .raven/plugins/.
 * The `raven` global is the API surface:
 *   - raven.on('file' | 'agent' | 'token-usage', handler)
 *   - raven.trigger(name, { message, severity, ...payload })
 *   - raven.log / raven.warn / raven.error
 *
 * No require, no fs, no network — pure rules over the event stream.
 *
 * This example fires a trigger when more than 50 file events land
 * in the same project within 60 seconds (a possible runaway loop).
 */
const recent = [];
raven.on('file', (event) => {
  const now = Date.now();
  recent.push({ project: event.projectName, ts: now });
  while (recent.length && now - recent[0].ts > 60_000) recent.shift();
  const counts = {};
  for (const e of recent) {
    if (!e.project) continue;
    counts[e.project] = (counts[e.project] || 0) + 1;
  }
  for (const [project, n] of Object.entries(counts)) {
    if (n > 50) {
      raven.trigger('runaway_edits', {
        message: project + ' had ' + n + ' file events in the last minute',
        severity: 'warning',
        project: project,
        count: n
      });
    }
  }
});
