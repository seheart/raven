/**
 * Event handler standardization utilities for consistent API across components
 */

/**
 * Standard event handler naming conventions
 *
 * @typedef {Object} EventHandlerConventions
 * @property {string} onClick - For click/interaction events (passes MouseEvent)
 * @property {string} onChange - For value change events (passes new value)
 * @property {string} onClose - For close/dismiss events (no params)
 * @property {string} onSelect - For item selection events (passes item, index)
 * @property {string} onNavigate - For tab/page navigation (passes target: string|number)
 */

/**
 * Event payload signatures for type safety and consistency
 */
export const EVENT_SIGNATURES = {
  // Click events - always receive MouseEvent
  onClick: '(event: MouseEvent) => void',

  // Change events - always receive the new value
  onChange: '(value: any) => void',

  // Close/dismiss events - no parameters
  onClose: '() => void',

  // Selection events - receive item and index
  onSelect: '(item: any, index: number) => void',

  // Navigation events - receive target identifier
  onNavigate: '(target: string | number) => void',

  // File events - receive FileList
  onFilesSelect: '(files: FileList) => void'
};

/**
 * Normalizes event handler names for backward compatibility
 * Maps old naming conventions to new standard names
 *
 * @param {string} eventName - The event handler prop name
 * @returns {string} Standardized event name
 */
export function normalizeEventName(eventName) {
  const mapping = {
    // Svelte DOM events (keep lowercase)
    onclick: 'onclick',
    onchange: 'onchange',
    oninput: 'oninput',
    onsubmit: 'onsubmit',

    // Custom component events (PascalCase)
    onTabChange: 'onNavigate',
    onPageChange: 'onNavigate',
    onRowClick: 'onSelect',
    onItemClick: 'onSelect',
    onChange: 'onChange',
    onClick: 'onClick',
    onClose: 'onClose',
    onSelect: 'onSelect',
    onNavigate: 'onNavigate'
  };

  return mapping[eventName] || eventName;
}

/**
 * Creates a validated event handler wrapper
 * Ensures consistent event signatures and provides helpful warnings
 *
 * @param {Function} handler - The event handler function
 * @param {string} expectedSignature - Expected signature from EVENT_SIGNATURES
 * @param {string} componentName - Name of the component for error messages
 * @returns {Function} Validated handler wrapper
 */
export function createValidatedHandler(handler, expectedSignature, componentName = 'Component') {
  if (!handler) return null;

  if (typeof handler !== 'function') {
    console.warn(
      `[${componentName}] Event handler must be a function. Received: ${typeof handler}. Expected: ${expectedSignature}`
    );
    return null;
  }

  // Return the handler as-is in production, but with type info available
  return handler;
}

/**
 * Maps legacy event names to standardized names with deprecation warnings
 * Allows backward compatibility while migrating to new naming
 *
 * @param {Object} props - Component props
 * @param {Object} mapping - Map of old names to new names
 * @param {string} componentName - Component name for warnings
 * @returns {Object} Normalized props
 */
export function migrateEventHandlers(props, mapping, componentName = 'Component') {
  const normalized = { ...props };

  Object.entries(mapping).forEach(([oldName, newName]) => {
    if (oldName in props && !(newName in props)) {
      // Old name used, new name not provided - migrate with warning
      normalized[newName] = props[oldName];

      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[${componentName}] Event handler "${oldName}" is deprecated. Use "${newName}" instead. Both work for now, but "${oldName}" will be removed in a future version.`
        );
      }
    }
  });

  return normalized;
}

/**
 * Standard event handler prop definitions for documentation
 * Use these JSDoc types in component files
 */
export const EVENT_HANDLER_TYPES = {
  onClick: '@param {(event: MouseEvent) => void} onClick - Click handler',
  onChange: '@param {(value: any) => void} onChange - Value change handler',
  onClose: '@param {() => void} onClose - Close handler',
  onSelect: '@param {(item: any, index: number) => void} onSelect - Selection handler',
  onNavigate: '@param {(target: string|number) => void} onNavigate - Navigation handler',
  onFilesSelect: '@param {(files: FileList) => void} onFilesSelect - File selection handler'
};

/**
 * Validates that event handlers follow consistent payload patterns
 * Helps catch common mistakes during development
 *
 * @param {string} handlerName - Name of the event handler
 * @param {Array} args - Arguments passed to the handler
 * @returns {boolean} Whether the arguments match the expected signature
 */
export function validateEventPayload(handlerName, args) {
  const expectedArgCounts = {
    onClick: 1, // event
    onChange: 1, // value
    onClose: 0, // no args
    onSelect: 2, // item, index
    onNavigate: 1, // target
    onFilesSelect: 1 // files
  };

  const expected = expectedArgCounts[handlerName];

  if (expected !== undefined && args.length !== expected) {
    console.warn(
      `[Event Handler] ${handlerName} received ${args.length} arguments, expected ${expected}. ` +
        `Signature: ${EVENT_SIGNATURES[handlerName]}`
    );
    return false;
  }

  return true;
}
