// src/services/categoryService.ts
'use server';

import { db } from '@/lib/firebase';
import { collection, getDocs, type DocumentData } from 'firebase/firestore';
import type { CategoryDefinition, BilingualText } from '@/types';

const CATEGORIES_COLLECTION = 'triviaCategories';

/**
 * Fetches all category definitions from Firestore.
 * @returns A promise that resolves to an array of CategoryDefinition.
 */
export async function getAppCategories(): Promise<CategoryDefinition[]> {
  try {
    const categoriesRef = collection(db, CATEGORIES_COLLECTION);
    const querySnapshot = await getDocs(categoriesRef);
    
    console.log(`[categoryService] Fetched ${querySnapshot.size} documents from "${CATEGORIES_COLLECTION}".`);

    const categories: CategoryDefinition[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as DocumentData;
      // Basic check for required fields to ensure data integrity before pushing
      // Note: detailedPromptInstructions is now a string, not BilingualText
      if (data.topicValue && typeof data.topicValue === 'string' &&
          data.name && typeof data.name.en === 'string' && typeof data.name.es === 'string' &&
          data.icon && typeof data.icon === 'string' &&
          data.detailedPromptInstructions && typeof data.detailedPromptInstructions === 'string') { // Changed here
        
        const categoryToAdd: CategoryDefinition = {
          id: doc.id,
          topicValue: data.topicValue,
          name: data.name as BilingualText, // name is still BilingualText
          icon: data.icon,
          detailedPromptInstructions: data.detailedPromptInstructions, // Now a string
        };

        // Ensure difficultySpecificGuidelines, if it exists, has string values
        if (data.difficultySpecificGuidelines) {
          const validatedGuidelines: { [key: string]: string } = {};
          let allGuidelinesAreStrings = true;
          for (const key in data.difficultySpecificGuidelines) {
            if (typeof data.difficultySpecificGuidelines[key] === 'string') {
              validatedGuidelines[key] = data.difficultySpecificGuidelines[key];
            } else {
              console.warn(`[categoryService] Document ${doc.id}, difficultySpecificGuidelines for key "${key}" is not a string. Skipping this guideline.`);
              allGuidelinesAreStrings = false; // Or handle more strictly if needed
            }
          }
          if(Object.keys(validatedGuidelines).length > 0){
             categoryToAdd.difficultySpecificGuidelines = validatedGuidelines;
          } else if (!allGuidelinesAreStrings && Object.keys(data.difficultySpecificGuidelines).length > 0) {
             console.warn(`[categoryService] Document ${doc.id} had difficultySpecificGuidelines but none were valid strings. It will be omitted.`);
          }
        }
        
        categories.push(categoryToAdd);

      } else {
        console.warn(`[categoryService] Document ${doc.id} in "${CATEGORIES_COLLECTION}" is missing one or more required fields (topicValue, name, icon, detailedPromptInstructions) or they are not in the expected format. detailedPromptInstructions should be a string. Skipping.`);
        console.warn(`[categoryService] Problematic data for doc ${doc.id}:`, JSON.stringify(data));
      }
    });
    
    console.log('[categoryService] Processed categories: ', categories.map(c => ({ id: c.id, name: c.name.en })));
    
    if (querySnapshot.size > 0 && categories.length === 0) {
        console.warn(`[categoryService] All documents fetched from "${CATEGORIES_COLLECTION}" were skipped due to missing fields or incorrect format. Please check Firestore data and structure definitions.`);
    }
    
    return categories;
  } catch (error) {
    console.error(`[categoryService] Error fetching app categories from Firestore collection "${CATEGORIES_COLLECTION}":`, error);
    return []; // Return empty array on error
  }
}
