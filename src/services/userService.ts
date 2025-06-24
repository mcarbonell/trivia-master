// src/services/userService.ts
'use server';

import { db } from '@/lib/firebase';
import { doc, setDoc, getDoc, serverTimestamp, type DocumentData } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import type { UserData } from '@/types';

const USERS_COLLECTION = 'users';

/**
 * Creates a user profile document in Firestore.
 * This is typically called right after a user signs up.
 * @param user - The Firebase Auth User object.
 */
export async function createUserProfile(user: User): Promise<void> {
  const userRef = doc(db, USERS_COLLECTION, user.uid);
  const userProfile: Omit<UserData, 'createdAt'> & { createdAt: any } = {
    uid: user.uid,
    email: user.email || '',
    role: 'user', // Default role for new sign-ups
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(userRef, userProfile);
    console.log(`[userService] User profile created for UID: ${user.uid}`);
  } catch (error) {
    console.error(`[userService] Error creating user profile for UID ${user.uid}:`, error);
    throw new Error('Failed to create user profile.');
  }
}

/**
 * Fetches a user's profile from Firestore.
 * @param uid - The user's UID.
 * @returns The user's data or null if not found.
 */
export async function getUserProfile(uid: string): Promise<UserData | null> {
  const userRef = doc(db, USERS_COLLECTION, uid);
  try {
    const docSnap = await getDoc(userRef);
    if (docSnap.exists()) {
      return docSnap.data() as UserData;
    } else {
      console.warn(`[userService] No user profile found for UID: ${uid}`);
      return null;
    }
  } catch (error) {
    console.error(`[userService] Error fetching user profile for UID ${uid}:`, error);
    throw new Error('Failed to fetch user profile.');
  }
}
