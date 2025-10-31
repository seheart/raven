/**
 * Plugin System for Raven
 * Allows extending Raven functionality without modifying core code
 * 
 * @example
 * const plugin = {
 *   name: 'slack-notifier',
 *   version: '1.0.0',
 *   hooks: {
 *     onAgentEvent: async (event, ctx) => {
 *       if (event.severity === 'critical') {
 *         await ctx.slack.send({ text: event.message })
 *       }
 *     }
 *   }
 * }
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger.js';
import fs from 'fs';
import { join } from 'path';

export class PluginManager extends EventEmitter {
  constructor(pluginsDir = '.raven/plugins') {
    super();
    this.pluginsDir = pluginsDir;
    this.plugins = new Map();
    this.hooks = new Map();
    this.enabled = new Set();
  }

  /**
   * Initialize plugin system
   */
  async initialize() {
    logger.info('Initializing plugin system', { pluginsDir: this.pluginsDir });
    
    // Create plugins directory if it doesn't exist
    if (!fs.existsSync(this.pluginsDir)) {
      fs.mkdirSync(this.pluginsDir, { recursive: true });
    }

    // Register available hooks
    this.registerHooks([
      'onAgentEvent',
      'onFileChange',
      'onMetric',
      'onSessionStart',
      'onSessionEnd',
      'onError',
      'onNotification'
    ]);

    // Load plugins
    await this.loadPlugins();
  }

  /**
   * Register available hooks
   * @param {string[]} hookNames - Array of hook names
   */
  registerHooks(hookNames) {
    for (const hookName of hookNames) {
      if (!this.hooks.has(hookName)) {
        this.hooks.set(hookName, []);
      }
    }
  }

  /**
   * Load all plugins from plugins directory
   */
  async loadPlugins() {
    if (!fs.existsSync(this.pluginsDir)) {
      return;
    }

    const entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginPath = join(this.pluginsDir, entry.name);
        await this.loadPlugin(pluginPath);
      }
    }

    logger.info('Plugins loaded', { count: this.plugins.size });
  }

  /**
   * Load a single plugin
   * @param {string} pluginPath - Path to plugin directory
   */
  async loadPlugin(pluginPath) {
    try {
      const manifestPath = join(pluginPath, 'plugin.json');
      
      if (!fs.existsSync(manifestPath)) {
        logger.warn('Plugin manifest not found', { pluginPath });
        return;
      }

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      
      // Validate manifest
      if (!manifest.name || !manifest.version) {
        throw new Error('Invalid plugin manifest: name and version required');
      }

      // Load plugin code
      const indexPath = join(pluginPath, manifest.main || 'index.js');
      
      if (!fs.existsSync(indexPath)) {
        throw new Error(`Plugin entry point not found: ${indexPath}`);
      }

      const plugin = await import(indexPath);
      
      // Register plugin
      this.plugins.set(manifest.name, {
        ...manifest,
        path: pluginPath,
        instance: plugin.default || plugin
      });

      // Register hooks
      if (plugin.hooks) {
        for (const [hookName, handler] of Object.entries(plugin.hooks)) {
          if (this.hooks.has(hookName)) {
            this.hooks.get(hookName).push({
              plugin: manifest.name,
              handler
            });
          }
        }
      }

      logger.info('Plugin loaded', { 
        name: manifest.name,
        version: manifest.version
      });

      this.emit('plugin:loaded', manifest.name);

    } catch (error) {
      logger.error('Failed to load plugin', { 
        pluginPath,
        error: error.message
      });
    }
  }

  /**
   * Enable a plugin
   * @param {string} pluginName - Name of plugin to enable
   */
  enablePlugin(pluginName) {
    if (!this.plugins.has(pluginName)) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }

    this.enabled.add(pluginName);
    logger.info('Plugin enabled', { plugin: pluginName });
    this.emit('plugin:enabled', pluginName);
  }

  /**
   * Disable a plugin
   * @param {string} pluginName - Name of plugin to disable
   */
  disablePlugin(pluginName) {
    this.enabled.delete(pluginName);
    logger.info('Plugin disabled', { plugin: pluginName });
    this.emit('plugin:disabled', pluginName);
  }

  /**
   * Execute hook with data
   * @param {string} hookName - Name of hook to execute
   * @param {*} data - Data to pass to hook handlers
   * @param {*} context - Context object with utilities
   */
  async executeHook(hookName, data, context = {}) {
    if (!this.hooks.has(hookName)) {
      return;
    }

    const handlers = this.hooks.get(hookName);
    
    for (const { plugin, handler } of handlers) {
      // Skip disabled plugins
      if (!this.enabled.has(plugin)) {
        continue;
      }

      try {
        await handler(data, context);
      } catch (error) {
        logger.error('Plugin hook execution failed', {
          plugin,
          hook: hookName,
          error: error.message
        });
      }
    }
  }

  /**
   * Get list of installed plugins
   * @returns {Array} Array of plugin info
   */
  getPlugins() {
    return Array.from(this.plugins.values()).map(p => ({
      name: p.name,
      version: p.version,
      description: p.description,
      author: p.author,
      enabled: this.enabled.has(p.name)
    }));
  }

  /**
   * Unload all plugins
   */
  async unloadAll() {
    logger.info('Unloading all plugins');
    this.plugins.clear();
    this.hooks.forEach(handlers => handlers.length = 0);
    this.enabled.clear();
  }
}

export default PluginManager;
