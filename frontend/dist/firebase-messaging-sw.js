/* eslint-disable no-undef */
// Firebase Messaging Service Worker
// Handles background/terminated-state push notifications
// Receives Firebase config from the main app via postMessage

let firebaseConfig = null;

// Listen for config from main app
self.addEventListener("message", (event) => {
  if (event.data?.type === "FIREBASE_CONFIG") {
    firebaseConfig = event.data.config;
    initFirebaseMessaging();
  }
});

// Also try loading from static config file (fallback)
importScripts("firebase-config.js");
if (self.__FIREBASE_CONFIG?.apiKey && !firebaseConfig) {
  firebaseConfig = self.__FIREBASE_CONFIG;
  // Delay init slightly to allow postMessage to arrive first
  setTimeout(() => {
    if (!firebaseConfig?.messaging) initFirebaseMessaging();
  }, 100);
}

function initFirebaseMessaging() {
  if (!firebaseConfig || !firebaseConfig.apiKey) return;
  if (firebaseConfig.messaging) return; // already initialized

  importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

  firebase.initializeApp(firebaseConfig);
  firebaseConfig.messaging = firebase.messaging();

  // Handle background messages
  firebaseConfig.messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || payload.data?.title || "PMS Notification";
    const options = {
      body: payload.notification?.body || payload.data?.body || "",
      icon: "/TX.png",
      badge: "/TX.ico",
      tag: payload.data?.tag || "pms-background-notification",
      data: {
        url: payload.data?.url || "/",
        ...payload.data,
      },
    };

    self.registration.showNotification(title, options);
  });
}

// Handle notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});
