
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import admin from 'firebase-admin';
import fs from 'fs/promises';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import type { PredefinedQuestion } from '../src/services/triviaService'; // Using this type for structure
import type { DifficultyLevel, BilingualText } from '../src/types';
import type { GenerateTriviaQuestionOutput } from '@/ai/flows/generate-trivia-question';

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

const argv = yargs(hideBin(process.argv))
  .option('source', {
    alias: 's',
    type: 'string',
    description: 'The prefix of the JSON questions file to import (e.g., "animals" for "animals-questions.json").',
    demandOption: true, // Make source mandatory
  })
  .help()
  .alias('help', 'h')
  .parseSync();

const sourceFilePrefix: string = argv.source;
const questionsJsonFileName = `${sourceFilePrefix}-questions.json`;
const QUESTIONS_FILE_PATH = path.join(__dirname, '../src/data/', questionsJsonFileName);

function isValidBilingualText(obj: any): obj is BilingualText {
  return obj && typeof obj.en === 'string' && typeof obj.es === 'string';
}

async function importQuestions() {
  console.log(`Starting Firestore question import script using source file: "${questionsJsonFileName}" (path: ${QUESTIONS_FILE_PATH})...`);

  try {
    try {
      await fs.access(QUESTIONS_FILE_PATH, fs.constants.F_OK);
      console.log(`File "${questionsJsonFileName}" found. Proceeding with import.`);
    } catch (fileAccessError) {
      console.error(`Error: Source file "${questionsJsonFileName}" not found at path "${QUESTIONS_FILE_PATH}". Please ensure the file exists.`);
      process.exit(1);
    }

    const questionsJson = await fs.readFile(QUESTIONS_FILE_PATH, 'utf-8');
    const questionsData: any[] = JSON.parse(questionsJson);

    if (!Array.isArray(questionsData) || questionsData.length === 0) {
      console.log(`No questions found or invalid format in "${questionsJsonFileName}". Exiting.`);
      return;
    }

    console.log(`Found ${questionsData.length} questions to process from "${questionsJsonFileName}".`);

    let batch = db.batch();
    let operationsInBatch = 0;
    let questionsImported = 0;
    let questionsSkipped = 0;

    for (const question of questionsData) {
      // Basic validation for old format
      if (
        !question.id || typeof question.id !== 'string' ||
        !question.topicValue || typeof question.topicValue !== 'string' ||
        !isValidBilingualText(question.question) ||
        !Array.isArray(question.answers) || question.answers.length !== 4 || !question.answers.every(isValidBilingualText) ||
        typeof question.correctAnswerIndex !== 'number' || question.correctAnswerIndex < 0 || question.correctAnswerIndex > 3 ||
        !isValidBilingualText(question.explanation) ||
        !question.difficulty || !ALL_DIFFICULTY_LEVELS_CONST.includes(question.difficulty)
      ) {
        console.warn(`Skipping question due to missing/invalid required fields in old format. ID: ${question.id || 'N/A'}, Data: ${JSON.stringify(question).substring(0, 200)}...`);
        questionsSkipped++;
        continue;
      }
      
      // Convert old format to new format
      const correctAnswer = question.answers[question.correctAnswerIndex];
      const distractors = question.answers.filter((_: any, i: number) => i !== question.correctAnswerIndex);
      
      const questionToSave: { [key: string]: any } = {
        // id field is not stored in the document, but used for doc ID
        topicValue: question.topicValue,
        question: question.question,
        correctAnswer: correctAnswer,
        distractors: distractors,
        explanation: question.explanation,
        difficulty: question.difficulty,
      };

      if (question.hint && isValidBilingualText(question.hint)) {
        questionToSave.hint = question.hint;
      }
      if (question.source && typeof question.source === 'string') {
        questionToSave.source = question.source;
      }
      // Convert ISO string date back to Firestore Timestamp for consistency
      if (question.createdAt && typeof question.createdAt === 'string') {
        try {
          const date = new Date(question.createdAt);
          if (!isNaN(date.getTime())) {
            questionToSave.createdAt = admin.firestore.Timestamp.fromDate(date);
          }
        } catch (e) {
          console.warn(`Could not parse createdAt for question ${question.id}. Skipping.`);
        }
      } else {
        // For new imports without a date, set it to now
        questionToSave.createdAt = admin.firestore.FieldValue.serverTimestamp();
      }
      if (question.status && ['accepted', 'fixed'].includes(question.status)) {
        questionToSave.status = question.status;
      }

      const docRef = db.collection(PREDEFINED_QUESTIONS_COLLECTION).doc(question.id);
      batch.set(docRef, questionToSave, { merge: true });
      operationsInBatch++;
      questionsImported++;

      if (operationsInBatch >= 499) {
        console.log(`Committing batch of ${operationsInBatch} question operations...`);
        await batch.commit();
        batch = db.batch();
        operationsInBatch = 0;
        console.log('Batch committed.');
      }
    }

    if (operationsInBatch > 0) {
      console.log(`Committing final batch of ${operationsInBatch} question operations...`);
      await batch.commit();
      console.log('Final batch committed.');
    }

    console.log(`Successfully imported/updated ${questionsImported} questions (converted to new format).`);
    if (questionsSkipped > 0) {
      console.warn(`Skipped ${questionsSkipped} questions due to validation errors.`);
    }

  } catch (error) {
    console.error(`Error importing questions from file "${questionsJsonFileName}":`, error);
    if (error instanceof SyntaxError) {
        console.error(`This might be due to an invalid JSON format in "${questionsJsonFileName}".`);
    }
  }

  console.log('Question import script finished.');
}

importQuestions().catch(error => {
  console.error("Unhandled error in importQuestions script:", error);
  process.exit(1);
});
