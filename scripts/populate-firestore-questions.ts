
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import admin from 'firebase-admin';
import { generateTriviaQuestions, type GenerateTriviaQuestionsInput, type GenerateTriviaQuestionOutput, type DifficultyLevel } from '../src/ai/flows/generate-trivia-question'; // Updated import
import { ai } from '../src/ai/genkit'; // Ensure Genkit is initialized
import { getAppCategories } from '../src/services/categoryService'; 
import type { CategoryDefinition } from '../src/types';

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

const ALL_DIFFICULTY_LEVELS: DifficultyLevel[] = ["easy", "medium", "hard"];

const TARGET_QUESTIONS_PER_CATEGORY_DIFFICULTY = 5; 
const MAX_NEW_QUESTIONS_TO_FETCH_PER_RUN_PER_DIFFICULTY_TARGET = 2; // Max new questions to try and fetch if below target
const QUESTIONS_TO_GENERATE_PER_API_CALL = 5; // How many questions to ask Genkit for in one batch
const GENKIT_API_CALL_DELAY_MS = 7000; 

async function populateQuestions() {
  console.log(`Starting Firestore question population script (Batch generation, target: ${QUESTIONS_TO_GENERATE_PER_API_CALL} per call)...`);

  const appCategories = await getAppCategories();
  if (!appCategories || appCategories.length === 0) {
    console.error("No categories found in Firestore 'triviaCategories' collection. Please populate it first.");
    return;
  }
  console.log(`Found ${appCategories.length} categories to process.`);

  for (const category of appCategories) {
    console.log(`\nProcessing Category: "${category.name.en}" (TopicValue: ${category.topicValue})`);

    for (const difficulty of ALL_DIFFICULTY_LEVELS) {
      console.log(`  Targeting Difficulty: "${difficulty}" for category "${category.name.en}"`);

      const questionsRef = db.collection(PREDEFINED_QUESTIONS_COLLECTION);
      
      const querySnapshot = await questionsRef
        .where('topicValue', '==', category.topicValue)
        .where('difficulty', '==', difficulty)
        .get();

      const existingQuestionConceptTexts: string[] = [];
      const existingCorrectAnswerConceptTexts: string[] = [];

      const allCategoryQuestionsSnapshot = await questionsRef.where('topicValue', '==', category.topicValue).get();
      allCategoryQuestionsSnapshot.forEach(doc => {
        const data = doc.data() as GenerateTriviaQuestionOutput & { topicValue: string };
         if (data.question) { 
            if (data.question.en) existingQuestionConceptTexts.push(data.question.en);
          }
          if (data.answers && typeof data.correctAnswerIndex === 'number' && data.answers[data.correctAnswerIndex]) {
            const correctAnswer = data.answers[data.correctAnswerIndex]!; 
            if (correctAnswer.en) existingCorrectAnswerConceptTexts.push(correctAnswer.en);
          }
      });


      const numExistingForDifficulty = querySnapshot.size;
      console.log(`  Found ${numExistingForDifficulty} existing questions for ${category.name.en} with difficulty "${difficulty}". Target is ${TARGET_QUESTIONS_PER_CATEGORY_DIFFICULTY}.`);

      if (numExistingForDifficulty >= TARGET_QUESTIONS_PER_CATEGORY_DIFFICULTY) {
        console.log(`  Target reached for ${category.name.en} - ${difficulty}. Skipping generation for this difficulty.`);
        continue;
      }

      const numToPotentiallyGenerateThisRun = Math.min(
        MAX_NEW_QUESTIONS_TO_FETCH_PER_RUN_PER_DIFFICULTY_TARGET,
        TARGET_QUESTIONS_PER_CATEGORY_DIFFICULTY - numExistingForDifficulty
      );
      
      // Determine actual number to request in this API call, up to batch size
      const actualQuestionsToRequestInBatch = Math.min(numToPotentiallyGenerateThisRun, QUESTIONS_TO_GENERATE_PER_API_CALL);


      if (actualQuestionsToRequestInBatch <= 0) {
          console.log(`  No new questions needed for ${category.name.en} - ${difficulty} in this run based on limits.`);
          continue;
      }

      console.log(`  Attempting to generate up to ${actualQuestionsToRequestInBatch} new questions for ${category.name.en} - ${difficulty} (requesting batch of ${QUESTIONS_TO_GENERATE_PER_API_CALL} if needed)...`);

      try {
        const input: GenerateTriviaQuestionsInput = {
          topic: category.topicValue, 
          previousQuestions: [...existingQuestionConceptTexts], 
          previousCorrectAnswers: [...existingCorrectAnswerConceptTexts], 
          targetDifficulty: difficulty,
          categoryInstructions: category.detailedPromptInstructions, 
          count: actualQuestionsToRequestInBatch, // Request the determined batch size
        };
        
        if (category.difficultySpecificGuidelines && category.difficultySpecificGuidelines[difficulty]) {
          input.difficultySpecificInstruction = category.difficultySpecificGuidelines[difficulty];
        }

        console.log(`  Generating a batch of ${input.count} questions for ${category.name.en} - ${difficulty}...`);
        
        const newQuestionsArray: GenerateTriviaQuestionOutput[] = await generateTriviaQuestions(input); // Updated call

        if (newQuestionsArray && newQuestionsArray.length > 0) {
          let questionsSavedThisBatch = 0;
          for (const newQuestionData of newQuestionsArray) {
            if (questionsSavedThisBatch >= numToPotentiallyGenerateThisRun) break; // Stop if we've hit the run target

            if (newQuestionData && newQuestionData.question && newQuestionData.answers && newQuestionData.difficulty) {
              if (newQuestionData.difficulty !== difficulty) {
                  console.warn(`  AI generated question with difficulty "${newQuestionData.difficulty}" but target was "${difficulty}". Saving with AI's assessed difficulty.`);
              }

              const questionToSave = {
                ...newQuestionData,
                topicValue: category.topicValue, 
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                source: 'batch-script-v2-target-difficulty-category-prompts' // Updated source
              };

              await questionsRef.add(questionToSave);
              questionsSavedThisBatch++;
              console.log(`    > Saved question (AI difficulty: ${newQuestionData.difficulty}, Target: ${difficulty}): "${newQuestionData.question.en.substring(0,30)}..." / "${newQuestionData.question.es.substring(0,30)}..."`);
              
              if (newQuestionData.question.en) existingQuestionConceptTexts.push(newQuestionData.question.en);
              
              const correctAnswer = newQuestionData.answers[newQuestionData.correctAnswerIndex];
              if (correctAnswer && correctAnswer.en) {
                existingCorrectAnswerConceptTexts.push(correctAnswer.en);
              }
            } else {
              console.warn(`  Genkit returned empty or invalid data for one question in batch (Category: ${category.name.en}, Target Difficulty: ${difficulty}).`);
            }
          }
          console.log(`  Successfully saved ${questionsSavedThisBatch} new questions from the batch for ${category.name.en} - ${difficulty}.`);

        } else {
          console.warn(`  Genkit returned an empty array or invalid data for the batch (Category: ${category.name.en}, Target Difficulty: ${difficulty}).`);
        }
      } catch (error) {
        console.error(`  Error generating question batch for ${category.name.en} - ${difficulty}:`, error);
      }
      
      console.log(`  Finished generation attempt for ${category.name.en} - ${difficulty} for this run.`);
      console.log(`  Waiting ${GENKIT_API_CALL_DELAY_MS / 1000}s before next API call (for next difficulty or category)...`);
      await new Promise(resolve => setTimeout(resolve, GENKIT_API_CALL_DELAY_MS));

    } 
    console.log(`Finished all difficulty levels for category: ${category.name.en}.`);
     if (appCategories.indexOf(category) < appCategories.length - 1) {
        // No extra delay here, already delayed after each difficulty
     }
  } 
  console.log('\nBatch question population script finished.');
}

populateQuestions().catch(error => {
  console.error("Unhandled error in populateQuestions:", error);
  process.exit(1);
});

