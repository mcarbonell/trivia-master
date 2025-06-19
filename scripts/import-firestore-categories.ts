
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import admin from 'firebase-admin';
import fs from 'fs/promises';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import type { CategoryDefinition, DifficultyLevel } from '../src/types'; // Adjust path as necessary

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

// --- Argument Parsing with yargs ---
const argv = yargs(hideBin(process.argv))
  .option('source', {
    alias: 's',
    type: 'string',
    description: 'The prefix of the JSON categories file to import (e.g., "initial" for "initial-categories.json", "sports" for "sports-categories.json").',
    default: 'initial', // Default to 'initial' if no source is provided
  })
  .help()
  .alias('help', 'h')
  .parseSync();

const sourceFilePrefix: string = argv.source;
const categoriesJsonFileName = `${sourceFilePrefix}-categories.json`;
const CATEGORIES_FILE_PATH = path.join(__dirname, '../src/data/', categoriesJsonFileName);

async function importCategories() {
  console.log(`Starting Firestore category import script using source file: "${categoriesJsonFileName}" (path: ${CATEGORIES_FILE_PATH})...`);

  try {
    // Check if the file exists
    try {
      await fs.access(CATEGORIES_FILE_PATH, fs.constants.F_OK);
      console.log(`File "${categoriesJsonFileName}" found. Proceeding with import.`);
    } catch (fileAccessError) {
      console.error(`Error: Source file "${categoriesJsonFileName}" not found at path "${CATEGORIES_FILE_PATH}". Please ensure the file exists.`);
      process.exit(1);
    }

    const categoriesJson = await fs.readFile(CATEGORIES_FILE_PATH, 'utf-8');
    const categoriesData: any[] = JSON.parse(categoriesJson); // Read as any first for validation

    if (!categoriesData || categoriesData.length === 0) {
      console.log(`No categories found in the file "${categoriesJsonFileName}". Exiting.`);
      return;
    }

    console.log(`Found ${categoriesData.length} categories to process from "${categoriesJsonFileName}".`);

    const batch = db.batch();
    let operationsCount = 0;

    for (const categoryData of categoriesData) {
      // Validate structure before casting to CategoryDefinition
      if (
        !categoryData.topicValue || typeof categoryData.topicValue !== 'string' ||
        !categoryData.name || typeof categoryData.name.en !== 'string' || typeof categoryData.name.es !== 'string' ||
        !categoryData.icon || typeof categoryData.icon !== 'string' ||
        !categoryData.detailedPromptInstructions || typeof categoryData.detailedPromptInstructions !== 'string'
      ) {
        console.warn(`Skipping category due to missing/invalid required fields (topicValue, name, icon, detailedPromptInstructions as string): ${JSON.stringify(categoryData)}`);
        continue;
      }

      // Build the object to save, conditionally adding parentTopicValue
      const categoryToSave: { [key: string]: any } = {
        topicValue: categoryData.topicValue,
        name: categoryData.name,
        icon: categoryData.icon,
        detailedPromptInstructions: categoryData.detailedPromptInstructions,
      };

      if (categoryData.parentTopicValue && typeof categoryData.parentTopicValue === 'string' && categoryData.parentTopicValue.trim() !== '') {
        categoryToSave.parentTopicValue = categoryData.parentTopicValue.trim();
      }
      
      if (categoryData.difficultySpecificGuidelines) {
        const guidelines: { [key: string]: string } = {};
        let validGuidelines = true;
        const allowedDifficulties: DifficultyLevel[] = ['easy', 'medium', 'hard'];
        
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
      console.log(`Successfully committed ${operationsCount} category operations to Firestore from "${categoriesJsonFileName}".`);
    } else {
      console.log('No valid category operations to commit.');
    }

  } catch (error) {
    console.error(`Error importing categories from file "${categoriesJsonFileName}":`, error);
    if (error instanceof SyntaxError) {
        console.error(`This might be due to an invalid JSON format in "${categoriesJsonFileName}".`);
    }
  }

  console.log('Category import script finished.');
}

importCategories().catch(error => {
  console.error("Unhandled error in importCategories script:", error);
  process.exit(1);
});

