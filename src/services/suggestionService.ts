// src/services/suggestionService.ts
'use server';

import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, deleteDoc, doc, type Timestamp } from 'firebase/firestore';
import type { SuggestionData } from '@/types';
import type { AppLocale } from '@/lib/i18n-config';

const SUGGESTIONS_COLLECTION = 'userSuggestions';

/**
 * Adds a new user suggestion to Firestore.
 * @param suggestionData - The data for the suggestion.
 * @returns A promise that resolves when the suggestion is added.
 */
export async function addSuggestion(
  data: Omit<SuggestionData, 'id' | 'submittedAt'> & { locale: AppLocale }
): Promise<void> {
  try {
    const dataToSave = {
      ...data,
      submittedAt: serverTimestamp(),
    };
    await addDoc(collection(db, SUGGESTIONS_COLLECTION), dataToSave);
    console.log('[suggestionService] Suggestion added successfully.');
  } catch (error) {
    console.error('[suggestionService] Error adding suggestion to Firestore:', error);
    throw new Error('Failed to submit suggestion.'); 
  }
}

/**
 * Fetches all user suggestions from Firestore, ordered by submittedAt descending.
 * @returns A promise that resolves to an array of SuggestionData.
 */
export async function getUserSuggestions(): Promise<SuggestionData[]> {
  try {
    const suggestionsRef = collection(db, SUGGESTIONS_COLLECTION);
    const q = query(suggestionsRef, orderBy('submittedAt', 'desc'));
    const querySnapshot = await getDocs(q);

    const suggestions: SuggestionData[] = [];
    querySnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      // Ensure submittedAt is converted to a serializable format (string)
      const submittedAtTimestamp = data.submittedAt as Timestamp | null;
      const submittedAtString = submittedAtTimestamp ? submittedAtTimestamp.toDate().toISOString() : new Date().toISOString(); 

      suggestions.push({
        id: docSnapshot.id,
        name: data.name,
        email: data.email,
        message: data.message,
        submittedAt: submittedAtString,
        locale: data.locale,
      } as SuggestionData);
    });
    return suggestions;
  } catch (error) {
    console.error('[suggestionService] Error fetching user suggestions:', error);
    throw error;
  }
}

/**
 * Deletes a specific suggestion from Firestore.
 * @param suggestionId The ID of the suggestion to delete.
 * @returns A promise that resolves when the suggestion is deleted.
 */
export async function deleteSuggestion(suggestionId: string): Promise<void> {
  try {
    const suggestionRef = doc(db, SUGGESTIONS_COLLECTION, suggestionId);
    await deleteDoc(suggestionRef);
    console.log(`[suggestionService] Suggestion ${suggestionId} deleted successfully.`);
  } catch (error) {
    console.error(`[suggestionService] Error deleting suggestion ${suggestionId}:`, error);
    throw error;
  }
}
