# Raven Plugin System

The Raven plugin system allows you to extend Raven's functionality without modifying core code.

## Plugin Structure

Each plugin is a directory containing:

```
plugin-name/
├── plugin.json      # Plugin manifest
├── index.js         # Plugin implementation
└── README.md        # Plugin documentation (optional)
```

## Plugin Manifest (plugin.json)

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "What this plugin does",
  "author": "Your Name",
  "main": "index.js",
  "hooks": ["onAgentEvent", "onFileChange"]
}
```

## Plugin Implementation (index.js)

```javascript
export const hooks = {
  async onAgentEvent(event, ctx) {
    // Handle agent events
  },

  async onFileChange(change, ctx) {
    // Handle file changes
  }
};

export default { hooks };
```

## Available Hooks

| Hook | Description | Data |
|------|-------------|------|
| `onAgentEvent` | Agent telemetry event received | `{ type, project, ...}` |
| `onFileChange` | File changed in monitored project | `{ path, type, content }` |
| `onMetric` | System metric collected | `{ cpu, memory, ... }` |
| `onSessionStart` | Coding session started | `{ sessionId, project }` |
| `onSessionEnd` | Coding session ended | `{ sessionId, duration }` |
| `onError` | Error occurred | `{ error, context }` |
| `onNotification` | Notification sent | `{ type, message }` |

## Context Object

The `ctx` parameter provides utilities:

```javascript
{
  logger,      // Winston logger
  db,          // Database access
  io,          // Socket.IO instance
  config,      // Raven config
  // Add more as needed
}
```

## Example Plugins

### Slack Notifier

```javascript
export const hooks = {
  async onAgentEvent(event, ctx) {
    if (event.severity === 'critical') {
      await fetch('https://hooks.slack.com/...', {
        method: 'POST',
        body: JSON.stringify({
          text: `🚨 Critical event: ${event.message}`
        })
      });
    }
  }
};
```

### Custom Metrics Exporter

```javascript
export const hooks = {
  async onMetric(metric, ctx) {
    // Send to external monitoring service
    await ctx.externalService.send(metric);
  }
};
```

## Installing Plugins

1. Create plugin directory: `.raven/plugins/my-plugin/`
2. Add `plugin.json` and `index.js`
3. Restart Raven
4. Enable plugin: `raven plugin enable my-plugin`

## Plugin Management API

### Enable Plugin
```bash
POST /api/plugins/:name/enable
```

### Disable Plugin
```bash
POST /api/plugins/:name/disable
```

### List Plugins
```bash
GET /api/plugins
```

## Security Considerations

- Plugins run with full Raven permissions
- Only install trusted plugins
- Review plugin code before installation
- Plugins can access your monitored code

## Best Practices

1. **Error Handling**: Wrap hook code in try-catch
2. **Performance**: Keep hooks fast (< 100ms)
3. **Logging**: Use `ctx.logger` for structured logs
4. **Configuration**: Store config in plugin directory
5. **Testing**: Write tests for your plugin

## Future Features (Planned)

- [ ] Plugin marketplace
- [ ] Plugin sandboxing
- [ ] Plugin dependencies
- [ ] Hot-reload plugins
- [ ] Plugin UI components

## Contributing

Submit your plugins to the community repository:
https://github.com/raven-monitor/plugins
