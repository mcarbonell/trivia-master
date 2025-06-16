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

// Analytics
let analytics: FirebaseAnalytics | null = null;
if (typeof window !== 'undefined') {
  isAnalyticsSupported().then(supported => {
    if (supported && firebaseConfig.measurementId) {
      analytics = getAnalytics(app);
      console.log("Firebase Analytics initialized.");
    } else {
      console.log("Firebase Analytics not supported or measurementId missing.");
    }
  });
}

// Export a logEvent function that uses the initialized analytics instance
const logEvent = (eventName: string, eventParams?: { [key: string]: any }) => {
  if (analytics) {
    firebaseLogEvent(analytics, eventName, eventParams);
  } else {
    // console.log(`Analytics not initialized. Event "${eventName}" not logged.`, eventParams);
  }
};

export { app, db, auth, analytics, logEvent };
