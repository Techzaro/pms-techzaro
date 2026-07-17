/**
 * @file eventBus.js
 * @description Publish-subscribe event bus with cross-tab support.
 * Uses localStorage 'storage' event to sync events across browser tabs.
 */

/** @type {Object<string, Function[]>} Map of event names to listener arrays */
const listeners = {};

const STORAGE_KEY = 'pms_event_bus';

/**
 * Subscribes to an event and returns an unsubscribe function.
 * @param {string} event - Event name to subscribe to
 * @param {Function} fn - Callback function to execute when event is published
 * @returns {Function} Unsubscribe function to remove the listener
 */
export function subscribe(event, fn) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(fn);
  return () => {
    listeners[event] = listeners[event].filter((f) => f !== fn);
  };
}

/**
 * Publishes an event with data to all subscribed listeners in this tab
 * and broadcasts to other tabs via localStorage.
 * @param {string} event - Event name to publish
 * @param {*} data - Data to pass to all listeners
 */
export function publish(event, data) {
  (listeners[event] || []).forEach((fn) => {
    try { fn(data); } catch (e) { console.error(`EventBus[${event}]`, e); }
  });

  // Broadcast to other tabs via localStorage
  try {
    const payload = JSON.stringify({ event, data, ts: Date.now() });
    localStorage.setItem(STORAGE_KEY, payload);
    // Remove immediately so the next identical event still triggers storage event
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) { /* ignore quota errors */ }
}

// Cross-tab listener: when another tab publishes an event, we receive it here
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      const { event, data } = JSON.parse(e.newValue);
      (listeners[event] || []).forEach((fn) => {
        try { fn(data); } catch (_) { /* skip */ }
      });
    } catch (_) { /* ignore parse errors */ }
  });
}
