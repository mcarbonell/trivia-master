
// src/services/categoryService.ts
'use server';

import { db } from '@/lib/firebase';
import { collection, getDocs, DocumentData } from 'firebase/firestore';
import type { CategoryDefinition } from '@/types';

const CATEGORIES_COLLECTION = 'triviaCategories';

/**
 * Fetches all category definitions from Firestore.
 * @returns A promise that resolves to an array of CategoryDefinition.
 */
export async function getAppCategories(): Promise<CategoryDefinition[]> {
  try {
    const categoriesRef = collection(db, CATEGORIES_COLLECTION);
    const querySnapshot = await getDocs(categoriesRef);
    
    const categories: CategoryDefinition[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as DocumentData;
      categories.push({
        id: doc.id,
        topicValue: data.topicValue,
        name: data.name,
        icon: data.icon,
        detailedPromptInstructions: data.detailedPromptInstructions,
        difficultySpecificGuidelines: data.difficultySpecificGuidelines,
      } as CategoryDefinition);
    });
    return categories;
  } catch (error) {
    console.error("Error fetching app categories from Firestore:", error);
    return []; // Return empty array on error
  }
}
