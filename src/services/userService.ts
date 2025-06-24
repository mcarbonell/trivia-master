// src/services/userService.ts
'use server';

import { db } from '@/lib/firebase'; // Client SDK for existing functions
import { adminDb } from '@/lib/firebase-admin'; // Admin SDK for new functions
import { doc, setDoc, getDoc, serverTimestamp, type DocumentData, type Timestamp } from 'firebase/firestore';
import type { UserData } from '@/types';

/**
 * Creates a user profile document in Firestore.
 * This is typically called right after a user signs up.
 * @param uid - The UID from the Firebase Auth user.
 * @param email - The email from the Firebase Auth user.
 */
export async function createUserProfile(uid: string, email: string | null): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const userProfile: Omit<UserData, 'createdAt'> & { createdAt: any } = {
    uid: uid,
    email: email || '',
    role: 'user', // Default role for new sign-ups
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(userRef, userProfile);
    console.log(`[userService] User profile created for UID: ${uid}`);
  } catch (error) {
    console.error(`[userService] Error creating user profile for UID ${uid}:`, error);
    throw new Error('Failed to create user profile.');
  }
}

/**
 * Fetches a user's profile from Firestore.
 * @param uid - The user's UID.
 * @returns The user's data or null if not found.
 */
export async function getUserProfile(uid: string): Promise<UserData | null> {
  const userRef = doc(db, 'users', uid);
  try {
    const docSnap = await getDoc(userRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      const createdAtTimestamp = data.createdAt as Timestamp;

      const profile: UserData = {
        uid: data.uid,
        email: data.email,
        role: data.role,
        createdAt: createdAtTimestamp.toDate().toISOString(), // Convert Timestamp to ISO string
      };
      return profile;
    } else {
      console.warn(`[userService] No user profile found for UID: ${uid}`);
      return null;
    }
  } catch (error) {
    console.error(`[userService] Error fetching user profile for UID ${uid}:`, error);
    throw new Error('Failed to fetch user profile.');
  }
}

/**
 * Fetches all user profiles from Firestore using the Admin SDK.
 * @returns A promise that resolves to an array of all users' data.
 */
export async function getAllUsers(): Promise<UserData[]> {
  try {
    const usersRef = adminDb.collection('users');
    const snapshot = await usersRef.orderBy('createdAt', 'desc').get();
    
    if (snapshot.empty) {
      return [];
    }
    
    const users: UserData[] = snapshot.docs.map(doc => {
      const data = doc.data();
      const createdAtTimestamp = data.createdAt as Timestamp;
      return {
        uid: data.uid,
        email: data.email,
        role: data.role,
        createdAt: createdAtTimestamp.toDate().toISOString(),
      };
    });
    
    return users;
  } catch (error) {
    console.error('[userService.getAllUsers] Error fetching all user profiles:', error);
    throw new Error('Failed to fetch user list.');
  }
}

/**
 * Updates a user's role in Firestore using the Admin SDK.
 * @param uid The UID of the user to update.
 * @param role The new role to assign ('user' or 'admin').
 */
export async function updateUserRole(uid: string, role: 'user' | 'admin'): Promise<void> {
  try {
    const userRef = adminDb.collection('users').doc(uid);
    await userRef.update({ role });
    console.log(`[userService.updateUserRole] Successfully updated role for user ${uid} to ${role}.`);
  } catch (error) {
    console.error(`[userService.updateUserRole] Error updating role for user ${uid}:`, error);
    throw new Error('Failed to update user role.');
  }
}
