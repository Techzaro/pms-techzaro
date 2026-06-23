// Debounced loading manager to prevent flicker on fast requests
let loadCount = 0;
let timeoutId = null;
const listeners = new Set();
let reactSetter = null;

export function setLoadingManager(setter) {
  reactSetter = setter;
}

function notify() {
  const loading = loadCount > 0;
  for (const fn of listeners) fn(loading);
  if (reactSetter) reactSetter(loading);
}

export function showGlobalLoading() {
  clearTimeout(timeoutId);
  loadCount++;
  notify();
}

export function hideGlobalLoading() {
  if (loadCount > 0) loadCount--;
  clearTimeout(timeoutId);
  timeoutId = setTimeout(() => {
    if (loadCount === 0) notify();
  }, 300);
}

export function subscribeLoading(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
