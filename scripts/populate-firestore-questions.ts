
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import admin from 'firebase-admin';
import { generateTriviaQuestion, type GenerateTriviaQuestionInput, type GenerateTriviaQuestionOutput, type DifficultyLevel } from '../src/ai/flows/generate-trivia-question';
import { ai } from '../src/ai/genkit'; // Ensure Genkit is initialized

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

interface PredefinedCategory {
  name: string; // For display/logging
  topicValue: string; // Value passed to AI
}

const PREDEFINED_CATEGORIES_FOR_SCRIPT: PredefinedCategory[] = [
  { name: "Science", topicValue: "Science" },
  { name: "World History", topicValue: "World History" },
  { name: "Sports", topicValue: "Sports" },
  { name: "Movies", topicValue: "Movies" },
  { name: "Geography", topicValue: "Geography" },
  { name: "Popular Music History", topicValue: "Popular Music History" },
];

const ALL_DIFFICULTY_LEVELS: DifficultyLevel[] = ["very easy", "easy", "medium", "hard", "very hard"];

const TARGET_QUESTIONS_PER_CATEGORY_DIFFICULTY = 5; // Target number of questions per category AND per difficulty
const MAX_NEW_QUESTIONS_PER_RUN_PER_DIFFICULTY = 2; // Max new questions to generate in one script run for each category/difficulty combo
const GENKIT_API_CALL_DELAY_MS = 7000; // Delay between Genkit API calls (7 seconds)

async function populateQuestions() {
  console.log('Starting Firestore question population script (bilingual, target difficulty per category)...');

  for (const category of PREDEFINED_CATEGORIES_FOR_SCRIPT) {
    console.log(`\nProcessing Category: "${category.name}" (Topic: ${category.topicValue})`);

    for (const difficulty of ALL_DIFFICULTY_LEVELS) {
      console.log(`  Targeting Difficulty: "${difficulty}" for category "${category.name}"`);

      const questionsRef = db.collection(PREDEFINED_QUESTIONS_COLLECTION);
      
      // Query for existing questions for this category and difficulty
      const querySnapshot = await questionsRef
        .where('topicValue', '==', category.topicValue)
        .where('difficulty', '==', difficulty)
        .get();

      const existingQuestionConceptTexts: string[] = [];
      const existingCorrectAnswerConceptTexts: string[] = [];

      // Collect all existing questions for this specific category and difficulty to pass as context for new generation
      // Also, collect all questions across all difficulties for this category to avoid broader conceptual overlaps
      const allCategoryQuestionsSnapshot = await questionsRef.where('topicValue', '==', category.topicValue).get();
      allCategoryQuestionsSnapshot.forEach(doc => {
        const data = doc.data() as GenerateTriviaQuestionOutput & { topicValue: string };
         if (data.question) { 
            if (data.question.en) existingQuestionConceptTexts.push(data.question.en);
            if (data.question.es) existingQuestionConceptTexts.push(data.question.es);
          }
          if (data.answers && typeof data.correctAnswerIndex === 'number' && data.answers[data.correctAnswerIndex]) {
            const correctAnswer = data.answers[data.correctAnswerIndex]!; 
            if (correctAnswer.en) existingCorrectAnswerConceptTexts.push(correctAnswer.en);
            if (correctAnswer.es) existingCorrectAnswerConceptTexts.push(correctAnswer.es);
          }
      });


      const numExistingForDifficulty = querySnapshot.size;
      console.log(`  Found ${numExistingForDifficulty} existing questions for ${category.name} with difficulty "${difficulty}". Target is ${TARGET_QUESTIONS_PER_CATEGORY_DIFFICULTY}.`);

      if (numExistingForDifficulty >= TARGET_QUESTIONS_PER_CATEGORY_DIFFICULTY) {
        console.log(`  Target reached for ${category.name} - ${difficulty}. Skipping generation for this difficulty.`);
        continue;
      }

      const numToGenerate = Math.min(
        MAX_NEW_QUESTIONS_PER_RUN_PER_DIFFICULTY,
        TARGET_QUESTIONS_PER_CATEGORY_DIFFICULTY - numExistingForDifficulty
      );

      console.log(`  Attempting to generate ${numToGenerate} new questions for ${category.name} - ${difficulty}...`);

      for (let i = 0; i < numToGenerate; i++) {
        try {
          const input: GenerateTriviaQuestionInput = {
            topic: category.topicValue,
            previousQuestions: [...existingQuestionConceptTexts], // Use all known questions for the category
            previousCorrectAnswers: [...existingCorrectAnswerConceptTexts], // Use all known correct answers for the category
            targetDifficulty: difficulty, // Explicitly set the target difficulty
          };

          console.log(`  Generating question ${i + 1} of ${numToGenerate} for ${category.name} - ${difficulty}...`);
          if (i === 0 && difficulty === ALL_DIFFICULTY_LEVELS[0]) await new Promise(resolve => setTimeout(resolve, 500)); // Small initial delay for the very first call in a category
          
          const newQuestionData: GenerateTriviaQuestionOutput = await generateTriviaQuestion(input);

          if (newQuestionData && newQuestionData.question && newQuestionData.answers && newQuestionData.difficulty) {
            // Double-check if AI respected the target difficulty.
            // The prompt instructs it to, but it's good to be aware.
            if (newQuestionData.difficulty !== difficulty) {
                console.warn(`  AI generated question with difficulty "${newQuestionData.difficulty}" but target was "${difficulty}". Saving with AI's assessed difficulty.`);
            }

            const questionToSave = {
              ...newQuestionData, // This now includes the difficulty assessed by AI (or targeted)
              topicValue: category.topicValue,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              source: 'batch-script-aitrivia-bilingual-target-difficulty-v2'
            };

            await questionsRef.add(questionToSave);
            console.log(`  Successfully generated and saved question (AI difficulty: ${newQuestionData.difficulty}, Target: ${difficulty}): "${newQuestionData.question.en.substring(0,30)}..." / "${newQuestionData.question.es.substring(0,30)}..."`);
            
            // Add to lists to avoid re-generation in this run for this category
            if (newQuestionData.question.en) existingQuestionConceptTexts.push(newQuestionData.question.en);
            if (newQuestionData.question.es) existingQuestionConceptTexts.push(newQuestionData.question.es);
            
            const correctAnswer = newQuestionData.answers[newQuestionData.correctAnswerIndex];
            if (correctAnswer) {
              if (correctAnswer.en) existingCorrectAnswerConceptTexts.push(correctAnswer.en);
              if (correctAnswer.es) existingCorrectAnswerConceptTexts.push(correctAnswer.es);
            }

          } else {
            console.warn(`  Genkit returned empty or invalid data for question (Category: ${category.name}, Target Difficulty: ${difficulty}).`);
          }
        } catch (error) {
          console.error(`  Error generating question for ${category.name} - ${difficulty}:`, error);
        }
        if (i < numToGenerate - 1) {
           console.log(`  Waiting ${GENKIT_API_CALL_DELAY_MS / 1000}s before next API call...`);
           await new Promise(resolve => setTimeout(resolve, GENKIT_API_CALL_DELAY_MS));
        }
      } // End loop for numToGenerate
      console.log(`  Finished generation for ${category.name} - ${difficulty} for this run.`);
      // Add a small delay before moving to the next difficulty level for the same category
      if (ALL_DIFFICULTY_LEVELS.indexOf(difficulty) < ALL_DIFFICULTY_LEVELS.length -1) {
        console.log(`  Waiting ${GENKIT_API_CALL_DELAY_MS / 2000}s before next difficulty level...`); // Shorter delay
        await new Promise(resolve => setTimeout(resolve, GENKIT_API_CALL_DELAY_MS / 2));
      }

    } // End loop for difficulty levels
    console.log(`Finished all difficulty levels for category: ${category.name}.`);
     // Add a longer delay before moving to the next category
     if (PREDEFINED_CATEGORIES_FOR_SCRIPT.indexOf(category) < PREDEFINED_CATEGORIES_FOR_SCRIPT.length - 1) {
        console.log(`Waiting ${GENKIT_API_CALL_DELAY_MS / 1000}s before next category...`);
        await new Promise(resolve => setTimeout(resolve, GENKIT_API_CALL_DELAY_MS));
     }
  } // End loop for categories
  console.log('\nBilingual question population script (with target difficulty per category) finished.');
}

populateQuestions().catch(error => {
  console.error("Unhandled error in populateQuestions:", error);
  process.exit(1);
});
