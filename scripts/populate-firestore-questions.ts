
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import admin from 'firebase-admin';
import { generateTriviaQuestion, type GenerateTriviaQuestionInput, type GenerateTriviaQuestionOutput } from '../src/ai/flows/generate-trivia-question';
import { ai } from '../src/ai/genkit'; // Ensure Genkit is initialized

// Initialize Firebase Admin SDK
// Ensure GOOGLE_APPLICATION_CREDENTIALS environment variable is set to the path of your service account key file.
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

const LANGUAGES_FOR_SCRIPT = ['en', 'es'];
const TARGET_QUESTIONS_PER_CATEGORY_LANG = 20; // Target number of questions per category/language combination
const MAX_NEW_QUESTIONS_PER_RUN_PER_CATEGORY_LANG = 5; // Max new questions to generate in one script run for each combo
const GENKIT_API_CALL_DELAY_MS = 7000; // Delay between Genkit API calls (7 seconds)

async function populateQuestions() {
  console.log('Starting Firestore question population script...');

  for (const category of PREDEFINED_CATEGORIES_FOR_SCRIPT) {
    for (const language of LANGUAGES_FOR_SCRIPT) {
      console.log(`\nProcessing Category: "${category.name}", Language: "${language}"`);

      const questionsRef = db.collection(PREDEFINED_QUESTIONS_COLLECTION);
      const querySnapshot = await questionsRef
        .where('topicValue', '==', category.topicValue)
        .where('language', '==', language)
        .get();

      const existingQuestionTexts: string[] = [];
      const existingCorrectAnswers: string[] = [];
      querySnapshot.forEach(doc => {
        const data = doc.data();
        if (data.question) {
          existingQuestionTexts.push(data.question);
        }
        if (data.answers && typeof data.correctAnswerIndex === 'number' && data.answers[data.correctAnswerIndex]) {
          existingCorrectAnswers.push(data.answers[data.correctAnswerIndex]);
        }
      });

      const numExisting = existingQuestionTexts.length;
      console.log(`Found ${numExisting} existing questions for ${category.name} (${language}). Target is ${TARGET_QUESTIONS_PER_CATEGORY_LANG}.`);

      if (numExisting >= TARGET_QUESTIONS_PER_CATEGORY_LANG) {
        console.log(`Target reached for ${category.name} (${language}). Skipping generation.`);
        continue;
      }

      const numToGenerate = Math.min(
        MAX_NEW_QUESTIONS_PER_RUN_PER_CATEGORY_LANG,
        TARGET_QUESTIONS_PER_CATEGORY_LANG - numExisting
      );

      console.log(`Attempting to generate ${numToGenerate} new questions...`);

      for (let i = 0; i < numToGenerate; i++) {
        try {
          const input: GenerateTriviaQuestionInput = {
            topic: category.topicValue,
            language: language,
            previousQuestions: [...existingQuestionTexts], // Pass copies to avoid modification issues if any
            previousCorrectAnswers: [...existingCorrectAnswers],
            // Performance history is not relevant for batch generation
          };

          console.log(`Generating question ${i + 1} of ${numToGenerate} for ${category.name} (${language})...`);
          // Ensure Genkit is ready, though importing `ai` should handle it.
          // A small delay before the first call in a loop can sometimes help with cold starts or rapid init.
          if (i === 0) await new Promise(resolve => setTimeout(resolve, 500));
          
          const newQuestionData: GenerateTriviaQuestionOutput = await generateTriviaQuestion(input);

          if (newQuestionData && newQuestionData.question && newQuestionData.answers) {
            const questionToSave = {
              ...newQuestionData,
              topicValue: category.topicValue,
              language: language,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              source: 'batch-script-aitrivia-v1' // Identifier for how this question was generated
            };

            await questionsRef.add(questionToSave);
            console.log(`Successfully generated and saved: "${newQuestionData.question.substring(0,50)}..."`);
            
            // Add to lists for subsequent calls in this script run to maintain variety
            existingQuestionTexts.push(newQuestionData.question);
            if (newQuestionData.answers[newQuestionData.correctAnswerIndex]){
                 existingCorrectAnswers.push(newQuestionData.answers[newQuestionData.correctAnswerIndex]);
            }

          } else {
            console.warn('Genkit returned empty or invalid data.');
          }
        } catch (error) {
          console.error(`Error generating question for ${category.name} (${language}):`, error);
          // Decide if you want to break or continue on error. For now, we log and continue.
        }
        // Delay between API calls
        if (i < numToGenerate - 1) { // No delay after the last item
           console.log(`Waiting ${GENKIT_API_CALL_DELAY_MS / 1000}s before next API call...`);
           await new Promise(resolve => setTimeout(resolve, GENKIT_API_CALL_DELAY_MS));
        }
      }
      console.log(`Finished generation for ${category.name} (${language}) for this run.`);
    }
  }
  console.log('\nQuestion population script finished.');
}

populateQuestions().catch(error => {
  console.error("Unhandled error in populateQuestions:", error);
  process.exit(1);
});
