
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import admin from 'firebase-admin';
import fs from 'fs/promises';
import path from 'path';
import type { CategoryDefinition } from '../src/types'; // Adjust path as necessary

// Initialize Firebase Admin SDK
try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }
} catch (error) {
  console.error('Firebase Admin initialization error. Make sure GOOGLE_APPLICATION_CREDENTIALS is set correctly.', error);
  process.exit(1);
}

const db = admin.firestore();
const CATEGORIES_COLLECTION = 'triviaCategories';
const INITIAL_CATEGORIES_PATH = path.join(__dirname, '../src/data/initial-categories.json');

async function populateCategories() {
  console.log(`Starting Firestore category population script from ${INITIAL_CATEGORIES_PATH}...`);

  try {
    const categoriesJson = await fs.readFile(INITIAL_CATEGORIES_PATH, 'utf-8');
    const categoriesData: any[] = JSON.parse(categoriesJson); // Read as any first for validation

    if (!categoriesData || categoriesData.length === 0) {
      console.log('No categories found in the JSON file. Exiting.');
      return;
    }

    console.log(`Found ${categoriesData.length} categories to process.`);

    const batch = db.batch();
    let operationsCount = 0;

    for (const categoryData of categoriesData) {
      // Validate structure before casting to CategoryDefinition
      if (
        !categoryData.topicValue || typeof categoryData.topicValue !== 'string' ||
        !categoryData.name || typeof categoryData.name.en !== 'string' || typeof categoryData.name.es !== 'string' ||
        !categoryData.icon || typeof categoryData.icon !== 'string' ||
        !categoryData.detailedPromptInstructions || typeof categoryData.detailedPromptInstructions !== 'string' ||
        (categoryData.hasOwnProperty('isPredefined') && typeof categoryData.isPredefined !== 'boolean') // Validate isPredefined
      ) {
        console.warn(`Skipping category due to missing/invalid required fields (topicValue, name, icon, detailedPromptInstructions as string, isPredefined as boolean): ${JSON.stringify(categoryData)}`);
        continue;
      }

      const categoryToSave: CategoryDefinition = {
        id: categoryData.topicValue, // Use topicValue as id
        topicValue: categoryData.topicValue,
        name: categoryData.name,
        icon: categoryData.icon,
        detailedPromptInstructions: categoryData.detailedPromptInstructions,
        isPredefined: categoryData.isPredefined === undefined ? true : categoryData.isPredefined, // Default to true if not specified
      };
      
      if (categoryData.difficultySpecificGuidelines) {
        const guidelines: { [key: string]: string } = {};
        let validGuidelines = true;
        const allowedDifficulties: (keyof Required<CategoryDefinition>['difficultySpecificGuidelines'])[] = ['easy', 'medium', 'hard'];
        
        for (const key in categoryData.difficultySpecificGuidelines) {
          if (allowedDifficulties.includes(key as any) && typeof categoryData.difficultySpecificGuidelines[key] === 'string') {
            guidelines[key] = categoryData.difficultySpecificGuidelines[key];
          } else if (!allowedDifficulties.includes(key as any)) {
            console.warn(`Invalid difficulty key "${key}" in difficultySpecificGuidelines for ${categoryData.topicValue}. Allowed keys are: ${allowedDifficulties.join(', ')}. Skipping this guideline.`);
          } else {
            console.warn(`Invalid guideline value for ${categoryData.topicValue} - ${key}: not a string.`);
            validGuidelines = false; 
            break; 
          }
        }
        if (validGuidelines && Object.keys(guidelines).length > 0) {
          categoryToSave.difficultySpecificGuidelines = guidelines as Required<CategoryDefinition>['difficultySpecificGuidelines'];
        } else if (!validGuidelines) {
            console.warn(`Skipping difficultySpecificGuidelines for ${categoryData.topicValue} due to invalid entries.`);
        }
      }

      const categoryRef = db.collection(CATEGORIES_COLLECTION).doc(categoryToSave.topicValue);
      batch.set(categoryRef, categoryToSave, { merge: true });
      operationsCount++;
      console.log(`Scheduled set/update for category: "${categoryToSave.name.en}" (ID: ${categoryToSave.topicValue})`);
    }

    if (operationsCount > 0) {
      await batch.commit();
      console.log(`Successfully committed ${operationsCount} category operations to Firestore.`);
    } else {
      console.log('No valid category operations to commit.');
    }

  } catch (error) {
    console.error('Error populating categories:', error);
    if (error instanceof SyntaxError) {
        console.error('This might be due to an invalid JSON format in initial-categories.json.');
    }
  }

  console.log('Category population script finished.');
}

populateCategories().catch(error => {
  console.error("Unhandled error in populateCategories script:", error);
  process.exit(1);
});

