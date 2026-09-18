/**
 * @file notify.js
 * @description Global notification utility for showing toast notifications.
 * Provides a decoupled notification API that can be used anywhere in the app.
 * Automatically translates notification messages using i18n.
 */

import { i18n } from "./i18n";

/** @type {Object} References to notification functions registered by the provider */
let notifyRef = { success: null, error: null, warning: null, info: null };

/**
 * Safely translates a notification message using i18n if available.
 */
function translateMsg(msg) {
  if (typeof msg === "string" && i18n && typeof i18n.t === "function") {
    return i18n.t(msg);
  }
  return msg;
}

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
   * @param {number|Object} [dur] - Duration in milliseconds or options object
   * @param {Object} [opts] - Options object
   */
  success: (msg, dur, opts) => notifyRef.success?.(translateMsg(msg), dur, opts),
  /**
   * Shows an error notification.
   * @param {string} msg - Message to display
   * @param {number|Object} [dur] - Duration in milliseconds or options object
   * @param {Object} [opts] - Options object
   */
  error: (msg, dur, opts) => notifyRef.error?.(translateMsg(msg), dur, opts),
  /**
   * Shows a warning notification.
   * @param {string} msg - Message to display
   * @param {number|Object} [dur] - Duration in milliseconds or options object
   * @param {Object} [opts] - Options object
   */
  warning: (msg, dur, opts) => notifyRef.warning?.(translateMsg(msg), dur, opts),
  /**
   * Shows an info notification.
   * @param {string} msg - Message to display
   * @param {number|Object} [dur] - Duration in milliseconds or options object
   * @param {Object} [opts] - Options object
   */
  info: (msg, dur, opts) => notifyRef.info?.(translateMsg(msg), dur, opts),
};

export const toast = notify;

/**
 * Shows a context-based success message.
 * @param {string} entity - Entity name (e.g. "Task", "Project", "Event")
 * @param {string} action - Action performed (e.g. "created", "updated", "deleted")
 * @example showSuccessMessage("Task", "created") // "Task created successfully"
 */
export function showSuccessMessage(entity, action) {
  const key = `${entity} ${action} successfully`;
  notify.success(key);
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
