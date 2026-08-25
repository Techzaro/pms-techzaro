/**
 * @file notify.js
 * @description Global notification utility for showing toast notifications.
 * Provides a decoupled notification API that can be used anywhere in the app.
 */

/** @type {Object} References to notification functions registered by the provider */
let notifyRef = { success: null, error: null, warning: null, info: null };

/**
 * Registers notification functions from the NotificationProvider.
 * Must be called by the provider to enable the global notify API.
 * @param {Object} fns - Object containing success, error, warning, info functions
 */
export function registerNotificationFns(fns) {
  notifyRef.success = fns.success;
  notifyRef.error = fns.error;
  notifyRef.warning = fns.warning;
  notifyRef.info = fns.info;
}

/**
 * Global notification API for showing toast messages.
 * Use this instead of directly calling context methods.
 */
export const notify = {
  /**
   * Shows a success notification.
   * @param {string} msg - Message to display
   * @param {number} [dur] - Duration in milliseconds
   */
  success: (msg, dur) => notifyRef.success?.(msg, dur),
  /**
   * Shows an error notification.
   * @param {string} msg - Message to display
   * @param {number} [dur] - Duration in milliseconds
   */
  error: (msg, dur) => notifyRef.error?.(msg, dur),
  /**
   * Shows a warning notification.
   * @param {string} msg - Message to display
   * @param {number} [dur] - Duration in milliseconds
   */
  warning: (msg, dur) => notifyRef.warning?.(msg, dur),
  /**
   * Shows an info notification.
   * @param {string} msg - Message to display
   * @param {number} [dur] - Duration in milliseconds
   */
  info: (msg, dur) => notifyRef.info?.(msg, dur),
};

export const toast = notify;

/**
 * Shows a context-based success message.
 * @param {string} entity - Entity name (e.g. "Task", "Project", "Event")
 * @param {string} action - Action performed (e.g. "created", "updated", "deleted")
 * @example showSuccessMessage("Task", "created") // "Task created successfully"
 */
export function showSuccessMessage(entity, action) {
  notify.success(`${entity} ${action} successfully`);
}

/**
 * Shows a context-based error message.
 * @param {string} entity - Entity name (e.g. "Task", "Project", "Event")
 * @param {string} action - Action that failed (e.g. "create", "update", "delete")
 * @example showErrorMessage("Task", "create") // "Failed to create task"
 */
export function showErrorMessage(entity, action) {
  notify.error(`Failed to ${action} ${entity.toLowerCase()}`);
}
