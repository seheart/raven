/**
 * Utilities for validating component props and providing helpful warnings
 */

/**
 * Validates that a variant prop is one of the allowed values
 * @param {string} variant - The variant to validate
 * @param {string[]} validVariants - Array of valid variant names
 * @param {string} componentName - Name of the component for error messages
 * @returns {string} The validated variant (or first valid variant as fallback)
 */
export function validateVariant(variant, validVariants, componentName = 'Component') {
  if (!validVariants.includes(variant)) {
    console.warn(
      `[${componentName}] Invalid variant "${variant}". Valid options: ${validVariants.join(', ')}. Falling back to "${validVariants[0]}".`
    );
    return validVariants[0];
  }
  return variant;
}

/**
 * Validates that a size prop is one of the allowed values
 * @param {string} size - The size to validate
 * @param {string[]} validSizes - Array of valid size names
 * @param {string} componentName - Name of the component for error messages
 * @returns {string} The validated size (or 'md' as fallback)
 */
export function validateSize(size, validSizes, componentName = 'Component') {
  if (!validSizes.includes(size)) {
    const defaultSize = validSizes.includes('md') ? 'md' : validSizes[0];
    console.warn(
      `[${componentName}] Invalid size "${size}". Valid options: ${validSizes.join(', ')}. Falling back to "${defaultSize}".`
    );
    return defaultSize;
  }
  return size;
}

/**
 * Validates that a numeric value is within a specified range
 * @param {number} value - The value to validate
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @param {string} propName - Name of the prop for error messages
 * @param {string} componentName - Name of the component for error messages
 * @returns {number} The clamped value
 */
export function validateRange(value, min, max, propName = 'value', componentName = 'Component') {
  const numValue = Number(value);

  if (isNaN(numValue)) {
    console.warn(
      `[${componentName}] Invalid ${propName}: "${value}" is not a number. Using ${min}.`
    );
    return min;
  }

  if (numValue < min) {
    console.warn(
      `[${componentName}] ${propName} ${numValue} is below minimum ${min}. Clamping to ${min}.`
    );
    return min;
  }

  if (numValue > max) {
    console.warn(
      `[${componentName}] ${propName} ${numValue} exceeds maximum ${max}. Clamping to ${max}.`
    );
    return max;
  }

  return numValue;
}

/**
 * Validates that an array prop is actually an array
 * @param {*} value - The value to validate
 * @param {string} propName - Name of the prop for error messages
 * @param {string} componentName - Name of the component for error messages
 * @returns {Array} The validated array (or empty array as fallback)
 */
export function validateArray(value, propName = 'items', componentName = 'Component') {
  if (!Array.isArray(value)) {
    console.warn(
      `[${componentName}] ${propName} must be an array. Received ${typeof value}. Using empty array.`
    );
    return [];
  }
  return value;
}

/**
 * Validates that a required prop is provided
 * @param {*} value - The value to validate
 * @param {string} propName - Name of the prop for error messages
 * @param {string} componentName - Name of the component for error messages
 * @returns {boolean} Whether the prop is valid
 */
export function validateRequired(value, propName = 'prop', componentName = 'Component') {
  if (value === undefined || value === null || value === '') {
    console.error(`[${componentName}] Required prop "${propName}" is missing or empty.`);
    return false;
  }
  return true;
}

/**
 * Validates that a callback prop is a function
 * @param {*} callback - The callback to validate
 * @param {string} propName - Name of the prop for error messages
 * @param {string} componentName - Name of the component for error messages
 * @returns {Function|null} The validated callback or null
 */
export function validateCallback(callback, propName = 'callback', componentName = 'Component') {
  if (callback === undefined || callback === null) {
    return null;
  }

  if (typeof callback !== 'function') {
    console.warn(
      `[${componentName}] ${propName} must be a function. Received ${typeof callback}. Ignoring.`
    );
    return null;
  }

  return callback;
}

/**
 * Validates that an object has required properties
 * @param {object} obj - The object to validate
 * @param {string[]} requiredProps - Array of required property names
 * @param {string} objectName - Name of the object for error messages
 * @param {string} componentName - Name of the component for error messages
 * @returns {boolean} Whether all required props are present
 */
export function validateObjectShape(
  obj,
  requiredProps,
  objectName = 'object',
  componentName = 'Component'
) {
  if (typeof obj !== 'object' || obj === null) {
    console.error(`[${componentName}] ${objectName} must be an object. Received ${typeof obj}.`);
    return false;
  }

  const missingProps = requiredProps.filter(prop => !(prop in obj));

  if (missingProps.length > 0) {
    console.warn(
      `[${componentName}] ${objectName} is missing required properties: ${missingProps.join(', ')}`
    );
    return false;
  }

  return true;
}

/**
 * Standard valid sizes for most components
 */
export const VALID_SIZES = ['sm', 'md', 'lg'];

/**
 * Standard valid sizes for spinners (includes xl)
 */
export const VALID_SPINNER_SIZES = ['sm', 'md', 'lg', 'xl'];

/**
 * Common button variants
 */
export const VALID_BUTTON_VARIANTS = ['primary', 'secondary', 'ghost', 'danger', 'success'];

/**
 * Common color variants
 */
export const VALID_COLOR_VARIANTS = ['default', 'primary', 'success', 'error', 'warning', 'info'];
