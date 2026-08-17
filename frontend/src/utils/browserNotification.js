/**
 * @file browserNotification.js
 * @description Browser notification utilities using the Web Notifications API.
 * Handles permission requests, showing native browser/desktop notifications
 * with sound, and tracking shown notifications to prevent duplicates.
 */

/** @type {Set<number>} Set of notification IDs already shown as desktop notifications */
const shownNotificationIds = new Set();

/** @type {AudioContext|null} Cached AudioContext for notification sound */
let audioContext = null;

/**
 * Plays a notification sound using Web Audio API.
 * Generates a pleasant two-tone chime similar to messaging apps.
 */
function playNotificationSound() {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioContext;
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.setValueAtTime(1100, now + 0.1);
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(660, now + 0.15);
    osc2.frequency.setValueAtTime(880, now + 0.25);
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0.25, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.45);
  } catch {
    // Silently fail - sound is optional
  }
}

/**
 * Requests browser notification permission from the user.
 * MUST be called from a user gesture (click handler) to work in modern browsers.
 * @returns {Promise<string>} The permission result: 'granted', 'denied', or 'default'
 */
export async function requestNotificationPermissionAsync() {
  if (!('Notification' in window)) {
    console.warn('[PMS Notifications] Notifications API not supported in this browser');
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    console.log('[PMS Notifications] Permission already granted');
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    console.warn('[PMS Notifications] Permission was previously denied by user');
    return 'denied';
  }

  try {
    const result = await Notification.requestPermission();
    console.log('[PMS Notifications] Permission request result:', result);
    return result;
  } catch (e) {
    console.error('[PMS Notifications] Permission request failed:', e);
    return 'denied';
  }
}

/**
 * Check if browser notifications are currently supported and permitted.
 * @returns {boolean}
 */
export function isNotificationSupported() {
  return 'Notification' in window && Notification.permission === 'granted';
}

/**
 * Returns the current notification permission state.
 * @returns {'granted'|'denied'|'default'}
 */
export function getNotificationPermission() {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}

/**
 * Shows a native browser/desktop notification.
 * @param {string} title - Notification title
 * @param {Object} [options={}] - Additional notification options
 * @param {string} [options.body] - Notification body text
 * @param {string} [options.tag] - Tag to identify the notification
 * @param {string} [options.icon] - Icon URL
 * @param {string} [options.url] - URL to navigate to when notification is clicked
 * @param {boolean} [options.silent] - If true, no sound
 * @returns {Notification|undefined} The Notification object if successful
 */
export function showBrowserNotification(title, options = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    console.warn('[PMS Notifications] Cannot show - permission not granted:', Notification.permission);
    return undefined;
  }

  try {
    const n = new Notification(title, {
      icon: options.icon || '/TX.png',
      badge: '/TX.ico',
      tag: options.tag || 'pms-notification',
      body: options.body || '',
      silent: options.silent || false,
      ...options,
    });

    if (!options.silent) {
      playNotificationSound();
    }

    if (options.url) {
      n.onclick = () => {
        window.focus();
        window.location.href = options.url;
        n.close();
      };
    }

    setTimeout(() => {
      try { n.close(); } catch { /* already closed */ }
    }, 8000);

    return n;
  } catch (e) {
    console.error('[PMS Notifications] Browser notification error:', e);
    return undefined;
  }
}

/**
 * Mark a notification ID as already shown to prevent duplicates.
 * @param {number} id - The notification ID
 */
export function markNotificationShown(id) {
  shownNotificationIds.add(id);
}

/**
 * Check if a notification has already been shown.
 * @param {number} id - The notification ID
 * @returns {boolean}
 */
export function isNotificationShown(id) {
  return shownNotificationIds.has(id);
}

/**
 * Reset the shown notifications tracking (e.g., on logout).
 */
export function resetShownNotifications() {
  shownNotificationIds.clear();
}

/**
 * Shows a desktop notification for a PMS notification object.
 * Handles all the common fields from the API notification resource.
 *
 * @param {Object} notification - Notification object from API
 * @param {number} notification.id - Notification ID
 * @param {string} notification.title - Notification title
 * @param {string} notification.message - Notification message
 * @param {string} [notification.type] - Notification type
 * @param {string} [notification.link] - Navigation link
 * @param {string} [notification.related_module] - Related module name
 * @param {number} [notification.related_id] - Related entity ID
 * @param {Object} [notification.sender] - Sender user object
 * @returns {Notification|undefined}
 */
export function showDesktopNotification(notification) {
  if (!notification || !notification.id) return;
  if (isNotificationShown(notification.id)) return;

  const title = notification.title || 'PMS Notification';
  const body = notification.message || '';
  const senderName = notification.sender?.name || '';

  const baseUrl = window.location.origin;
  let url = `${window.location.href}`;

  if (notification.link || notification.related_id) {
    const destination = getNotificationDestination(notification);
    url = new URL(destination, baseUrl).toString();
  }

  console.log('[PMS Notifications] Showing desktop notification:', { title, body, url });

  const n = showBrowserNotification(title, {
    body: senderName ? `${senderName}: ${body}` : body,
    tag: `pms-notif-${notification.id}`,
    url: url,
    silent: false,
  });

  if (n) {
    markNotificationShown(notification.id);
  }

  return n;
}
import { getNotificationDestination } from "./navigation";
