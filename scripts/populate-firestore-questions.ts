
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import admin from 'firebase-admin';
import { generateTriviaQuestions, type GenerateTriviaQuestionsInput, type GenerateTriviaQuestionOutput, type DifficultyLevel } from '../src/ai/flows/generate-trivia-question'; // Updated import
// Removed: import { getAppCategories } from '../src/services/categoryService'; 
import type { CategoryDefinition, BilingualText } from '../src/types'; // Ensure BilingualText is imported if needed for CategoryDefinition structure

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
const CATEGORIES_COLLECTION = 'triviaCategories';


const ALL_DIFFICULTY_LEVELS: DifficultyLevel[] = ["easy", "medium", "hard"];

const TARGET_QUESTIONS_PER_CATEGORY_DIFFICULTY = 10000; 
const MAX_NEW_QUESTIONS_TO_FETCH_PER_RUN_PER_DIFFICULTY_TARGET = 50;
const QUESTIONS_TO_GENERATE_PER_API_CALL = 50; 
const GENKIT_API_CALL_DELAY_MS = 700; 

/**
 * Fetches all category definitions from Firestore using Firebase Admin SDK.
 * This function is specifically for use within Node.js scripts.
 * @returns A promise that resolves to an array of CategoryDefinition.
 */
async function fetchCategoriesWithAdminSDK(): Promise<CategoryDefinition[]> {
  try {
    const categoriesRef = db.collection(CATEGORIES_COLLECTION);
    const querySnapshot = await categoriesRef.get();
    
    console.log(`[AdminScript] Fetched ${querySnapshot.size} documents from "${CATEGORIES_COLLECTION}".`);

    const categories: CategoryDefinition[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // Basic check for required fields to ensure data integrity before pushing
      if (
        data.topicValue && typeof data.topicValue === 'string' &&
        data.name && typeof data.name.en === 'string' && typeof data.name.es === 'string' &&
        data.icon && typeof data.icon === 'string' &&
        data.detailedPromptInstructions && typeof data.detailedPromptInstructions === 'string' && // Now a string
        (data.hasOwnProperty('isPredefined') ? typeof data.isPredefined === 'boolean' : true)
      ) { 
        
        const categoryToAdd: CategoryDefinition = {
          id: doc.id,
          topicValue: data.topicValue,
          name: data.name as BilingualText, // name is still BilingualText
          icon: data.icon,
          detailedPromptInstructions: data.detailedPromptInstructions, // English string
          isPredefined: data.isPredefined === undefined ? true : data.isPredefined,
        };

        if (data.difficultySpecificGuidelines) {
          const validatedGuidelines: { [key: string]: string } = {};
          const allowedDifficulties: DifficultyLevel[] = ['easy', 'medium', 'hard'];

          for (const key in data.difficultySpecificGuidelines) {
            if (allowedDifficulties.includes(key as DifficultyLevel) && typeof data.difficultySpecificGuidelines[key] === 'string') {
              validatedGuidelines[key] = data.difficultySpecificGuidelines[key];
            } else if (!allowedDifficulties.includes(key as DifficultyLevel)) {
              console.warn(`[AdminScript] Document ${doc.id}, invalid difficulty key "${key}" in difficultySpecificGuidelines for ${categoryToAdd.topicValue}. Allowed: ${allowedDifficulties.join(', ')}. Skipping.`);
            } else {
              console.warn(`[AdminScript] Document ${doc.id}, difficultySpecificGuidelines for key "${key}" is not a string. Skipping this guideline.`);
            }
          }
          if(Object.keys(validatedGuidelines).length > 0){
             categoryToAdd.difficultySpecificGuidelines = validatedGuidelines;
          } else if (Object.keys(data.difficultySpecificGuidelines).length > 0) {
             console.warn(`[AdminScript] Document ${doc.id} had difficultySpecificGuidelines for ${categoryToAdd.topicValue} but none were valid strings or matched allowed difficulties. It will be omitted.`);
          }
        }
        
        categories.push(categoryToAdd);

      } else {
        console.warn(`[AdminScript] Document ${doc.id} in "${CATEGORIES_COLLECTION}" is missing one or more required fields or they are not in the expected format. Skipping.`);
        console.warn(`[AdminScript] Problematic data for doc ${doc.id}:`, JSON.stringify(data));
      }
    });
    
    console.log('[AdminScript] Processed categories: ', categories.map(c => ({ id: c.id, name: c.name.en, isPredefined: c.isPredefined })));
    
    if (querySnapshot.size > 0 && categories.length === 0) {
        console.warn(`[AdminScript] All documents fetched from "${CATEGORIES_COLLECTION}" were skipped due to missing fields or incorrect format. Please check Firestore data and structure definitions.`);
    }
    
    return categories;
  } catch (error) {
    console.error(`[AdminScript] Error fetching app categories from Firestore collection "${CATEGORIES_COLLECTION}" using Admin SDK:`, error);
    return []; // Return empty array on error
  }
}


async function populateQuestions() {
  console.log(`Starting Firestore question population script (Batch generation, target: ${QUESTIONS_TO_GENERATE_PER_API_CALL} per call)...`);

  const appCategories = await fetchCategoriesWithAdminSDK(); // Use the new Admin SDK based fetcher
  if (!appCategories || appCategories.length === 0) {
    console.error("No categories found in Firestore 'triviaCategories' collection. Please populate it first using 'npm run populate:categories'.");
    return;
  }
  console.log(`Found ${appCategories.length} categories to process.`);

  for (const category of appCategories) {
    // Only process if isPredefined is true or undefined (defaulting to true behavior)
    if (category.isPredefined === false) { 
        console.log(`\nSkipping Category: "${category.name.en}" (TopicValue: ${category.topicValue}) as it is not marked for predefined question population.`);
        continue;
    }
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
          categoryInstructions: category.detailedPromptInstructions, // English string
          count: actualQuestionsToRequestInBatch, 
        };
        
        if (category.difficultySpecificGuidelines && category.difficultySpecificGuidelines[difficulty]) {
          input.difficultySpecificInstruction = category.difficultySpecificGuidelines[difficulty]; // English string
        }

        console.log(`  Generating a batch of ${input.count} questions for ${category.name.en} - ${difficulty}...`);
        
        const newQuestionsArray: GenerateTriviaQuestionOutput[] = await generateTriviaQuestions(input);

        if (newQuestionsArray && newQuestionsArray.length > 0) {
          let questionsSavedThisBatch = 0;
          for (const newQuestionData of newQuestionsArray) {
            // if (questionsSavedThisBatch >= numToPotentiallyGenerateThisRun) break; // Optimization, allow to generate more questions than asked

            if (newQuestionData && newQuestionData.question && newQuestionData.answers && newQuestionData.difficulty) {
              if (newQuestionData.difficulty !== difficulty) {
                  console.warn(`  AI generated question with difficulty "${newQuestionData.difficulty}" but target was "${difficulty}". Saving with AI's assessed difficulty.`);
              }

              const questionToSave = {
                ...newQuestionData,
                topicValue: category.topicValue, 
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                source: 'batch-script-v3-target-difficulty-category-prompts-admin-fetch' 
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
  } 
  console.log('\nBatch question population script finished.');
}

populateQuestions().catch(error => {
  console.error("Unhandled error in populateQuestions:", error);
  process.exit(1);
});

