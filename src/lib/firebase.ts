
// src/lib/firebase.ts
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";
import { getAnalytics, logEvent as firebaseLogEvent, isSupported as isAnalyticsSupported, type Analytics as FirebaseAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
// IMPORTANT: Replace with your actual Firebase project configuration.
// Store these in your .env.local file and ensure they are prefixed with NEXT_PUBLIC_
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Required for Analytics
};

// Initialize Firebase
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0]!;
}

const db: Firestore = getFirestore(app);
const auth: Auth = getAuth(app);

// --- Analytics ---
let analytics: FirebaseAnalytics | null = null;
let analyticsPromise: Promise<FirebaseAnalytics | null> | null = null;

/**
 * Gets the singleton Firebase Analytics instance, initializing it if necessary.
 * This function handles the asynchronous nature of analytics initialization.
 * @returns A promise that resolves with the Analytics instance or null if not supported.
 */
const getAnalyticsInstance = (): Promise<FirebaseAnalytics | null> => {
    if (analytics) {
        return Promise.resolve(analytics);
    }
    if (analyticsPromise) {
        return analyticsPromise;
    }
    if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
        analyticsPromise = isAnalyticsSupported().then(supported => {
            if (supported) {
                console.log("Firebase Analytics is supported. Initializing...");
                analytics = getAnalytics(app);
                return analytics;
            }
            console.log("Firebase Analytics is not supported in this environment.");
            return null;
        }).catch(err => {
            console.warn("Firebase Analytics initialization failed:", err);
            return null;
        });
        return analyticsPromise;
    }
    return Promise.resolve(null);
};

// Start the initialization process as soon as this module is loaded.
getAnalyticsInstance();


/**
 * Logs a custom event to Firebase Analytics.
 * It safely handles the case where analytics is not yet initialized or not supported.
 * @param eventName The name of the event to log.
 * @param eventParams Optional parameters for the event.
 */
const logEvent = async (eventName: string, eventParams?: { [key: string]: any }) => {
  try {
    const analyticsInstance = await getAnalyticsInstance();
    if (analyticsInstance) {
      firebaseLogEvent(analyticsInstance, eventName, eventParams);
    } else {
      // Optional: log to console if analytics is not available, useful for debugging
      // console.log(`Analytics not available. Event: ${eventName}`, eventParams);
    }
  } catch (error) {
    console.error("Error logging analytics event:", error);
  }
};

// Note: We export the `analytics` variable, but it might be null initially.
// The `logEvent` function is the safe way to interact with Analytics.
export { app, db, auth, analytics, logEvent };
