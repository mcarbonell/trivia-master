// src/services/suggestionService.ts
'use server';

import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import type { SuggestionData } from '@/types';
import type { AppLocale } from '@/lib/i18n-config';

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
    await addDoc(collection(db, 'userSuggestions'), dataToSave);
    console.log('[suggestionService] Suggestion added successfully.');
  } catch (error) {
    console.error('[suggestionService] Error adding suggestion to Firestore:', error);
    throw new Error('Failed to submit suggestion.'); 
  }
}
