/**
 * @file NotificationContext.jsx
 * @description React context for toast notification management.
 * Provides methods to show success, error, warning, and info notifications.
 * Registers global notification functions for use outside of React components.
 */

import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { registerNotificationFns } from "../utils/notify";

/** @type {React.Context<Object>} Notification context */
const NotificationContext = createContext();

/** @type {number} Auto-incrementing ID for notifications */
let notifId = 0;

/**
 * Provider component for toast notifications.
 * Manages notification state and auto-dismiss timers.
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  /** @type {Object<number, number>} Map of notification IDs to timer IDs */
  const timersRef = useRef({});

  /**
   * Removes a notification by ID and clears its timer.
   * @param {number} id - Notification ID to remove
   */
  const removeNotification = useCallback((id) => {
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  /**
   * Adds a new notification with optional auto-dismiss.
   * @param {string} message - Notification message
   * @param {string} [type='success'] - Notification type (success, error, warning, info)
   * @param {number} [duration=4500] - Auto-dismiss duration in ms (0 to disable)
   * @returns {number} Notification ID
   */
  const addNotification = useCallback(
    (message, type = "success", duration = 4500) => {
      const id = ++notifId;
      const notification = { id, message, type, visible: true };
      setNotifications((prev) => [...prev, notification]);

      if (duration > 0) {
        timersRef.current[id] = setTimeout(() => {
          removeNotification(id);
        }, duration);
      }

      return id;
    },
    [removeNotification]
  );

  const success = useCallback((message, duration) => addNotification(message, "success", duration), [addNotification]);
  const error = useCallback((message, duration) => addNotification(message, "error", duration), [addNotification]);
  const warning = useCallback((message, duration) => addNotification(message, "warning", duration), [addNotification]);
  const info = useCallback((message, duration) => addNotification(message, "info", duration), [addNotification]);

  /** Clears all notifications and their timers */
  const clearAll = useCallback(() => {
    Object.values(timersRef.current).forEach(clearTimeout);
    timersRef.current = {};
    setNotifications([]);
  }, []);

  // Register notification functions globally for use outside React
  useEffect(() => {
    registerNotificationFns({ success, error, warning, info });
  }, [success, error, warning, info]);

  const value = useMemo(
    () => ({ notifications, addNotification, removeNotification, success, error, warning, info, clearAll }),
    [notifications, addNotification, removeNotification, success, error, warning, info, clearAll]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

/**
 * Hook to access notification methods.
 * @returns {Object} Notification methods: success, error, warning, info, addNotification, removeNotification, clearAll
 * @throws {Error} If used outside NotificationProvider
 */
export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotification must be used within NotificationProvider");
  return ctx;
}
