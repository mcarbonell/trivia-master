
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import admin from 'firebase-admin';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { generateTriviaQuestions, type GenerateTriviaQuestionsInput, type GenerateTriviaQuestionOutput, type DifficultyLevel } from '../src/ai/flows/generate-trivia-question';
import type { CategoryDefinition, BilingualText } from '../src/types';

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

const ALL_DIFFICULTY_LEVELS_CONST: DifficultyLevel[] = ["easy", "medium", "hard"];
const GENKIT_API_CALL_DELAY_MS = 1000;

// --- Argument Parsing with yargs ---
const argv = yargs(hideBin(process.argv))
  .option('category', {
    alias: 'c',
    type: 'string',
    description: 'TopicValue of the specific category to process.',
  })
  .option('difficulty', {
    alias: 'd',
    type: 'string',
    choices: ALL_DIFFICULTY_LEVELS_CONST,
    description: 'Specific difficulty level to process (easy, medium, hard).',
  })
  .option('targetPerDifficulty', {
    alias: 't',
    type: 'number',
    default: 10000,
    description: 'Target total number of questions per category/difficulty combination.',
  })
  .option('maxNewPerRun', {
    alias: 'm',
    type: 'number',
    default: 25,
    description: 'Maximum new questions to fetch per category/difficulty in this run.',
  })
  .option('batchSize', {
    alias: 'b',
    type: 'number',
    default: 25,
    description: 'Number of questions to request per Genkit API call.',
  })
  .help()
  .alias('help', 'h')
  .parseSync();


// --- Use parsed arguments or defaults ---
const TARGET_CATEGORY_TOPIC_VALUE: string | undefined = argv.category;
const TARGET_DIFFICULTY: DifficultyLevel | undefined = argv.difficulty as DifficultyLevel | undefined;
const TARGET_QUESTIONS_PER_CATEGORY_DIFFICULTY: number = argv.targetPerDifficulty;
const MAX_NEW_QUESTIONS_TO_FETCH_PER_RUN_PER_DIFFICULTY_TARGET: number = argv.maxNewPerRun;
const QUESTIONS_TO_GENERATE_PER_API_CALL: number = argv.batchSize;


async function fetchCategoriesWithAdminSDK(): Promise<CategoryDefinition[]> {
  try {
    const categoriesRef = db.collection(CATEGORIES_COLLECTION);
    const querySnapshot = await categoriesRef.get();
    
    console.log(`[AdminScript] Fetched ${querySnapshot.size} documents from "${CATEGORIES_COLLECTION}".`);

    const categories: CategoryDefinition[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (
        data.topicValue && typeof data.topicValue === 'string' &&
        data.name && typeof data.name.en === 'string' && typeof data.name.es === 'string' &&
        data.icon && typeof data.icon === 'string' &&
        data.detailedPromptInstructions && typeof data.detailedPromptInstructions === 'string' &&
        (data.hasOwnProperty('isPredefined') ? typeof data.isPredefined === 'boolean' : true)
      ) { 
        
        const categoryToAdd: CategoryDefinition = {
          id: doc.id,
          topicValue: data.topicValue,
          name: data.name as BilingualText,
          icon: data.icon,
          detailedPromptInstructions: data.detailedPromptInstructions,
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
    return [];
  }
}


async function populateQuestions() {
  console.log(`Starting Firestore question population script...`);
  console.log(`--- Configuration ---`);
  console.log(`Target Category: ${TARGET_CATEGORY_TOPIC_VALUE || 'All Predefined'}`);
  console.log(`Target Difficulty: ${TARGET_DIFFICULTY || 'All'}`);
  console.log(`Target Questions per Combo: ${TARGET_QUESTIONS_PER_CATEGORY_DIFFICULTY}`);
  console.log(`Max New Questions per Run: ${MAX_NEW_QUESTIONS_TO_FETCH_PER_RUN_PER_DIFFICULTY_TARGET}`);
  console.log(`Genkit API Batch Size: ${QUESTIONS_TO_GENERATE_PER_API_CALL}`);
  console.log(`---------------------`);


  const allAppCategories = await fetchCategoriesWithAdminSDK();
  if (!allAppCategories || allAppCategories.length === 0) {
    console.error("No categories found in Firestore 'triviaCategories' collection. Please populate it first using 'npm run populate:categories'.");
    return;
  }

  let categoriesToProcess = allAppCategories;
  if (TARGET_CATEGORY_TOPIC_VALUE) {
    categoriesToProcess = allAppCategories.filter(cat => cat.topicValue === TARGET_CATEGORY_TOPIC_VALUE);
    if (categoriesToProcess.length === 0) {
      console.error(`Specified category "${TARGET_CATEGORY_TOPIC_VALUE}" not found or not valid. Exiting.`);
      return;
    }
     console.log(`Processing only specified category: "${TARGET_CATEGORY_TOPIC_VALUE}"`);
  }


  const difficultyLevelsToProcess: DifficultyLevel[] = TARGET_DIFFICULTY ? [TARGET_DIFFICULTY] : ALL_DIFFICULTY_LEVELS_CONST;
  if (TARGET_DIFFICULTY) {
    console.log(`Processing only specified difficulty: "${TARGET_DIFFICULTY}"`);
  }


  for (const category of categoriesToProcess) {
    if (category.isPredefined === false) { 
        console.log(`\nSkipping Category: "${category.name.en}" (TopicValue: ${category.topicValue}) as it is not marked for predefined question population.`);
        continue;
    }
    console.log(`\nProcessing Category: "${category.name.en}" (TopicValue: ${category.topicValue})`);
    

    for (const difficulty of difficultyLevelsToProcess) {
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
      
      if (numToPotentiallyGenerateThisRun <= 0) {
          console.log(`  No new questions needed for ${category.name.en} - ${difficulty} in this run based on limits.`);
          continue;
      }

      console.log(`  Attempting to generate up to ${numToPotentiallyGenerateThisRun} new questions for ${category.name.en} - ${difficulty} (requesting batch of ${QUESTIONS_TO_GENERATE_PER_API_CALL} from AI)...`);

      try {
        const input: GenerateTriviaQuestionsInput = {
          topic: category.topicValue, 
          previousQuestions: [...existingQuestionConceptTexts], 
          previousCorrectAnswers: [...existingCorrectAnswerConceptTexts], 
          targetDifficulty: difficulty,
          categoryInstructions: category.detailedPromptInstructions,
          count: QUESTIONS_TO_GENERATE_PER_API_CALL, // Use the batch size for API call
        };
        
        if (category.difficultySpecificGuidelines && category.difficultySpecificGuidelines[difficulty]) {
          input.difficultySpecificInstruction = category.difficultySpecificGuidelines[difficulty];
        }

        console.log(`  Generating a batch of ${input.count} questions for ${category.name.en} - ${difficulty}...`);
        
        const newQuestionsArray: GenerateTriviaQuestionOutput[] = await generateTriviaQuestions(input);

        if (newQuestionsArray && newQuestionsArray.length > 0) {
          let questionsSavedThisBatch = 0;
          for (const newQuestionData of newQuestionsArray) {
            if (questionsSavedThisBatch >= numToPotentiallyGenerateThisRun) {
                console.log(`    Reached max new questions for this run (${numToPotentiallyGenerateThisRun}). Stopping save for this batch.`);
                break;
            }

            if (newQuestionData && newQuestionData.question && newQuestionData.answers && newQuestionData.difficulty) {
              if (newQuestionData.difficulty !== difficulty) {
                  console.warn(`  AI generated question with difficulty "${newQuestionData.difficulty}" but target was "${difficulty}". Saving with AI's assessed difficulty.`);
              }

              const questionToSave = {
                ...newQuestionData,
                topicValue: category.topicValue, 
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                source: 'batch-script-v4-cli-args' 
              };

              await questionsRef.add(questionToSave);
              questionsSavedThisBatch++;
              console.log(`    > Saved question (${questionsSavedThisBatch}/${numToPotentiallyGenerateThisRun}) (AI difficulty: ${newQuestionData.difficulty}, Target: ${difficulty}): "${newQuestionData.question.en.substring(0,30)}..." / "${newQuestionData.question.es.substring(0,30)}..."`);
              
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

