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
 * Standard valid sizes for most components
 */
export const VALID_SIZES = ['sm', 'md', 'lg'];

/**
 * Common button variants
 */
export const VALID_BUTTON_VARIANTS = ['primary', 'secondary', 'ghost', 'danger', 'success'];
