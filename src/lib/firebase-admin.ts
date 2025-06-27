// src/lib/firebase-admin.ts
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import admin from 'firebase-admin';

// Avoid re-initializing the app in hot-reload environments
if (!admin.apps.length) {
  try {
    // This relies on the GOOGLE_APPLICATION_CREDENTIALS environment variable
    // being set in the environment where the server runs.
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
    console.log('Firebase Admin SDK Initialized with Storage Bucket.');
  } catch (error: any) {
    if (error.code === 'app/invalid-credential' && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
      console.error('Firebase Admin SDK initialization failed. Make sure your `GOOGLE_APPLICATION_CREDENTIALS` environment variable is set correctly. This is required for server-side admin operations.');
    } else {
       console.error('Firebase Admin SDK initialization error:', error);
    }
  }
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export const adminStorage = admin.storage();
