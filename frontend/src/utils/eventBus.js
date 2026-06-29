/**
 * @file eventBus.js
 * @description Simple publish-subscribe event bus for inter-component communication.
 * Allows components to communicate without direct parent-child relationships.
 */

/** @type {Object<string, Function[]>} Map of event names to listener arrays */
const listeners = {};

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
 * Publishes an event with data to all subscribed listeners.
 * Errors in listeners are caught and logged without stopping other listeners.
 * @param {string} event - Event name to publish
 * @param {*} data - Data to pass to all listeners
 */
export function publish(event, data) {
  (listeners[event] || []).forEach((fn) => {
    try { fn(data); } catch (e) { console.error(`EventBus[${event}]`, e); }
  });
}
