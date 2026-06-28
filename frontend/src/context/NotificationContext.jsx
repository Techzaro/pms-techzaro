import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { registerNotificationFns } from "../utils/notify";

const NotificationContext = createContext();

let notifId = 0;

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const timersRef = useRef({});

  const removeNotification = useCallback((id) => {
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

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

  const clearAll = useCallback(() => {
    Object.values(timersRef.current).forEach(clearTimeout);
    timersRef.current = {};
    setNotifications([]);
  }, []);

  useEffect(() => {
    registerNotificationFns({ success, error, warning, info });
  }, [success, error, warning, info]);

  return (
    <NotificationContext.Provider
      value={{ notifications, addNotification, removeNotification, success, error, warning, info, clearAll }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotification must be used within NotificationProvider");
  return ctx;
}
