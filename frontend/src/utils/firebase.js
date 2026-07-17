/**
 * @file firebase.js
 * @description Firebase Cloud Messaging (FCM) initialization and token management.
 * Handles push notification setup and device token registration with the backend.
 * Service worker handles background notifications; this module handles foreground.
 */

import { authToken } from "./auth";
import API_URL from "../config/api";

/** @type {Object|null} Firebase Cloud Messaging instance */
let messaging = null;

/**
 * Initializes Firebase, registers the service worker, and requests FCM token.
 * Dynamically imports Firebase SDK to reduce initial bundle size.
 * Skips initialization if Firebase config is not provided.
 */
export async function initFirebase() {
  try {
    const { initializeApp } = await import("firebase/app");
    const { getMessaging, getToken, onMessage } = await import("firebase/messaging");

    const firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };

    // Exit early if Firebase is not configured
    if (!firebaseConfig.apiKey) {
      return;
    }

    // Also inject config into the service worker's shared config file
    if ("serviceWorker" in navigator) {
      try {
        const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
        // Update the service worker with live config
        if (swReg.active) {
          swReg.active.postMessage({ type: "FIREBASE_CONFIG", config: firebaseConfig });
        }
      } catch (e) {
        console.warn("Service worker registration failed:", e);
      }
    }

    const app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);

    // Get FCM registration token
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    });

    if (token) {
      await sendDeviceToken(token);
    }

    // Handle foreground messages — show browser notification when tab is in background
    // or just log when tab is active (in-app UI handles it)
    onMessage(messaging, (payload) => {
      const title = payload.notification?.title || payload.data?.title || "PMS Notification";
      const body = payload.notification?.body || payload.data?.body || "";
      const url = payload.data?.url || "/";

      // If tab is in background, show browser notification
      if (document.hidden) {
        try {
          const n = new Notification(title, {
            icon: "/TX.png",
            badge: "/TX.ico",
            body: body,
            tag: "pms-fg-" + (payload.data?.tag || Date.now()),
          });
          n.onclick = () => {
            window.focus();
            window.location.href = url;
            n.close();
          };
          setTimeout(() => n.close(), 8000);
        } catch (_) {
          // Notifications not supported or blocked
        }
      }
    });
  } catch (e) {
    console.warn("Firebase init failed:", e);
  }
}

/**
 * Sends the FCM device token to the backend server.
 * @param {string} token - FCM registration token
 */
async function sendDeviceToken(token) {
  try {
    const t = authToken();
    if (!t) return;

    await fetch(`${API_URL}/device-tokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${t}`,
      },
      body: JSON.stringify({ device_token: token }),
      _notifHandled: true,
    });
  } catch {
    // Silently fail - token registration is not critical
  }
}
