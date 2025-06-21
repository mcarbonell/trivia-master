
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import admin from 'firebase-admin';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { validateSingleTriviaQuestion, type ValidateSingleQuestionInput, type ValidateSingleQuestionOutput, type QuestionData } from '../src/ai/flows/validate-single-trivia-question';
import type { DifficultyLevel } from '@/ai/flows/generate-trivia-question';

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
const DEFAULT_MODEL_FOR_VALIDATION = 'googleai/gemini-2.5-flash';

// --- Argument Parsing with yargs ---
const argv = yargs(hideBin(process.argv))
  .option('topicValue', {
    alias: 't',
    type: 'string',
    description: 'TopicValue of the category to validate.',
    demandOption: true,
  })
  .option('difficulty', {
    alias: 'd',
    type: 'string',
    choices: ALL_DIFFICULTY_LEVELS_CONST,
    description: 'Specific difficulty level to validate. If not provided, validates all.',
  })
  .option('model', {
    alias: 'm',
    type: 'string',
    description: `Genkit model name to use. Defaults to ${DEFAULT_MODEL_FOR_VALIDATION}.`,
  })
  .option('batchSize', {
    alias: 'b',
    type: 'number',
    default: 1,
    description: 'Number of questions to validate in parallel.',
  })
  .option('autofix', {
    alias: 'af',
    type: 'boolean',
    default: false,
    description: 'Automatically apply AI fixes.',
  })
  .option('autodelete', {
    alias: 'ad',
    type: 'boolean',
    default: false,
    description: 'Automatically delete rejected questions.',
  })
  .option('auto', {
    alias: 'a',
    type: 'boolean',
    default: false,
    description: 'Shorthand for --autofix and --autodelete.',
  })
  .option('force', {
    alias: 'f',
    type: 'boolean',
    default: false,
    description: "Force re-validation of all questions, ignoring their current status (e.g., 'accepted' or 'fixed').",
  })
  .help()
  .alias('help', 'h')
  .parseSync();

async function validateMultipleQuestions() {
  const { topicValue, difficulty, model, auto, autofix, autodelete, force, batchSize } = argv;
  const doAutoFix = autofix || auto;
  const doAutoDelete = autodelete || auto;
  const modelToUse = model || DEFAULT_MODEL_FOR_VALIDATION;

  console.log(`Starting bulk validation for topic: "${topicValue}"...`);
  if (difficulty) console.log(`Difficulty filter: "${difficulty}"`);
  console.log(`Using model: "${modelToUse}"`);
  console.log(`Auto-fix: ${doAutoFix}, Auto-delete: ${doAutoDelete}`);
  console.log(`Force re-validation: ${force}`);
  console.log(`Batch size: ${batchSize}`);
  console.log('----------------------------------------------------');

  try {
    let firestoreQuery: admin.firestore.Query = db.collection(PREDEFINED_QUESTIONS_COLLECTION).where('topicValue', '==', topicValue);
    if (difficulty) {
      firestoreQuery = firestoreQuery.where('difficulty', '==', difficulty as DifficultyLevel);
    }
    
    const snapshot = await firestoreQuery.get();
    
    if (snapshot.empty) {
      console.log(`No questions found for topic "${topicValue}"` + (difficulty ? ` and difficulty "${difficulty}"` : '.') );
      return;
    }

    const allQuestionsInScope = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        topicValue: data.topicValue,
        question: data.question,
        answers: data.answers,
        correctAnswerIndex: data.correctAnswerIndex,
        explanation: data.explanation,
        hint: data.hint,
        difficulty: data.difficulty,
        status: data.status,
        source: data.source,
        createdAt: data.createdAt ? (data.createdAt as admin.firestore.Timestamp).toDate().toISOString() : undefined,
      };
    });

    const questionsToValidate = force
      ? allQuestionsInScope
      : allQuestionsInScope.filter(q => !['accepted', 'fixed'].includes(q.status || ''));

    if (questionsToValidate.length === 0) {
        console.log('All questions found for the specified criteria have already been validated. Use --force to re-validate all.');
        return;
    }

    console.log(`Found ${allQuestionsInScope.length} total questions. Will validate ${questionsToValidate.length} of them.`);
    let acceptedCount = 0;
    let fixedCount = 0;
    let rejectedCount = 0;
    let deletedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < questionsToValidate.length; i += batchSize) {
      const batch = questionsToValidate.slice(i, i + batchSize);
      console.log(`\n--- Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(questionsToValidate.length / batchSize)} (size: ${batch.length}) ---`);

      const validationPromises = batch.map(question => {
        const flowInput: ValidateSingleQuestionInput = {
          questionData: question,
          modelName: modelToUse,
        };
        return validateSingleTriviaQuestion(flowInput);
      });

      const results = await Promise.allSettled(validationPromises);

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const question = batch[j]!;

        console.log(`\n[${i + j + 1}/${questionsToValidate.length}] Validating question ID: ${question.id} (Current status: ${question.status || 'none'})`);

        if (result.status === 'fulfilled') {
          const validationResult = result.value;
          console.log(`  > AI Status: ${validationResult.validationStatus}. Reason: ${validationResult.reasoning}`);

          if (validationResult.validationStatus === 'Accept') {
            acceptedCount++;
            await db.collection(PREDEFINED_QUESTIONS_COLLECTION).doc(question.id).update({ status: 'accepted' });
            console.log(`  > ACTION: Question ${question.id} accepted and status updated.`);
          } else if (validationResult.validationStatus === 'Reject') {
            rejectedCount++;
            if (doAutoDelete) {
              await db.collection(PREDEFINED_QUESTIONS_COLLECTION).doc(question.id).delete();
              console.log(`  > ACTION: Question ${question.id} automatically DELETED.`);
              deletedCount++;
            } else {
              console.log(`  > ACTION: Manual deletion recommended.`);
            }
          } else if (validationResult.validationStatus === 'Fix' && validationResult.fixedQuestionData) {
            fixedCount++;
            if (doAutoFix) {
              await db.collection(PREDEFINED_QUESTIONS_COLLECTION).doc(question.id).update({ 
                ...validationResult.fixedQuestionData,
                status: 'fixed'
              });
              console.log(`  > ACTION: Question ${question.id} automatically FIXED and status updated.`);
            } else {
              console.log(`  > ACTION: Manual fix recommended.`);
            }
          }
        } else { // status is 'rejected'
          console.error(`  > ERROR validating question ${question.id}:`, result.reason);
          errorCount++;
        }
      }
    }

    console.log('\n--- Validation Summary ---');
    console.log(`Total Questions Processed: ${questionsToValidate.length}`);
    console.log(`Accepted & Status Set: ${acceptedCount}`);
    console.log(`Fixed & Status Set: ${fixedCount} (applied automatically if --autofix or --auto was used)`);
    console.log(`Rejected: ${rejectedCount}`);
    console.log(`  - Deleted: ${deletedCount} (applied automatically if --autodelete or --auto was used)`);
    console.log(`Errors during validation: ${errorCount}`);
    console.log('--------------------------');

  } catch (error) {
    console.error("Fatal error during script execution:", error);
    if (error instanceof Error && error.message.includes('INVALID_ARGUMENT')) {
        console.error("\nFirestore query error: This can happen if the 'status' field does not exist on any documents matching your query. To resolve this, you can run a one-time script to add a default status to documents or manually add the 'status' field to at least one document in the query's scope.");
    }
  }
}

validateMultipleQuestions().catch(error => {
  console.error("Unhandled error in validateMultipleQuestions script:", error);
  process.exit(1);
});
```