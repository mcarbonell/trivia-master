
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import admin from 'firebase-admin';
import fs from 'fs/promises';
import path from 'path';
import type { CategoryDefinition } from '../src/types'; // Adjust path as necessary

// Initialize Firebase Admin SDK
try {
  if (!admin.apps.length) {
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!serviceAccountPath) {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.');
    }
    const serviceAccount = JSON.parse(await fs.readFile(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('Firebase Admin SDK initialized successfully.');
  }
} catch (error) {
  console.error('Firebase Admin initialization error:', error);
  process.exit(1);
}

const db = admin.firestore();
const CATEGORIES_COLLECTION = 'triviaCategories';
const INITIAL_CATEGORIES_PATH = path.join(__dirname, '../src/data/initial-categories.json');

async function populateCategories() {
  console.log(`Starting Firestore category population script from ${INITIAL_CATEGORIES_PATH}...`);

  try {
    const categoriesJson = await fs.readFile(INITIAL_CATEGORIES_PATH, 'utf-8');
    const categories: CategoryDefinition[] = JSON.parse(categoriesJson);

    if (!categories || categories.length === 0) {
      console.log('No categories found in the JSON file. Exiting.');
      return;
    }

    console.log(`Found ${categories.length} categories to process.`);

    const batch = db.batch();
    let operationsCount = 0;

    for (const category of categories) {
      if (!category.topicValue || !category.name || !category.icon || !category.detailedPromptInstructions) {
        console.warn(`Skipping category due to missing required fields (topicValue, name, icon, detailedPromptInstructions): ${JSON.stringify(category)}`);
        continue;
      }
      // Use topicValue as the document ID for idempotency
      const categoryRef = db.collection(CATEGORIES_COLLECTION).doc(category.topicValue);
      batch.set(categoryRef, category, { merge: true }); // merge:true will update if exists, create if not
      operationsCount++;
      console.log(`Scheduled set/update for category: "${category.name.en}" (ID: ${category.topicValue})`);
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

    