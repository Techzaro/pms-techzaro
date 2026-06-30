/**
 * @file browserNotification.js
 * @description Browser notification utilities using the Web Notifications API.
 * Handles permission requests and displaying native browser notifications.
 */

/** @type {boolean} Whether notification permission has been granted */
let permissionGranted = false;

/**
 * Requests browser notification permission from the user.
 * Does nothing if Notifications API is not supported or permission is already denied.
 */
export function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    permissionGranted = true;
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((p) => {
      permissionGranted = p === 'granted';
    });
  }
}

/**
 * Shows a native browser notification.
 * @param {string} title - Notification title
 * @param {Object} [options={}] - Additional notification options
 * @param {string} [options.tag] - Tag to identify the notification
 * @param {string} [options.url] - URL to navigate to when notification is clicked
 * @returns {Notification|undefined} The Notification object if successful
 */
export function showBrowserNotification(title, options = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  try {
    const n = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: options.tag || 'pms-notification',
      ...options,
    });

    // Handle click to navigate to URL
    if (options.url) {
      n.onclick = () => {
        window.focus();
        window.location.href = options.url;
        n.close();
      };
    }

    return n;
  } catch (e) {
    console.error('Browser notification error:', e);
  }
}
