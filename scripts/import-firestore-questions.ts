
'use server';

import { config } from 'dotenv';
config(); // Load environment variables from .env file

import fs from 'fs/promises';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { adminDb } from '../src/lib/firebase-admin';
import type { PredefinedQuestion } from '../src/services/triviaService'; // Using this type for structure
import type { DifficultyLevel, BilingualText } from '@/types';
import type { GenerateTriviaQuestionOutput } from '@/ai/flows/generate-trivia-question';
import { firestore } from 'firebase-admin';

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

    let batch = adminDb.batch();
    let operationsInBatch = 0;
    let questionsImported = 0;
    let questionsSkipped = 0;

    for (const question of questionsData) {
      // Basic validation for core fields. ID is now optional for creation.
      if (
        !question.topicValue || typeof question.topicValue !== 'string' ||
        !isValidBilingualText(question.question) ||
        !isValidBilingualText(question.correctAnswer) ||
        !Array.isArray(question.distractors) || question.distractors.length !== 3 || !question.distractors.every(isValidBilingualText) ||
        !isValidBilingualText(question.explanation) ||
        !question.difficulty || !ALL_DIFFICULTY_LEVELS_CONST.includes(question.difficulty)
      ) {
        console.warn(`Skipping question due to missing/invalid required fields. Data: ${JSON.stringify(question).substring(0, 200)}...`);
        questionsSkipped++;
        continue;
      }
      
      const questionToSave: { [key: string]: any } = {
        topicValue: question.topicValue,
        question: question.question,
        correctAnswer: question.correctAnswer,
        distractors: question.distractors,
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
            questionToSave.createdAt = firestore.Timestamp.fromDate(date);
          }
        } catch (e) {
          console.warn(`Could not parse createdAt for question. Skipping.`);
        }
      } else {
        // For new imports without a date, set it to now
        questionToSave.createdAt = firestore.FieldValue.serverTimestamp();
      }
      if (question.status && ['accepted', 'fixed'].includes(question.status)) {
        questionToSave.status = question.status;
      }
      if (question.imagePrompt) {
          questionToSave.imagePrompt = question.imagePrompt;
      }
      if (question.searchTerm) {
          questionToSave.searchTerm = question.searchTerm;
      }
      if (question.imageUrl) {
          questionToSave.imageUrl = question.imageUrl;
      }

      let docRef;
      if (question.id && typeof question.id === 'string') {
        // If ID exists, we are updating/overwriting a specific document
        docRef = adminDb.collection(PREDEFINED_QUESTIONS_COLLECTION).doc(question.id);
        console.log(`  -> Scheduling update/set for question ID: ${question.id}`);
      } else {
        // If no ID, we are creating a new document with an auto-generated ID
        docRef = adminDb.collection(PREDEFINED_QUESTIONS_COLLECTION).doc(); // This creates a reference with a new auto-ID
        console.log(`  -> Scheduling creation of new question with auto-generated ID.`);
      }

      batch.set(docRef, questionToSave, { merge: true });
      operationsInBatch++;
      questionsImported++;

      if (operationsInBatch >= 499) {
        console.log(`Committing batch of ${operationsInBatch} question operations...`);
        await batch.commit();
        batch = adminDb.batch();
        operationsInBatch = 0;
        console.log('Batch committed.');
      }
    }

    if (operationsInBatch > 0) {
      console.log(`Committing final batch of ${operationsInBatch} question operations...`);
      await batch.commit();
      console.log('Final batch committed.');
    }

    console.log(`Successfully imported/updated ${questionsImported} questions.`);
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
