/**
 * Standard size system for consistent sizing across all components
 * Use these constants to ensure buttons, inputs, badges, etc. align properly
 */

export const STANDARD_SIZES = {
  sm: {
    padding: 'px-3 py-1.5',
    fontSize: 'text-sm',
    height: 'h-8',
    gap: 'gap-1.5'
  },
  md: {
    padding: 'px-4 py-2',
    fontSize: 'text-base',
    height: 'h-10',
    gap: 'gap-2'
  },
  lg: {
    padding: 'px-6 py-3',
    fontSize: 'text-lg',
    height: 'h-12',
    gap: 'gap-2.5'
  }
};

/**
 * Badge-specific sizes (smaller scale for inline elements)
 */
export const BADGE_SIZES = {
  sm: {
    padding: 'px-1.5 py-0.5',
    fontSize: 'text-[10px]'
  },
  md: {
    padding: 'px-2 py-1',
    fontSize: 'text-[11px]'
  },
  lg: {
    padding: 'px-3 py-1.5',
    fontSize: 'text-xs'
  }
};

/**
 * Spinner-specific sizes (width/height for loading indicators)
 */
export const SPINNER_SIZES = {
  sm: {
    size: 'w-4 h-4',
    border: 'border-2'
  },
  md: {
    size: 'w-6 h-6',
    border: 'border-2'
  },
  lg: {
    size: 'w-8 h-8',
    border: 'border-3'
  },
  xl: {
    size: 'w-12 h-12',
    border: 'border-4'
  }
};

/**
 * Theme color variants (CSS variable references)
 */
export const THEME_COLORS = {
  accent: 'var(--accent)',
  error: 'var(--error)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  info: 'var(--info)',
  muted: 'var(--muted)',
  text: 'var(--text)',
  textHeading: 'var(--text-heading)',
  surface: 'var(--surface)',
  surface2: 'var(--surface-2)',
  border: 'var(--border)',
  inputBg: 'var(--input-bg)',
  inputText: 'var(--input-text)'
};

/**
 * Standard z-index values for overlay components
 */
export const Z_INDEX = {
  dropdown: 50,
  modal: 50,
  toast: 50,
  tooltip: 50
};

/**
 * Standard spacing values
 */
export const SPACING = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  '2xl': '3rem'
};

/**
 * Helper to get size classes for a component
 * @param {string} size - 'sm', 'md', or 'lg'
 * @param {object} sizeMap - Custom size map or STANDARD_SIZES
 * @returns {string} Combined size classes
 */
export function getSizeClasses(size = 'md', sizeMap = STANDARD_SIZES) {
  const sizeConfig = sizeMap[size] || sizeMap.md;
  return Object.values(sizeConfig).join(' ');
}
