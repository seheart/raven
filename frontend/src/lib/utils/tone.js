/**
 * Maps a narrative beat "tone" to its Tailwind text-color class.
 *
 * Shared across the persona card and the daily/weekly digest cards so they
 * can't drift apart on what `accent`/`success`/`info`/`warning` look like.
 *
 * @param {string} tone
 * @returns {string}
 */
export function toneClass(tone) {
  switch (tone) {
    case 'accent':
      return 'text-accent';
    case 'success':
      return 'text-success';
    case 'info':
      return 'text-info';
    case 'warning':
      return 'text-warning';
    default:
      return 'text-muted';
  }
}
