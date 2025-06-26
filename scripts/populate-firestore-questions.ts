
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
const GENKIT_API_CALL_DELAY_MS = 1000; // Delay between Genkit API calls
const DEFAULT_MODEL_NAME = 'googleai/gemini-2.5-flash'; // Default model if not specified

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
    default: 200,
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
  .option('noContext', {
    alias: 'nc',
    type: 'boolean',
    default: false,
    description: 'If true, do not pass previous questions/answers as context to the AI.',
  })
  .option('model', {
    alias: 'mod',
    type: 'string',
    description: `Genkit model name to use (e.g., googleai/gemini-1.5-flash). Defaults to ${DEFAULT_MODEL_NAME}.`,
  })
  .option('updateExistingSources', {
    alias: 'ues',
    type: 'boolean',
    default: false,
    description: 'If true, only update the "source" field of all existing questions and exit. Does not generate new questions.',
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
const NO_CONTEXT_MODE: boolean = argv.noContext;
const MODEL_TO_USE: string = argv.model || DEFAULT_MODEL_NAME; // Ensure DEFAULT_MODEL_NAME is used if argv.model is undefined
const UPDATE_EXISTING_SOURCES_MODE: boolean = argv.updateExistingSources;


async function fetchCategoriesWithAdminSDK(): Promise<CategoryDefinition[]> {
  try {
    const categoriesRef = db.collection(CATEGORIES_COLLECTION);
    const querySnapshot = await categoriesRef.get();
    const categories: CategoryDefinition[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (
        data.topicValue && typeof data.topicValue === 'string' &&
        data.name && typeof data.name.en === 'string' && typeof data.name.es === 'string' &&
        data.icon && typeof data.icon === 'string' &&
        data.detailedPromptInstructions && typeof data.detailedPromptInstructions === 'string'
      ) {
        const categoryToAdd: CategoryDefinition = {
          id: doc.id,
          topicValue: data.topicValue,
          name: data.name as BilingualText,
          icon: data.icon,
          detailedPromptInstructions: data.detailedPromptInstructions,
          isVisual: data.isVisual,
        };
        if (data.difficultySpecificGuidelines) {
          const validatedGuidelines: { [key: string]: string } = {};
          const allowedDifficulties: DifficultyLevel[] = ['easy', 'medium', 'hard'];
          for (const key in data.difficultySpecificGuidelines) {
            if (allowedDifficulties.includes(key as DifficultyLevel) && typeof data.difficultySpecificGuidelines[key] === 'string') {
              validatedGuidelines[key] = data.difficultySpecificGuidelines[key];
            }
          }
          if(Object.keys(validatedGuidelines).length > 0){
             categoryToAdd.difficultySpecificGuidelines = validatedGuidelines;
          }
        }
        categories.push(categoryToAdd);
      }
    });
    return categories;
  } catch (error) {
    console.error(`[AdminScript] Error fetching app categories:`, error);
    return [];
  }
}

async function updateAllExistingQuestionSources() {
  console.log('Starting update of "source" field for all existing predefined questions...');
  const questionsRef = db.collection(PREDEFINED_QUESTIONS_COLLECTION);
  const newSourceValue = `model:${MODEL_TO_USE},context:true,api_batch_size:N/A`; // Use MODEL_TO_USE here for consistency
  let questionsUpdated = 0;
  let batch = db.batch();
  let operationsInBatch = 0;

  try {
    const snapshot = await questionsRef.get();
    console.log(`Found ${snapshot.size} total questions to check/update.`);

    if (snapshot.empty) {
      console.log("No questions found to update.");
      return;
    }

    snapshot.forEach(doc => {
      const currentSource = doc.data().source;
      // Update if source is missing or different from the target newSourceValue
      if (currentSource !== newSourceValue) {
        batch.update(doc.ref, { source: newSourceValue });
        operationsInBatch++;
        questionsUpdated++;

        if (operationsInBatch >= 499) { // Firestore batch limit is 500
          console.log(`Committing batch of ${operationsInBatch} updates...`);
          batch.commit().then(() => console.log('Batch committed.'));
          batch = db.batch();
          operationsInBatch = 0;
        }
      }
    });

    if (operationsInBatch > 0) {
      console.log(`Committing final batch of ${operationsInBatch} updates...`);
      await batch.commit();
      console.log('Final batch committed.');
    }

    console.log(`Successfully updated "source" field for ${questionsUpdated} questions to: "${newSourceValue}".`);
  } catch (error) {
    console.error('Error updating existing question sources:', error);
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
  console.log(`No Context Mode (don't send previous questions to AI): ${NO_CONTEXT_MODE}`);
  console.log(`Model to Use: ${MODEL_TO_USE}`);
  console.log(`Update Existing Sources Only Mode: ${UPDATE_EXISTING_SOURCES_MODE}`);
  console.log(`---------------------`);

  if (UPDATE_EXISTING_SOURCES_MODE) {
    await updateAllExistingQuestionSources();
    console.log('Update existing sources mode finished. Exiting script.');
    return;
  }

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
    console.log(`\nProcessing Category: "${category.name.en}" (TopicValue: ${category.topicValue})`);

    for (const difficulty of difficultyLevelsToProcess) {
      console.log(`  Targeting Difficulty: "${difficulty}" for category "${category.name.en}"`);

      const existingQuestionConceptTextsForDifficulty: string[] = [];
      const existingCorrectAnswerConceptTextsForDifficulty: string[] = [];
      const questionsRef = db.collection(PREDEFINED_QUESTIONS_COLLECTION);

      if (!NO_CONTEXT_MODE) {
        const difficultyContextSnapshot = await questionsRef
          .where('topicValue', '==', category.topicValue)
          .where('difficulty', '==', difficulty)
          .get();

        difficultyContextSnapshot.forEach(doc => {
          const data = doc.data(); // Keep as any to check for old/new format
            if (data.question && data.question.en) {
              existingQuestionConceptTextsForDifficulty.push(data.question.en);
            }
            // Handle both new and old data formats for correct answer context
            if (data.correctAnswer && data.correctAnswer.en) { // New format
              existingCorrectAnswerConceptTextsForDifficulty.push(data.correctAnswer.en);
            } else if (data.answers && typeof data.correctAnswerIndex === 'number' && data.answers[data.correctAnswerIndex]) { // Old format
              const correctAnswer = data.answers[data.correctAnswerIndex]!;
              if (correctAnswer.en) {
                existingCorrectAnswerConceptTextsForDifficulty.push(correctAnswer.en);
              }
            }
        });
        console.log(`    Found ${existingQuestionConceptTextsForDifficulty.length} existing question concepts and ${existingCorrectAnswerConceptTextsForDifficulty.length} correct answer concepts for ${category.name.en} - ${difficulty} to use as context.`);
      } else {
        console.log(`    Skipping context collection for ${category.name.en} - ${difficulty} due to --no-context flag.`);
      }

      const currentDifficultyQuerySnapshot = await questionsRef
        .where('topicValue', '==', category.topicValue)
        .where('difficulty', '==', difficulty)
        .get();

      const numExistingForDifficulty = currentDifficultyQuerySnapshot.size;
      console.log(`    Found ${numExistingForDifficulty} existing questions for ${category.name.en} with difficulty "${difficulty}". Target is ${TARGET_QUESTIONS_PER_CATEGORY_DIFFICULTY}.`);

      if (numExistingForDifficulty >= TARGET_QUESTIONS_PER_CATEGORY_DIFFICULTY) {
        console.log(`    Overall target reached for ${category.name.en} - ${difficulty}. Skipping generation for this difficulty.`);
        continue;
      }

      let questionsGeneratedForThisDifficultyInThisRun = 0;
      const maxNewQuestionsToFetchForThisDifficulty = Math.min(
        MAX_NEW_QUESTIONS_TO_FETCH_PER_RUN_PER_DIFFICULTY_TARGET,
        TARGET_QUESTIONS_PER_CATEGORY_DIFFICULTY - numExistingForDifficulty
      );

      if (maxNewQuestionsToFetchForThisDifficulty <= 0) {
          console.log(`    No new questions needed for ${category.name.en} - ${difficulty} in this run based on overall target or run limit.`);
          continue;
      }

      console.log(`    Attempting to generate up to ${maxNewQuestionsToFetchForThisDifficulty} new questions for ${category.name.en} - ${difficulty}.`);

      while (questionsGeneratedForThisDifficultyInThisRun < maxNewQuestionsToFetchForThisDifficulty) {
        const questionsStillNeededForThisRun = maxNewQuestionsToFetchForThisDifficulty - questionsGeneratedForThisDifficultyInThisRun;
        const questionsToRequestInThisAPICall = Math.min(
          QUESTIONS_TO_GENERATE_PER_API_CALL,
          questionsStillNeededForThisRun
        );

        if (questionsToRequestInThisAPICall <= 0) {
          break;
        }

        console.log(`      Generating a batch of ${questionsToRequestInThisAPICall} questions via Genkit (need ${questionsStillNeededForThisRun} more for this run for ${category.name.en} - ${difficulty}). Using model: ${MODEL_TO_USE}.`);

        try {
          const input: GenerateTriviaQuestionsInput = {
            topic: category.topicValue,
            previousQuestions: NO_CONTEXT_MODE ? [] : [...existingQuestionConceptTextsForDifficulty],
            previousCorrectAnswers: NO_CONTEXT_MODE ? [] : [...existingCorrectAnswerConceptTextsForDifficulty],
            targetDifficulty: difficulty,
            categoryInstructions: category.detailedPromptInstructions,
            count: questionsToRequestInThisAPICall,
            isVisual: category.isVisual,
            modelName: MODEL_TO_USE, // Pass model name to the flow
          };

          if (category.difficultySpecificGuidelines && category.difficultySpecificGuidelines[difficulty]) {
            input.difficultySpecificInstruction = category.difficultySpecificGuidelines[difficulty];
          }

          const newQuestionsArray: GenerateTriviaQuestionOutput[] = await generateTriviaQuestions(input);
          let questionsSavedThisAPICall = 0;

          if (newQuestionsArray && newQuestionsArray.length > 0) {
            for (const newQuestionData of newQuestionsArray) {

              if (newQuestionData && newQuestionData.question && newQuestionData.correctAnswer && newQuestionData.difficulty) {
                if (newQuestionData.difficulty !== difficulty) {
                    console.warn(`      AI generated question with difficulty "${newQuestionData.difficulty}" but target was "${difficulty}". Saving with AI's assessed difficulty.`);
                }

                const modelUsedForSource = MODEL_TO_USE;
                const sourceInfo = `model:${modelUsedForSource},context:${!NO_CONTEXT_MODE},api_batch_size:${QUESTIONS_TO_GENERATE_PER_API_CALL}`;

                const questionToSave = {
                  ...newQuestionData,
                  topicValue: category.topicValue,
                  createdAt: admin.firestore.FieldValue.serverTimestamp(),
                  source: sourceInfo
                };

                await questionsRef.add(questionToSave);
                questionsSavedThisAPICall++;
                questionsGeneratedForThisDifficultyInThisRun++;
                console.log(`        > Saved question (${questionsGeneratedForThisDifficultyInThisRun}/${maxNewQuestionsToFetchForThisDifficulty}) (AI diff: ${newQuestionData.difficulty}, Target: ${difficulty}): "${newQuestionData.question.en.substring(0,80)}..."`);

                if (!NO_CONTEXT_MODE) {
                    if (newQuestionData.question.en) existingQuestionConceptTextsForDifficulty.push(newQuestionData.question.en);
                    if (newQuestionData.correctAnswer.en) {
                      existingCorrectAnswerConceptTextsForDifficulty.push(newQuestionData.correctAnswer.en);
                    }
                }
              } else {
                console.warn(`      Genkit returned empty or invalid data for one question in batch (Category: ${category.name.en}, Target Difficulty: ${difficulty}).`);
              }
            }
            console.log(`      Successfully saved ${questionsSavedThisAPICall} new questions from this API call for ${category.name.en} - ${difficulty}.`);
          } else {
            console.warn(`      Genkit returned an empty array or invalid data for the API call (Category: ${category.name.en}, Target Difficulty: ${difficulty}). No questions saved from this call.`);
          }

          console.log(`      Total generated for ${category.name.en} - ${difficulty} in this run: ${questionsGeneratedForThisDifficultyInThisRun}/${maxNewQuestionsToFetchForThisDifficulty}.`);

          if (questionsGeneratedForThisDifficultyInThisRun < maxNewQuestionsToFetchForThisDifficulty && newQuestionsArray && newQuestionsArray.length > 0) {
            console.log(`      Waiting ${GENKIT_API_CALL_DELAY_MS / 1000}s before next API call for this same difficulty/category combination...`);
            await new Promise(resolve => setTimeout(resolve, GENKIT_API_CALL_DELAY_MS));
          } else if (questionsGeneratedForThisDifficultyInThisRun >= maxNewQuestionsToFetchForThisDifficulty) {
             break;
          } else if (!newQuestionsArray || newQuestionsArray.length === 0) {
            console.warn(`      API call returned no questions. Breaking loop for ${category.name.en} - ${difficulty} to avoid potential infinite loop.`);
            break;
          }

        } catch (error) {
          console.error(`      Error during Genkit API call for ${category.name.en} - ${difficulty}:`, error);
          console.log(`      Waiting ${GENKIT_API_CALL_DELAY_MS / 1000}s after error before potentially retrying or moving on...`);
          await new Promise(resolve => setTimeout(resolve, GENKIT_API_CALL_DELAY_MS));
          break;
        }
      }

      console.log(`    Finished generation attempts for ${category.name.en} - ${difficulty}. Generated ${questionsGeneratedForThisDifficultyInThisRun} questions in this run.`);
      if (questionsGeneratedForThisDifficultyInThisRun > 0 && questionsGeneratedForThisDifficultyInThisRun < maxNewQuestionsToFetchForThisDifficulty) {
        console.log(`    Note: Fewer questions were generated (${questionsGeneratedForThisDifficultyInThisRun}) than the target for this run (${maxNewQuestionsToFetchForThisDifficulty}).`);
      }

      const isLastDifficulty = difficultyLevelsToProcess.indexOf(difficulty) === difficultyLevelsToProcess.length - 1;
      const isLastCategory = categoriesToProcess.indexOf(category) === categoriesToProcess.length - 1;
      if (maxNewQuestionsToFetchForThisDifficulty > 0 && !(isLastDifficulty && isLastCategory)) {
        console.log(`    Waiting ${GENKIT_API_CALL_DELAY_MS / 1000}s before processing next difficulty or category...`);
        await new Promise(resolve => setTimeout(resolve, GENKIT_API_CALL_DELAY_MS));
      }

    }
    console.log(`  Finished all difficulty levels for category: ${category.name.en}.`);
  }
  console.log('\nBatch question population script finished.');
}

populateQuestions().catch(error => {
  console.error("Unhandled error in populateQuestions:", error);
  process.exit(1);
});
