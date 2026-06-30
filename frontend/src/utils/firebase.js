/**
 * @file firebase.js
 * @description Firebase Cloud Messaging (FCM) initialization and token management.
 * Handles push notification setup and device token registration with the backend.
 */

import { authToken } from "./auth";
import API_URL from "../config/api";

/** @type {Object|null} Firebase Cloud Messaging instance */
let messaging = null;

/**
 * Initializes Firebase and requests FCM token for push notifications.
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

    const app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);

    // Get FCM registration token
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    });

    if (token) {
      await sendDeviceToken(token);
    }

    // Handle foreground messages
    onMessage(messaging, (payload) => {
      console.log("FCM foreground message received:", payload);
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
    });
  } catch {
    // Silently fail - token registration is not critical
  }
}
