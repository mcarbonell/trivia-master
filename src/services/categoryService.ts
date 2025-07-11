
// src/services/categoryService.ts
'use server';

import { db } from '@/lib/firebase';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, getDoc, type DocumentData, deleteField } from 'firebase/firestore';
import type { CategoryDefinition, BilingualText, DifficultyLevel } from '@/types'; 

const CATEGORIES_COLLECTION = 'triviaCategories';

/**
 * Fetches ALL category definitions from Firestore.
 */
export async function getAppCategories(): Promise<CategoryDefinition[]> {
  try {
    const categoriesRef = collection(db, CATEGORIES_COLLECTION);
    const querySnapshot = await getDocs(categoriesRef);
    
    const categories: CategoryDefinition[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as DocumentData;
      if (data.topicValue && typeof data.topicValue === 'string' &&
          data.name && typeof data.name.en === 'string' && typeof data.name.es === 'string' &&
          data.icon && typeof data.icon === 'string' &&
          data.detailedPromptInstructions && typeof data.detailedPromptInstructions === 'string'
      ) { 
        
        const categoryToAdd: CategoryDefinition = {
          id: doc.id,
          topicValue: data.topicValue,
          name: data.name as BilingualText,
          icon: data.icon,
          detailedPromptInstructions: data.detailedPromptInstructions,
          parentTopicValue: data.parentTopicValue || undefined,
          isVisual: data.isVisual,
        };

        if (data.difficultySpecificGuidelines) {
          const validatedGuidelines: { [key in DifficultyLevel]?: string } = {}; 
          const allowedDifficulties: DifficultyLevel[] = ['easy', 'medium', 'hard'];

          for (const key in data.difficultySpecificGuidelines) {
            if (allowedDifficulties.includes(key as DifficultyLevel) && typeof data.difficultySpecificGuidelines[key] === 'string') {
              validatedGuidelines[key as DifficultyLevel] = data.difficultySpecificGuidelines[key];
            }
          }
          if(Object.keys(validatedGuidelines).length > 0){
             categoryToAdd.difficultySpecificGuidelines = validatedGuidelines;
          }
        }
        
        categories.push(categoryToAdd);

      } else {
        console.warn(`[categoryService] Document ${doc.id} in "${CATEGORIES_COLLECTION}" is missing essential fields or they are not in the expected format. Skipping.`);
      }
    });
        
    return categories;
  } catch (error) {
    console.error(`[categoryService] Error fetching app categories from Firestore collection "${CATEGORIES_COLLECTION}":`, error);
    throw error; 
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

  const dataForFirestore: { [key: string]: any } = { ...categoryData };

  if (dataForFirestore.parentTopicValue === undefined) {
    delete dataForFirestore.parentTopicValue; 
  }
  
  await setDoc(categoryRef, dataForFirestore); 
}


/**
 * Updates an existing category in Firestore.
 * @param categoryId The ID of the category to update (should be the topicValue).
 * @param categoryData The partial data to update the category with.
 * @returns A promise that resolves when the category is updated.
 */
export async function updateCategory(categoryId: string, categoryData: Partial<Omit<CategoryDefinition, 'id'>>): Promise<void> {
  const dataForFirestore: { [key: string]: any } = { ...categoryData };
  
  if (dataForFirestore.hasOwnProperty('topicValue') && dataForFirestore.topicValue !== categoryId) {
    delete dataForFirestore.topicValue; 
  }

  if (dataForFirestore.hasOwnProperty('parentTopicValue')) {
    if (dataForFirestore.parentTopicValue === undefined) {
      dataForFirestore.parentTopicValue = deleteField(); 
    }
  }

  const categoryRef = doc(db, CATEGORIES_COLLECTION, categoryId);
  await updateDoc(categoryRef, dataForFirestore);
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
