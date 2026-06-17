import { authToken } from "./auth";
import API_URL from "../config/api";

let messaging = null;

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

    if (!firebaseConfig.apiKey) {
      console.warn("Firebase config missing — skipping FCM registration");
      return;
    }

    const app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);

    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    });

    if (token) {
      await sendDeviceToken(token);
    }

    onMessage(messaging, (payload) => {
      console.log("FCM foreground message received:", payload);
    });
  } catch (e) {
    console.warn("Firebase init failed:", e);
  }
}

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
    // silently fail
  }
}
