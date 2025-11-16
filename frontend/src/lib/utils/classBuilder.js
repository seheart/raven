/**
 * Utilities for building consistent CSS class strings across components
 */

import { STANDARD_SIZES } from './standardSizes.js';

/**
 * Form input styling constants
 */
export const FORM_INPUT_STYLES = {
  base: 'w-full rounded-lg border font-sans transition-all duration-200 outline-none',
  stateError:
    'border-[var(--error)] focus:border-[var(--error)] focus:ring-2 focus:ring-[var(--error)] focus:ring-opacity-20',
  stateNormal:
    'border-[var(--border)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-20',
  color: 'bg-[var(--input-bg)] text-[var(--input-text)]',
  placeholder: 'placeholder:text-[var(--muted)]',
  disabled: 'opacity-50 cursor-not-allowed'
};

/**
 * Label styling for form fields
 */
export const FORM_LABEL_STYLES = {
  base: 'block text-sm font-medium text-[var(--text-heading)] mb-1.5 font-sans',
  required: 'text-[var(--error)]'
};

/**
 * Helper text styling for form fields
 */
export const FORM_HELPER_STYLES = {
  base: 'text-xs mt-1.5 font-sans',
  normal: 'text-[var(--muted)]',
  error: 'text-[var(--error)]'
};

/**
 * Builds form input classes with consistent styling
 * @param {Object} options
 * @param {string} options.size - 'sm', 'md', or 'lg'
 * @param {boolean} options.error - Whether the input has an error
 * @param {boolean} options.disabled - Whether the input is disabled
 * @param {boolean} options.fullWidth - Whether the input should be full width
 * @param {boolean} options.hasIcon - Whether the input has an icon (adds left padding)
 * @param {string} options.className - Additional custom classes
 * @returns {string} Combined class string
 */
export function buildFormInputClasses({
  size = 'md',
  error = false,
  disabled = false,
  fullWidth = true,
  hasIcon = false,
  className = ''
} = {}) {
  const sizeConfig = STANDARD_SIZES[size] || STANDARD_SIZES.md;
  const stateClass = error ? FORM_INPUT_STYLES.stateError : FORM_INPUT_STYLES.stateNormal;
  const disabledClass = disabled ? FORM_INPUT_STYLES.disabled : '';
  const widthClass = fullWidth ? 'w-full' : '';
  const iconPadding = hasIcon ? 'pl-10' : '';

  return `${FORM_INPUT_STYLES.base} ${sizeConfig.padding} ${sizeConfig.fontSize} ${stateClass} ${FORM_INPUT_STYLES.color} ${FORM_INPUT_STYLES.placeholder} ${disabledClass} ${widthClass} ${iconPadding} ${className}`
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Builds form label classes
 * @param {Object} options
 * @param {string} options.className - Additional custom classes
 * @returns {string} Combined class string
 */
export function buildFormLabelClasses({ className = '' } = {}) {
  return `${FORM_LABEL_STYLES.base} ${className}`.trim();
}

/**
 * Builds form helper text classes
 * @param {Object} options
 * @param {boolean} options.error - Whether this is error text
 * @param {string} options.className - Additional custom classes
 * @returns {string} Combined class string
 */
export function buildFormHelperClasses({ error = false, className = '' } = {}) {
  const stateClass = error ? FORM_HELPER_STYLES.error : FORM_HELPER_STYLES.normal;
  return `${FORM_HELPER_STYLES.base} ${stateClass} ${className}`.trim();
}

/**
 * Builds button classes with consistent styling
 * @param {Object} options
 * @param {string} options.variant - Button variant
 * @param {string} options.size - 'sm', 'md', or 'lg'
 * @param {boolean} options.disabled - Whether button is disabled
 * @param {string} options.className - Additional custom classes
 * @returns {string} Combined class string
 */
export function buildButtonClasses({
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = ''
} = {}) {
  const baseClasses =
    'inline-flex items-center justify-center rounded border font-semibold transition-all duration-200 outline-none font-sans';

  const variants = {
    primary:
      'bg-[var(--accent)] text-white border-[var(--accent)] hover:bg-opacity-90 focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-50',
    secondary:
      'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--accent)] hover:bg-opacity-10 focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-50',
    ghost:
      'bg-transparent text-[var(--text)] border-transparent hover:bg-[var(--accent)] hover:bg-opacity-10 focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-50',
    danger:
      'bg-[var(--error)] text-white border-[var(--error)] hover:bg-opacity-90 focus:ring-2 focus:ring-[var(--error)] focus:ring-opacity-50',
    success:
      'bg-[var(--success)] text-white border-[var(--success)] hover:bg-opacity-90 focus:ring-2 focus:ring-[var(--success)] focus:ring-opacity-50'
  };

  const sizeConfig = STANDARD_SIZES[size] || STANDARD_SIZES.md;
  const variantClass = variants[variant] || variants.primary;
  const disabledClass = disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : '';

  return `${baseClasses} ${sizeConfig.padding} ${sizeConfig.fontSize} ${sizeConfig.gap} ${variantClass} ${disabledClass} ${className}`
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Builds hover classes for interactive elements (tables, lists, etc.)
 * @param {boolean} hoverable - Whether the element should have hover effects
 * @returns {string} Hover class string
 */
export function buildHoverClasses(hoverable = false) {
  return hoverable
    ? 'hover:bg-[var(--accent)] hover:bg-opacity-5 transition-colors duration-150'
    : '';
}

/**
 * Builds clickable element classes (for keyboard navigation)
 * @param {boolean} clickable - Whether the element is clickable
 * @returns {string} Clickable class string
 */
export function buildClickableClasses(clickable = false) {
  return clickable
    ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-50'
    : '';
}

/**
 * Generic class builder that combines multiple class strings
 * @param  {...string} classes - Class strings to combine
 * @returns {string} Combined and normalized class string
 */
export function cx(...classes) {
  return classes.filter(Boolean).join(' ').trim().replace(/\s+/g, ' ');
}

/**
 * Builds badge classes with consistent styling
 * @param {Object} options
 * @param {string} options.variant - Badge variant
 * @param {string} options.size - 'sm', 'md', or 'lg'
 * @param {boolean} options.pill - Pill shape (fully rounded)
 * @param {string} options.className - Additional custom classes
 * @returns {string} Combined class string
 */
export function buildBadgeClasses({
  variant = 'default',
  size = 'md',
  pill = false,
  className = ''
} = {}) {
  const baseClasses = 'inline-flex items-center font-sans font-medium border';

  const variants = {
    default: 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)]',
    primary: 'bg-[var(--accent)] bg-opacity-15 text-[var(--accent)] border-[var(--accent)]',
    success: 'bg-[var(--success)] bg-opacity-15 text-[var(--success)] border-[var(--success)]',
    error: 'bg-[var(--error)] bg-opacity-15 text-[var(--error)] border-[var(--error)]',
    warning: 'bg-[var(--warning)] bg-opacity-15 text-[var(--warning)] border-[var(--warning)]',
    info: 'bg-[var(--info)] bg-opacity-15 text-[var(--info)] border-[var(--info)]'
  };

  const sizeConfig =
    { sm: 'px-1.5 py-0.5 text-[10px]', md: 'px-2 py-1 text-[11px]', lg: 'px-3 py-1.5 text-xs' }[
      size
    ] || 'px-2 py-1 text-[11px]';
  const shape = pill ? 'rounded-full' : 'rounded';
  const variantClass = variants[variant] || variants.default;

  return cx(baseClasses, variantClass, sizeConfig, shape, className);
}

/**
 * Builds card classes with consistent styling
 * @param {Object} options
 * @param {string} options.variant - Card variant
 * @param {boolean} options.hoverable - Add hover effects
 * @param {boolean} options.clickable - Add clickable styles
 * @param {string} options.className - Additional custom classes
 * @returns {string} Combined class string
 */
export function buildCardClasses({
  variant = 'default',
  hoverable = false,
  clickable = false,
  className = ''
} = {}) {
  const baseClasses = 'bg-[var(--surface)] font-sans';

  const variants = {
    default: 'border border-[var(--border)] rounded-lg p-6 shadow-sm',
    compact: 'border border-[var(--border)] rounded-lg p-4 shadow-sm',
    flat: 'rounded-lg p-6',
    bordered: 'border-2 border-[var(--border)] rounded-lg p-6'
  };

  const variantClass = variants[variant] || variants.default;
  const hoverClass = buildHoverClasses(hoverable || clickable);
  const clickClass = buildClickableClasses(clickable);

  return cx(baseClasses, variantClass, hoverClass, clickClass, className);
}

/**
 * Builds table classes with consistent styling
 * @param {Object} options
 * @param {string} options.variant - Table variant
 * @param {boolean} options.striped - Striped rows
 * @param {boolean} options.hoverable - Hoverable rows
 * @param {string} options.className - Additional custom classes
 * @returns {string} Combined class string
 */
export function buildTableClasses({
  variant = 'default',
  _striped = false,
  _hoverable = false,
  className = ''
} = {}) {
  const baseClasses = 'w-full font-sans';

  const variants = {
    default: 'border border-[var(--border)]',
    bordered: 'border-2 border-[var(--border)]',
    borderless: '',
    compact: 'border border-[var(--border)]'
  };

  const variantClass = variants[variant] || variants.default;

  return cx(baseClasses, variantClass, className);
}

/**
 * Builds progress bar classes
 * @param {Object} options
 * @param {string} options.variant - Progress variant
 * @param {string} options.size - 'sm', 'md', or 'lg'
 * @param {string} options.className - Additional custom classes
 * @returns {string} Combined class string
 */
export function buildProgressClasses({ variant = 'primary', size = 'md', className = '' } = {}) {
  const variants = {
    primary: 'bg-[var(--accent)]',
    success: 'bg-[var(--success)]',
    error: 'bg-[var(--error)]',
    warning: 'bg-[var(--warning)]',
    info: 'bg-[var(--info)]'
  };

  const sizes = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3'
  };

  const variantClass = variants[variant] || variants.primary;
  const sizeClass = sizes[size] || sizes.md;

  return cx('rounded-full transition-all duration-300', variantClass, sizeClass, className);
}

/**
 * Builds spinner classes
 * @param {Object} options
 * @param {string} options.variant - Spinner color variant
 * @param {string} options.size - 'sm', 'md', 'lg', or 'xl'
 * @param {string} options.className - Additional custom classes
 * @returns {string} Combined class string
 */
export function buildSpinnerClasses({ variant = 'primary', size = 'md', className = '' } = {}) {
  const variants = {
    primary: 'border-[var(--accent)] border-t-transparent',
    success: 'border-[var(--success)] border-t-transparent',
    error: 'border-[var(--error)] border-t-transparent',
    warning: 'border-[var(--warning)] border-t-transparent',
    muted: 'border-[var(--muted)] border-t-transparent'
  };

  const sizes = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-3',
    xl: 'w-12 h-12 border-4'
  };

  const variantClass = variants[variant] || variants.primary;
  const sizeClass = sizes[size] || sizes.md;

  return cx('rounded-full animate-spin', variantClass, sizeClass, className);
}
