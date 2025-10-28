// Keyboard shortcut service for Raven
// Provides centralized keyboard event handling

export class KeyboardService {
  constructor() {
    this.handlers = new Map();
    this.listening = false;
  }

  /**
   * Register a keyboard shortcut handler
   * @param {string} key - The key to listen for (e.g., '?', 'Escape', 'Enter')
   * @param {Function} handler - Function to call when key is pressed
   * @param {Object} options - Additional options (ctrlKey, shiftKey, altKey, metaKey)
   */
  register(key, handler, options = {}) {
    const id = this._generateId(key, options);
    this.handlers.set(id, { key, handler, options });

    if (!this.listening) {
      this.start();
    }

    return () => this.unregister(id);
  }

  /**
   * Unregister a keyboard shortcut
   */
  unregister(id) {
    this.handlers.delete(id);

    if (this.handlers.size === 0) {
      this.stop();
    }
  }

  /**
   * Start listening for keyboard events
   */
  start() {
    if (this.listening) return;

    this.handleKeyDown = (e) => {
      // Don't trigger shortcuts when typing in input fields
      const isInputField = e.target.tagName === 'INPUT' ||
                          e.target.tagName === 'TEXTAREA' ||
                          e.target.isContentEditable;

      // Exception: Escape key should work in input fields
      if (isInputField && e.key !== 'Escape') {
        return;
      }

      // eslint-disable-next-line no-unused-vars
      for (const [__, { key, handler, options }] of this.handlers) {
        if (this._matchesShortcut(e, key, options)) {
          e.preventDefault();
          handler(e);
          break;
        }
      }
    };

    window.addEventListener('keydown', this.handleKeyDown);
    this.listening = true;
  }

  /**
   * Stop listening for keyboard events
   */
  stop() {
    if (!this.listening) return;

    window.removeEventListener('keydown', this.handleKeyDown);
    this.listening = false;
  }

  /**
   * Clear all registered handlers
   */
  clear() {
    this.handlers.clear();
    this.stop();
  }

  _generateId(key, options) {
    const modifiers = [
      options.ctrlKey ? 'ctrl' : '',
      options.shiftKey ? 'shift' : '',
      options.altKey ? 'alt' : '',
      options.metaKey ? 'meta' : ''
    ].filter(Boolean).join('+');

    return modifiers ? `${modifiers}+${key}` : key;
  }

  _matchesShortcut(event, key, options) {
    // Check key match
    if (event.key.toLowerCase() !== key.toLowerCase()) {
      return false;
    }

    // Check modifiers
    if (options.ctrlKey && !event.ctrlKey) return false;
    if (options.shiftKey && !event.shiftKey) return false;
    if (options.altKey && !event.altKey) return false;
    if (options.metaKey && !event.metaKey) return false;

    // Ensure no extra modifiers
    if (!options.ctrlKey && event.ctrlKey) return false;
    if (!options.shiftKey && event.shiftKey) return false;
    if (!options.altKey && event.altKey) return false;
    if (!options.metaKey && event.metaKey) return false;

    return true;
  }
}

// Singleton instance
export const keyboard = new KeyboardService();
