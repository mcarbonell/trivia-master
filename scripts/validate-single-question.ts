
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import admin from 'firebase-admin';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import inquirer from 'inquirer';
// Import getDoc from firebase/firestore/lite for admin SDK scripts if not modifying data.
// However, since we might update/delete, using the full 'firebase/firestore' is okay for now
// but be mindful if you split read-only scripts later.
// For admin scripts, it's often better to use the admin SDK throughout.
// Let's use the admin SDK for Firestore operations directly.
// import { doc, getDoc } from 'firebase/firestore'; // Client SDK
import { validateSingleTriviaQuestion, type ValidateSingleQuestionInput, type ValidateSingleQuestionOutput, type QuestionData } from '../src/ai/flows/validate-single-trivia-question';
import { updatePredefinedQuestion, deletePredefinedQuestion } from '../src/services/triviaService'; // Re-add PREDEFINED_QUESTIONS_COLLECTION if needed
import type { GenerateTriviaQuestionOutput, BilingualText, DifficultyLevel } from '@/ai/flows/generate-trivia-question'; // For fixedQuestionData structure

// Initialize Firebase Admin SDK
try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(), // Assumes GOOGLE_APPLICATION_CREDENTIALS is set
    });
  }
} catch (error) {
  console.error('Firebase Admin initialization error. Make sure GOOGLE_APPLICATION_CREDENTIALS is set correctly.', error);
  process.exit(1);
}

const db = admin.firestore();
const PREDEFINED_QUESTIONS_COLLECTION = 'predefinedTriviaQuestions'; // Define locally
const DEFAULT_MODEL_FOR_VALIDATION = 'googleai/gemini-2.5-flash';

// --- Argument Parsing with yargs ---
const argv = yargs(hideBin(process.argv))
  .option('id', {
    alias: 'i',
    type: 'string',
    description: 'Firestore document ID of the question to validate.',
    demandOption: true,
  })
  .option('model', {
    alias: 'm',
    type: 'string',
    description: `Genkit model name to use for validation (e.g., googleai/gemini-1.5-pro). Defaults to ${DEFAULT_MODEL_FOR_VALIDATION}.`,
  })
  .option('autofix', {
    alias: 'af',
    type: 'boolean',
    default: false,
    description: 'If true, automatically apply AI fixes without confirmation.',
  })
  .option('autodelete', {
    alias: 'ad',
    type: 'boolean',
    default: false,
    description: 'If true, automatically delete rejected questions without confirmation.',
  })
  .option('auto', {
    alias: 'a',
    type: 'boolean',
    default: false,
    description: 'Shorthand for --autofix and --autodelete.',
  })
  .help()
  .alias('help', 'h')
  .parseSync();

function formatQuestionForDisplay(label: string, qData: QuestionData | GenerateTriviaQuestionOutput, originalId?: string, originalTopicValue?: string) {
  console.log(`\n--- ${label} ---`);
  if (originalId) console.log(`ID: ${originalId}`);
  if (originalTopicValue) console.log(`Topic Value: ${originalTopicValue}`);
  
  // Type guard to check if it's QuestionData (which has id, topicValue etc.) or GenerateTriviaQuestionOutput
  const isFullQuestionData = (data: any): data is QuestionData => 'id' in data;

  if (!isFullQuestionData(qData) || label.startsWith("Fixed")) { // For fixed data, or if we are passed the partial fixed structure
     const data = qData as GenerateTriviaQuestionOutput; // Cast to the structure AI returns for fixes
     console.log(`Difficulty: ${data.difficulty}`);
     console.log(`Question EN: ${data.question.en}`);
     console.log(`Question ES: ${data.question.es}`);
     data.answers.forEach((ans, i) => {
       console.log(`  Answer ${i + 1} EN: ${ans.en}`);
       console.log(`  Answer ${i + 1} ES: ${ans.es}`);
     });
     console.log(`Correct Answer Index: ${data.correctAnswerIndex}`);
     console.log(`Explanation EN: ${data.explanation.en}`);
     console.log(`Explanation ES: ${data.explanation.es}`);
     if (data.hint) {
       console.log(`Hint EN: ${data.hint.en}`);
       console.log(`Hint ES: ${data.hint.es}`);
     }
  } else { // It's the full QuestionData from Firestore
    const data = qData as QuestionData;
    console.log(`Difficulty: ${data.difficulty}`);
    console.log(`Question EN: ${data.question.en}`);
    console.log(`Question ES: ${data.question.es}`);
    data.answers.forEach((ans, i) => {
      console.log(`  Answer ${i + 1} EN: ${ans.en}`);
      console.log(`  Answer ${i + 1} ES: ${ans.es}`);
    });
    console.log(`Correct Answer Index: ${data.correctAnswerIndex}`);
    console.log(`Explanation EN: ${data.explanation.en}`);
    console.log(`Explanation ES: ${data.explanation.es}`);
    if (data.hint) {
      console.log(`Hint EN: ${data.hint.en}`);
      console.log(`Hint ES: ${data.hint.es}`);
    }
    if (data.source) console.log(`Source: ${data.source}`);
    if (data.createdAt) console.log(`Created At: ${data.createdAt}`);
  }
  console.log(`--- End ${label} ---\n`);
}


async function validateQuestion() {
  const { id: questionId, model: modelName } = argv;
  const doAutoFix = argv.autofix || argv.auto;
  const doAutoDelete = argv.autodelete || argv.auto;
  const modelToUse = modelName || DEFAULT_MODEL_FOR_VALIDATION;

  console.log(`Validating question with ID: "${questionId}" using model: "${modelToUse}"...`);
  if(doAutoFix) console.log("Auto-fix mode enabled.");
  if(doAutoDelete) console.log("Auto-delete mode enabled.");

  try {
    const questionRef = db.collection(PREDEFINED_QUESTIONS_COLLECTION).doc(questionId); // Use admin SDK
    const docSnap = await questionRef.get();

    if (!docSnap.exists) {
      console.error(`Error: Question with ID "${questionId}" not found in Firestore collection "${PREDEFINED_QUESTIONS_COLLECTION}".`);
      return;
    }

    const firestoreData = docSnap.data();
    const originalQuestionData: QuestionData = {
        id: docSnap.id,
        topicValue: firestoreData?.topicValue,
        question: firestoreData?.question,
        answers: firestoreData?.answers,
        correctAnswerIndex: firestoreData?.correctAnswerIndex,
        explanation: firestoreData?.explanation,
        hint: firestoreData?.hint,
        difficulty: firestoreData?.difficulty,
        source: firestoreData?.source,
        createdAt: firestoreData?.createdAt ? (firestoreData.createdAt as admin.firestore.Timestamp).toDate().toISOString() : undefined,
    };
    
    formatQuestionForDisplay("Original Question", originalQuestionData);

    const flowInput: ValidateSingleQuestionInput = {
      questionData: originalQuestionData,
      modelName: modelToUse,
    };

    const validationResult: ValidateSingleQuestionOutput = await validateSingleTriviaQuestion(flowInput);

    console.log("\n--- AI Validation Result ---");
    console.log(`Status: ${validationResult.validationStatus}`);
    console.log(`Reasoning: ${validationResult.reasoning}`);
    console.log("--------------------------\n");

    if (validationResult.validationStatus === "Fix" && validationResult.fixedQuestionData) {
      console.log("AI has proposed a fix for the question:");
      formatQuestionForDisplay("Fixed Question (Proposed by AI)", validationResult.fixedQuestionData as GenerateTriviaQuestionOutput, originalQuestionData.id, originalQuestionData.topicValue);
      
      let confirmFix = false;
      if (doAutoFix) {
        console.log("--autofix or --auto flag is set. Applying fix automatically.");
        confirmFix = true;
      } else {
        const answer = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmFix',
            message: 'Do you want to apply this fix to the question in Firestore?',
            default: false,
          },
        ]);
        confirmFix = answer.confirmFix;
      }

      if (confirmFix) {
        try {
          const dataToUpdate = { ...validationResult.fixedQuestionData };
          if (dataToUpdate.hint === undefined) {
            // This is handled correctly by Firestore update if hint doesn't exist on the object
          }
          await db.collection(PREDEFINED_QUESTIONS_COLLECTION).doc(questionId).update(dataToUpdate);
          console.log(`Successfully applied fix to question ID: ${questionId}`);
        } catch (updateError) {
          console.error(`Failed to apply fix to question ID: ${questionId}`, updateError);
        }
      } else {
        console.log('Fix not applied.');
      }
    } else if (validationResult.validationStatus === "Reject") {
        let confirmDelete = false;
        if(doAutoDelete) {
            console.log("--autodelete or --auto flag is set. Deleting question automatically.");
            confirmDelete = true;
        } else {
            const answer = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'confirmDelete',
                    message: 'The AI recommends rejecting this question. Do you want to delete it from Firestore?',
                    default: false,
                },
            ]);
            confirmDelete = answer.confirmDelete;
        }

        if (confirmDelete) {
            try {
            await db.collection(PREDEFINED_QUESTIONS_COLLECTION).doc(questionId).delete();
            console.log(`Successfully deleted rejected question ID: ${questionId}`);
            } catch (deleteError) {
            console.error(`Failed to delete rejected question ID: ${questionId}`, deleteError);
            }
        } else {
            console.log('Question not deleted.');
        }
    } else if (validationResult.validationStatus === "Accept") {
      console.log("AI validation passed. No action needed for this question.");
    }

  } catch (error) {
    console.error("Error during question validation process:", error);
    if (error instanceof Error) {
        console.error("Error message:", error.message);
      }
  }
  console.log('Question validation script finished.');
}

validateQuestion().catch(error => {
  console.error("Unhandled error in validateQuestion script:", error);
  process.exit(1);
});
