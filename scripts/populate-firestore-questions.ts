
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import admin from 'firebase-admin';
import { generateTriviaQuestion, type GenerateTriviaQuestionInput, type GenerateTriviaQuestionOutput, type DifficultyLevel } from '../src/ai/flows/generate-trivia-question';
import { ai } from '../src/ai/genkit'; // Ensure Genkit is initialized
import { getAppCategories } from '../src/services/categoryService'; // Import the new service
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

const ALL_DIFFICULTY_LEVELS: DifficultyLevel[] = ["very easy", "easy", "medium", "hard", "very hard"];

const TARGET_QUESTIONS_PER_CATEGORY_DIFFICULTY = 5; 
const MAX_NEW_QUESTIONS_PER_RUN_PER_DIFFICULTY = 2; 
const GENKIT_API_CALL_DELAY_MS = 7000; 

async function populateQuestions() {
  console.log('Starting Firestore question population script (English instructions, target difficulty per category, with detailed category prompts)...');

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
            // We only need English concepts for previousQuestions, as AI instructions are in English
          }
          if (data.answers && typeof data.correctAnswerIndex === 'number' && data.answers[data.correctAnswerIndex]) {
            const correctAnswer = data.answers[data.correctAnswerIndex]!; 
            if (correctAnswer.en) existingCorrectAnswerConceptTexts.push(correctAnswer.en);
            // We only need English concepts for previousCorrectAnswers
          }
      });


      const numExistingForDifficulty = querySnapshot.size;
      console.log(`  Found ${numExistingForDifficulty} existing questions for ${category.name.en} with difficulty "${difficulty}". Target is ${TARGET_QUESTIONS_PER_CATEGORY_DIFFICULTY}.`);

      if (numExistingForDifficulty >= TARGET_QUESTIONS_PER_CATEGORY_DIFFICULTY) {
        console.log(`  Target reached for ${category.name.en} - ${difficulty}. Skipping generation for this difficulty.`);
        continue;
      }

      const numToGenerate = Math.min(
        MAX_NEW_QUESTIONS_PER_RUN_PER_DIFFICULTY,
        TARGET_QUESTIONS_PER_CATEGORY_DIFFICULTY - numExistingForDifficulty
      );

      console.log(`  Attempting to generate ${numToGenerate} new questions for ${category.name.en} - ${difficulty}...`);

      for (let i = 0; i < numToGenerate; i++) {
        try {
          const input: GenerateTriviaQuestionInput = {
            topic: category.topicValue, 
            previousQuestions: [...existingQuestionConceptTexts], 
            previousCorrectAnswers: [...existingCorrectAnswerConceptTexts], 
            targetDifficulty: difficulty,
            categoryInstructions: category.detailedPromptInstructions, // Pass English-only instructions
          };
          
          if (category.difficultySpecificGuidelines && category.difficultySpecificGuidelines[difficulty]) {
            input.difficultySpecificInstruction = category.difficultySpecificGuidelines[difficulty]; // Pass English-only instruction
          }


          console.log(`  Generating question ${i + 1} of ${numToGenerate} for ${category.name.en} - ${difficulty}...`);
          
          const newQuestionData: GenerateTriviaQuestionOutput = await generateTriviaQuestion(input);

          if (newQuestionData && newQuestionData.question && newQuestionData.answers && newQuestionData.difficulty) {
            if (newQuestionData.difficulty !== difficulty) {
                console.warn(`  AI generated question with difficulty "${newQuestionData.difficulty}" but target was "${difficulty}". Saving with AI's assessed difficulty (though it should match target).`);
            }

            const questionToSave = {
              ...newQuestionData,
              topicValue: category.topicValue, 
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              source: 'batch-script-aitrivia-english-instr-target-difficulty-v4-category-prompts'
            };

            await questionsRef.add(questionToSave);
            console.log(`  Successfully generated and saved question (AI difficulty: ${newQuestionData.difficulty}, Target: ${difficulty}): "${newQuestionData.question.en.substring(0,30)}..." / "${newQuestionData.question.es.substring(0,30)}..."`);
            
            if (newQuestionData.question.en) existingQuestionConceptTexts.push(newQuestionData.question.en);
            
            const correctAnswer = newQuestionData.answers[newQuestionData.correctAnswerIndex];
            if (correctAnswer && correctAnswer.en) {
              existingCorrectAnswerConceptTexts.push(correctAnswer.en);
            }

          } else {
            console.warn(`  Genkit returned empty or invalid data for question (Category: ${category.name.en}, Target Difficulty: ${difficulty}).`);
          }
        } catch (error) {
          console.error(`  Error generating question for ${category.name.en} - ${difficulty}:`, error);
        }
        if (i < numToGenerate - 1) {
           console.log(`  Waiting ${GENKIT_API_CALL_DELAY_MS / 1000}s before next API call...`);
           await new Promise(resolve => setTimeout(resolve, GENKIT_API_CALL_DELAY_MS));
        }
      } 
      console.log(`  Finished generation for ${category.name.en} - ${difficulty} for this run.`);
      if (ALL_DIFFICULTY_LEVELS.indexOf(difficulty) < ALL_DIFFICULTY_LEVELS.length -1) {
        console.log(`  Waiting ${GENKIT_API_CALL_DELAY_MS / 2000}s before next difficulty level...`);
        await new Promise(resolve => setTimeout(resolve, GENKIT_API_CALL_DELAY_MS / 2));
      }

    } 
    console.log(`Finished all difficulty levels for category: ${category.name.en}.`);
     if (appCategories.indexOf(category) < appCategories.length - 1) {
        console.log(`Waiting ${GENKIT_API_CALL_DELAY_MS / 1000}s before next category...`);
        await new Promise(resolve => setTimeout(resolve, GENKIT_API_CALL_DELAY_MS));
     }
  } 
  console.log('\nEnglish-instruction based question population script (with category-specific prompts and target difficulty) finished.');
}

populateQuestions().catch(error => {
  console.error("Unhandled error in populateQuestions:", error);
  process.exit(1);
});
