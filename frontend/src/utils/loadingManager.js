/**
 * @file loadingManager.js
 * @description Debounced global loading state manager to prevent flicker on fast requests.
 * Tracks multiple concurrent loading operations and provides a unified loading state.
 */

/** @type {number} Count of active loading operations */
let loadCount = 0;
/** @type {number|null} Timer ID for debounced hide */
let timeoutId = null;
/** @type {Set<Function>} Set of listener functions to notify on loading state change */
const listeners = new Set();
/** @type {Function|null} React state setter for loading state */
let reactSetter = null;

/**
 * Registers a React state setter to be notified of loading state changes.
 * @param {Function} setter - React setState function for loading state
 */
export function setLoadingManager(setter) {
  reactSetter = setter;
}

/**
 * Notifies all listeners of current loading state.
 */
function notify() {
  const loading = loadCount > 0;
  for (const fn of listeners) fn(loading);
  if (reactSetter) reactSetter(loading);
}

/**
 * Shows global loading indicator and increments loading count.
 * Clears any pending hide timeout.
 */
export function showGlobalLoading() {
  clearTimeout(timeoutId);
  loadCount++;
  notify();
}

/**
 * Hides global loading indicator and decrements loading count.
 * Uses 300ms debounce to prevent flicker on fast requests.
 */
export function hideGlobalLoading() {
  if (loadCount > 0) loadCount--;
  clearTimeout(timeoutId);
  timeoutId = setTimeout(() => {
    if (loadCount === 0) notify();
  }, 300);
}

/**
 * Subscribes to loading state changes.
 * @param {Function} fn - Callback function receiving boolean loading state
 * @returns {Function} Unsubscribe function
 */
export function subscribeLoading(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
