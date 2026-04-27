/**
 * Debounce utility for Raven
 * Delays function execution until after a specified wait time has passed
 * since the last invocation
 */

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * @param {Function} func - The function to debounce
 * @param {number} wait - The number of milliseconds to delay (default: 300)
 * @param {boolean} immediate - Trigger the function on the leading edge instead of trailing
 * @returns {Function} The debounced function with cancel method
 */
export function debounce(func, wait = 300, immediate = false) {
  let timeout;
  let result;

  const debounced = function (...args) {
    const context = this;
    const later = () => {
      timeout = null;
      if (!immediate) {
        result = func.apply(context, args);
      }
    };

    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);

    if (callNow) {
      result = func.apply(context, args);
    }

    return result;
  };

  // Allow cancellation of pending executions
  debounced.cancel = () => {
    clearTimeout(timeout);
    timeout = null;
  };

  // Allow immediate execution, bypassing the debounce
  debounced.flush = function (...args) {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    return func.apply(this, args);
  };

  return debounced;
}

/**
 * Creates a throttled function that only invokes func at most once per every wait milliseconds
 * @param {Function} func - The function to throttle
 * @param {number} wait - The number of milliseconds to throttle invocations to (default: 100)
 * @param {Object} options - Options object { leading: boolean, trailing: boolean }
 * @returns {Function} The throttled function with cancel method
 */
export function throttle(func, wait = 100, options = {}) {
  let timeout;
  let previous = 0;
  let result;
  const { leading = true, trailing = true } = options;

  const throttled = function (...args) {
    const now = Date.now();
    if (!previous && !leading) previous = now;
    const remaining = wait - (now - previous);
    const context = this;

    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      result = func.apply(context, args);
    } else if (!timeout && trailing) {
      timeout = setTimeout(() => {
        previous = leading ? Date.now() : 0;
        timeout = null;
        result = func.apply(context, args);
      }, remaining);
    }

    return result;
  };

  throttled.cancel = () => {
    clearTimeout(timeout);
    previous = 0;
    timeout = null;
  };

  return throttled;
}

