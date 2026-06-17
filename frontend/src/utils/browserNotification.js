let permissionGranted = false;

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

export function showBrowserNotification(title, options = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  try {
    const n = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: options.tag || 'pms-notification',
      ...options,
    });

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
