
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import admin from 'firebase-admin';
import type { DocumentData } from 'firebase-admin/firestore';

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
const PREDEFINED_QUESTIONS_COLLECTION = 'predefinedTriviaQuestions';
const BATCH_SIZE = 400; // Firestore batch writes limit is 500

async function migrateQuestionsFormat() {
  console.log('Starting question format migration script...');

  try {
    const questionsRef = db.collection(PREDEFINED_QUESTIONS_COLLECTION);
    const snapshot = await questionsRef.get();

    if (snapshot.empty) {
      console.log('No questions found in the collection. Nothing to migrate.');
      return;
    }

    console.log(`Found ${snapshot.size} total questions. Checking for documents to migrate...`);

    const questionsToMigrate: { id: string; data: DocumentData }[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      // Identify old format by the presence of 'answers' and 'correctAnswerIndex'
      if (data && data.answers && typeof data.correctAnswerIndex === 'number') {
        questionsToMigrate.push({ id: doc.id, data });
      }
    });

    if (questionsToMigrate.length === 0) {
      console.log('All questions are already in the new format. No migration needed.');
      return;
    }

    console.log(`Found ${questionsToMigrate.length} questions to migrate to the new format.`);

    let migratedCount = 0;
    for (let i = 0; i < questionsToMigrate.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = questionsToMigrate.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(questionsToMigrate.length / BATCH_SIZE)}...`);

      for (const { id, data } of chunk) {
        const docRef = questionsRef.doc(id);

        const { answers, correctAnswerIndex } = data;
        
        if (correctAnswerIndex < 0 || correctAnswerIndex >= answers.length) {
            console.warn(`  - Skipping document ${id} due to out-of-bounds correctAnswerIndex.`);
            continue;
        }

        const correctAnswer = answers[correctAnswerIndex];

        if (!correctAnswer) {
          console.warn(`  - Skipping document ${id} due to invalid correctAnswer at index ${correctAnswerIndex}.`);
          continue;
        }

        const distractors = answers.filter((_: any, index: number) => index !== correctAnswerIndex);

        const updateData = {
          correctAnswer: correctAnswer,
          distractors: distractors,
          answers: admin.firestore.FieldValue.delete(),
          correctAnswerIndex: admin.firestore.FieldValue.delete(),
        };

        batch.update(docRef, updateData);
      }

      await batch.commit();
      migratedCount += chunk.length;
      console.log(`  - Batch committed. ${migratedCount} of ${questionsToMigrate.length} questions migrated.`);
    }

    console.log('\nMigration complete!');
    console.log(`Successfully migrated ${migratedCount} questions.`);

  } catch (error) {
    console.error('An error occurred during the migration process:', error);
  }
}

migrateQuestionsFormat().catch(error => {
  console.error("Unhandled error in migration script:", error);
  process.exit(1);
});
