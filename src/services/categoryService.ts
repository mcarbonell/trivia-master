// src/services/categoryService.ts
'use server';

import { db } from '@/lib/firebase';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, getDoc, type DocumentData } from 'firebase/firestore';
import type { CategoryDefinition, BilingualText, DifficultyLevel } from '@/types'; // Added DifficultyLevel

const CATEGORIES_COLLECTION = 'triviaCategories';

/**
 * Fetches all category definitions from Firestore.
 * @returns A promise that resolves to an array of CategoryDefinition.
 */
export async function getAppCategories(): Promise<CategoryDefinition[]> {
  try {
    const categoriesRef = collection(db, CATEGORIES_COLLECTION);
    const querySnapshot = await getDocs(categoriesRef);
    
    // console.log(`[categoryService] Fetched ${querySnapshot.size} documents from "${CATEGORIES_COLLECTION}".`);

    const categories: CategoryDefinition[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as DocumentData;
      if (data.topicValue && typeof data.topicValue === 'string' &&
          data.name && typeof data.name.en === 'string' && typeof data.name.es === 'string' &&
          data.icon && typeof data.icon === 'string' &&
          data.detailedPromptInstructions && typeof data.detailedPromptInstructions === 'string' &&
          (data.hasOwnProperty('isPredefined') ? typeof data.isPredefined === 'boolean' : true)
      ) { 
        
        const categoryToAdd: CategoryDefinition = {
          id: doc.id,
          topicValue: data.topicValue,
          name: data.name as BilingualText,
          icon: data.icon,
          detailedPromptInstructions: data.detailedPromptInstructions,
          isPredefined: data.isPredefined === undefined ? true : data.isPredefined,
        };

        if (data.difficultySpecificGuidelines) {
          const validatedGuidelines: { [key in DifficultyLevel]?: string } = {}; // Typed keys
          const allowedDifficulties: DifficultyLevel[] = ['easy', 'medium', 'hard'];

          for (const key in data.difficultySpecificGuidelines) {
            if (allowedDifficulties.includes(key as DifficultyLevel) && typeof data.difficultySpecificGuidelines[key] === 'string') {
              validatedGuidelines[key as DifficultyLevel] = data.difficultySpecificGuidelines[key];
            } else if (!allowedDifficulties.includes(key as DifficultyLevel)) {
              // console.warn(`[categoryService] Document ${doc.id}, invalid difficulty key "${key}" in difficultySpecificGuidelines for ${categoryToAdd.topicValue}. Allowed: ${allowedDifficulties.join(', ')}. Skipping.`);
            } else {
              // console.warn(`[categoryService] Document ${doc.id}, difficultySpecificGuidelines for key "${key}" is not a string. Skipping this guideline.`);
            }
          }
          if(Object.keys(validatedGuidelines).length > 0){
             categoryToAdd.difficultySpecificGuidelines = validatedGuidelines;
          } else if (Object.keys(data.difficultySpecificGuidelines).length > 0) {
             // console.warn(`[categoryService] Document ${doc.id} had difficultySpecificGuidelines for ${categoryToAdd.topicValue} but none were valid strings. It will be omitted.`);
          }
        }
        
        categories.push(categoryToAdd);

      } else {
        // console.warn(`[categoryService] Document ${doc.id} in "${CATEGORIES_COLLECTION}" is missing one or more required fields or they are not in the expected format. Skipping.`);
        // console.warn(`[categoryService] Problematic data for doc ${doc.id}:`, JSON.stringify(data));
      }
    });
    
    // console.log('[categoryService] Processed categories: ', categories.map(c => ({ id: c.id, name: c.name.en, isPredefined: c.isPredefined })));
    
    if (querySnapshot.size > 0 && categories.length === 0) {
        // console.warn(`[categoryService] All documents fetched from "${CATEGORIES_COLLECTION}" were skipped due to missing fields or incorrect format. Please check Firestore data and structure definitions.`);
    }
    
    return categories;
  } catch (error) {
    console.error(`[categoryService] Error fetching app categories from Firestore collection "${CATEGORIES_COLLECTION}":`, error);
    throw error; // Re-throw to be caught by caller
  }
}

/**
 * Adds a new category to Firestore. Uses topicValue as document ID.
 * @param categoryData The data for the new category.
 * @returns A promise that resolves when the category is added.
 * @throws Error if a category with the same topicValue already exists.
 */
export async function addCategory(categoryData: Omit<CategoryDefinition, 'id'>): Promise<void> {
  const categoryRef = doc(db, CATEGORIES_COLLECTION, categoryData.topicValue);
  const docSnap = await getDoc(categoryRef);
  if (docSnap.exists()) {
    throw new Error(`Category with Topic Value "${categoryData.topicValue}" already exists.`);
  }
  // Firestore will use categoryData.topicValue as the ID here
  await setDoc(categoryRef, categoryData); 
}


/**
 * Updates an existing category in Firestore.
 * @param categoryId The ID of the category to update (should be the topicValue).
 * @param categoryData The partial data to update the category with.
 * @returns A promise that resolves when the category is updated.
 */
export async function updateCategory(categoryId: string, categoryData: Partial<Omit<CategoryDefinition, 'id'>>): Promise<void> {
  // Note: We are not allowing topicValue (ID) to be changed via update for simplicity.
  // If topicValue (ID) needs to change, it's a delete and add operation.
  // The 'topicValue' in categoryData here would be the new topicValue IF we allowed it to change,
  // but our form disables it for edit mode.
  const dataToUpdate = { ...categoryData };
  if ('topicValue' in dataToUpdate && dataToUpdate.topicValue !== categoryId) {
    // This case should not happen if form disables topicValue editing
    console.warn("Attempting to change topicValue during update, which is not directly supported. Original ID:", categoryId, "New topicValue attempted:", dataToUpdate.topicValue);
    // To prevent changing the ID via update, remove it from the update payload or ensure it matches categoryId.
    // For now, we assume categoryId is the correct doc ID and topicValue in payload is ignored for ID change.
    delete dataToUpdate.topicValue;
  }

  const categoryRef = doc(db, CATEGORIES_COLLECTION, categoryId);
  await updateDoc(categoryRef, dataToUpdate);
}

/**
 * Deletes a category from Firestore.
 * @param categoryId The ID of the category to delete.
 * @returns A promise that resolves when the category is deleted.
 */
export async function deleteCategory(categoryId: string): Promise<void> {
  const categoryRef = doc(db, CATEGORIES_COLLECTION, categoryId);
  await deleteDoc(categoryRef);
}
