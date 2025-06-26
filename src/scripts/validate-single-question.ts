
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import admin from 'firebase-admin';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import inquirer from 'inquirer';
import { validateSingleTriviaQuestion, type ValidateSingleQuestionInput, type ValidateSingleQuestionOutput, type QuestionData } from '../src/ai/flows/validate-single-trivia-question';
import type { GenerateTriviaQuestionOutput, BilingualText, DifficultyLevel } from '@/types';

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
const PREDEFINED_QUESTIONS_COLLECTION = 'predefinedTriviaQuestions';
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


function normalizeFirestoreDocToQuestionData(doc: admin.firestore.DocumentSnapshot): QuestionData | null {
    const data = doc.data();
    if (!data) return null;

    // Base validation for common fields
    if (!data.question || !data.explanation || !data.difficulty || !data.topicValue) {
        return null;
    }

    const baseQuestion = {
        id: doc.id,
        question: data.question as BilingualText,
        explanation: data.explanation as BilingualText,
        difficulty: data.difficulty as DifficultyLevel,
        topicValue: data.topicValue as string,
        hint: data.hint as BilingualText | undefined,
        status: data.status as 'accepted' | 'fixed' | undefined,
        source: data.source as string | undefined,
        createdAt: data.createdAt ? (data.createdAt as admin.firestore.Timestamp).toDate().toISOString() : undefined,
        imagePrompt: data.imagePrompt as string | undefined,
        imageUrl: data.imageUrl as string | undefined,
    };

    // Check for new format
    if (data.correctAnswer && Array.isArray(data.distractors) && data.distractors.length === 3) {
        return {
            ...baseQuestion,
            correctAnswer: data.correctAnswer as BilingualText,
            distractors: data.distractors as BilingualText[]
        };
    }

    // Check for old format and convert
    if (Array.isArray(data.answers) && data.answers.length === 4 && typeof data.correctAnswerIndex === 'number') {
        const { answers, correctAnswerIndex } = data;
        const correctAnswer = answers[correctAnswerIndex];
        if (!correctAnswer) {
            console.warn(`[normalizeQuestion] Invalid old format for ${doc.id}: correctAnswerIndex out of bounds.`);
            return null;
        }
        const distractors = answers.filter((_: any, i: number) => i !== correctAnswerIndex);

        return {
            ...baseQuestion,
            correctAnswer: correctAnswer,
            distractors: distractors
        };
    }

    console.warn(`[normalizeQuestion] Document ${doc.id} does not match any known question format. Skipping.`);
    return null;
}

function formatQuestionForDisplay(label: string, qData: QuestionData | GenerateTriviaQuestionOutput, originalId?: string, originalTopicValue?: string) {
  console.log(`\n--- ${label} ---`);
  if (originalId) console.log(`ID: ${originalId}`);
  if (originalTopicValue) console.log(`Topic Value: ${originalTopicValue}`);
  
  const isFullQuestionData = (data: any): data is QuestionData => 'id' in data;

  const dataToDisplay = isFullQuestionData(qData) ? qData : qData as GenerateTriviaQuestionOutput;

  console.log(`Difficulty: ${dataToDisplay.difficulty}`);
  console.log(`Question EN: ${dataToDisplay.question.en}`);
  console.log(`Question ES: ${dataToDisplay.question.es}`);
  console.log(`Correct Answer EN: ${dataToDisplay.correctAnswer.en}`);
  console.log(`Correct Answer ES: ${dataToDisplay.correctAnswer.es}`);
  
  dataToDisplay.distractors.forEach((ans, i) => {
    console.log(`  Distractor ${i + 1} EN: ${ans.en}`);
    console.log(`  Distractor ${i + 1} ES: ${ans.es}`);
  });

  console.log(`Explanation EN: ${dataToDisplay.explanation.en}`);
  console.log(`Explanation ES: ${dataToDisplay.explanation.es}`);

  if (dataToDisplay.hint) {
    console.log(`Hint EN: ${dataToDisplay.hint.en}`);
    console.log(`Hint ES: ${dataToDisplay.hint.es}`);
  }
  
  if (dataToDisplay.imagePrompt) {
    console.log(`Image Prompt: ${dataToDisplay.imagePrompt}`);
  }
  
  const displayableData = qData as any; // Cast to access imageUrl for both types
  if (displayableData.imageUrl) {
    console.log(`Image URL: ${displayableData.imageUrl}`);
  }


  if (isFullQuestionData(qData)) {
    if (qData.status) console.log(`Status: ${qData.status}`);
    if (qData.source) console.log(`Source: ${qData.source}`);
    if (qData.createdAt) console.log(`Created At: ${qData.createdAt}`);
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
    const questionRef = db.collection(PREDEFINED_QUESTIONS_COLLECTION).doc(questionId);
    const docSnap = await questionRef.get();

    if (!docSnap.exists) {
      console.error(`Error: Question with ID "${questionId}" not found in Firestore collection "${PREDEFINED_QUESTIONS_COLLECTION}".`);
      return;
    }

    const originalQuestionData = normalizeFirestoreDocToQuestionData(docSnap);
    
    if (!originalQuestionData) {
        console.error(`Error: Could not normalize question data for ID "${questionId}". It might have an invalid format.`);
        return;
    }
    
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
      formatQuestionForDisplay("Fixed Question (Proposed by AI)", validationResult.fixedQuestionData, originalQuestionData.id, originalQuestionData.topicValue);
      
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
          const dataToUpdate = { 
            ...validationResult.fixedQuestionData,
            status: 'fixed'
          };
          await db.collection(PREDEFINED_QUESTIONS_COLLECTION).doc(questionId).update(dataToUpdate);
          console.log(`Successfully applied fix and set status to 'fixed' for question ID: ${questionId}`);
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
      console.log("AI validation passed. Updating status to 'accepted'.");
      try {
        await db.collection(PREDEFINED_QUESTIONS_COLLECTION).doc(questionId).update({ status: 'accepted' });
        console.log(`Successfully set status to 'accepted' for question ID: ${questionId}.`);
      } catch (updateError) {
        console.error(`Failed to update status for question ID: ${questionId}`, updateError);
      }
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
