
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import admin from 'firebase-admin';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { detectDuplicateQuestions, type QuestionInput, type DetectDuplicatesInput, type DetectDuplicatesOutput } from '../src/ai/flows/detect-duplicate-questions';
import type { PredefinedQuestion, DifficultyLevel } from '../src/services/triviaService'; // Assuming types are here
import type { BilingualText } from '../src/types';

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
const ALL_DIFFICULTY_LEVELS_CONST: DifficultyLevel[] = ["easy", "medium", "hard"];
const DEFAULT_MODEL_FOR_CHECK = 'googleai/gemini-2.5-flash-lite-preview-06-17';

// --- Argument Parsing with yargs ---
const argv = yargs(hideBin(process.argv))
  .option('topicValue', {
    alias: 't',
    type: 'string',
    description: 'TopicValue of the category to check for duplicate questions.',
    demandOption: true, // Make topicValue mandatory
  })
  .option('difficulty', {
    alias: 'd',
    type: 'string',
    choices: ALL_DIFFICULTY_LEVELS_CONST,
    description: 'Specific difficulty level to check (easy, medium, hard). If not provided, checks all difficulties for the topic.',
  })
  .option('model', {
    alias: 'm',
    type: 'string',
    description: `Genkit model name to use for detection (e.g., googleai/gemini-1.5-flash). Defaults to ${DEFAULT_MODEL_FOR_CHECK}.`,
  })
  .help()
  .alias('help', 'h')
  .parseSync();

async function checkDuplicates() {
  const { topicValue, difficulty, model: modelName } = argv;
  const modelToUse = modelName || DEFAULT_MODEL_FOR_CHECK;

  console.log(`Starting duplicate question check for topicValue: "${topicValue}"...`);
  if (difficulty) {
    console.log(`Targeting difficulty: "${difficulty}"`);
  } else {
    console.log(`Targeting all difficulties for this topic.`);
  }
  console.log(`Using AI model: "${modelToUse}" for detection.`);

  try {
    let firestoreQuery = db.collection(PREDEFINED_QUESTIONS_COLLECTION).where('topicValue', '==', topicValue);
    if (difficulty) {
      firestoreQuery = firestoreQuery.where('difficulty', '==', difficulty as DifficultyLevel);
    }

    const querySnapshot = await firestoreQuery.get();

    if (querySnapshot.empty) {
      console.log(`No questions found for topicValue "${topicValue}"` + (difficulty ? ` and difficulty "${difficulty}"` : '') + ".");
      return;
    }

    const questionsFromFirestore: QuestionInput[] = [];
    querySnapshot.forEach(doc => {
      const data = doc.data() as PredefinedQuestion; // Assuming PredefinedQuestion has a 'question.en' field
      if (data.question && data.question.en) {
        questionsFromFirestore.push({
          id: doc.id,
          questionText: data.question.en, // Using English text for AI comparison
        });
      } else {
        console.warn(`Question with ID ${doc.id} is missing English text and will be skipped.`);
      }
    });

    if (questionsFromFirestore.length < 2) {
      console.log(`Found only ${questionsFromFirestore.length} question(s). Need at least 2 to check for duplicates.`);
      return;
    }
    
    console.log(`Fetched ${questionsFromFirestore.length} questions from Firestore. Sending to AI for duplicate detection...`);

    const flowInput: DetectDuplicatesInput = {
      questionsList: questionsFromFirestore,
      modelName: modelToUse,
    };

    const duplicateResults: DetectDuplicatesOutput = await detectDuplicateQuestions(flowInput);

    if (duplicateResults.length === 0) {
      console.log("AI analysis complete: No conceptual duplicates found.");
    } else {
      console.log(`AI analysis complete: Found ${duplicateResults.length} duplicate pair(s):`);
      duplicateResults.forEach(pair => {
        console.log(`  ID ${pair.duplicateId} is duplicated of ID ${pair.originalId} (Reason: ${pair.reason || 'N/A'})`);
      });
    }

  } catch (error) {
    console.error("Error during duplicate check process:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }

  console.log('Duplicate check script finished.');
}

checkDuplicates().catch(error => {
  console.error("Unhandled error in checkDuplicates script:", error);
  process.exit(1);
});
