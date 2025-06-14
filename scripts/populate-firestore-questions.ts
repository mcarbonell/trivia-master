
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import admin from 'firebase-admin';
import { generateTriviaQuestion, type GenerateTriviaQuestionInput, type GenerateTriviaQuestionOutput } from '../src/ai/flows/generate-trivia-question';
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

const TARGET_QUESTIONS_PER_CATEGORY = 20; // Target number of questions per category
const MAX_NEW_QUESTIONS_PER_RUN_PER_CATEGORY = 5; // Max new questions to generate in one script run for each category
const GENKIT_API_CALL_DELAY_MS = 7000; // Delay between Genkit API calls (7 seconds)

async function populateQuestions() {
  console.log('Starting Firestore question population script (bilingual)...');

  for (const category of PREDEFINED_CATEGORIES_FOR_SCRIPT) {
    console.log(`\nProcessing Category: "${category.name}" (Topic: ${category.topicValue})`);

    const questionsRef = db.collection(PREDEFINED_QUESTIONS_COLLECTION);
    const querySnapshot = await questionsRef
      .where('topicValue', '==', category.topicValue)
      .get();

    const existingQuestionConceptTexts: string[] = []; // Store a canonical version (e.g., English) or both
    const existingCorrectAnswerConceptTexts: string[] = [];

    querySnapshot.forEach(doc => {
      const data = doc.data() as GenerateTriviaQuestionOutput & { topicValue: string }; // Assuming structure from Genkit + topicValue
      if (data.question && data.question.en) {
        existingQuestionConceptTexts.push(data.question.en); // Add English version
        if (data.question.es) existingQuestionConceptTexts.push(data.question.es); // Add Spanish version if present
      }
      if (data.answers && typeof data.correctAnswerIndex === 'number' && data.answers[data.correctAnswerIndex]) {
        const correctAnswer = data.answers[data.correctAnswerIndex]!;
        if (correctAnswer.en) existingCorrectAnswerConceptTexts.push(correctAnswer.en);
        if (correctAnswer.es) existingCorrectAnswerConceptTexts.push(correctAnswer.es);
      }
    });

    const numExisting = querySnapshot.size; // Each document is one conceptual question
    console.log(`Found ${numExisting} existing conceptual questions for ${category.name}. Target is ${TARGET_QUESTIONS_PER_CATEGORY}.`);

    if (numExisting >= TARGET_QUESTIONS_PER_CATEGORY) {
      console.log(`Target reached for ${category.name}. Skipping generation.`);
      continue;
    }

    const numToGenerate = Math.min(
      MAX_NEW_QUESTIONS_PER_RUN_PER_CATEGORY,
      TARGET_QUESTIONS_PER_CATEGORY - numExisting
    );

    console.log(`Attempting to generate ${numToGenerate} new conceptual questions...`);

    for (let i = 0; i < numToGenerate; i++) {
      try {
        const input: GenerateTriviaQuestionInput = {
          topic: category.topicValue,
          previousQuestions: [...existingQuestionConceptTexts],
          previousCorrectAnswers: [...existingCorrectAnswerConceptTexts],
          // Performance history is not relevant for batch generation
        };

        console.log(`Generating conceptual question ${i + 1} of ${numToGenerate} for ${category.name}...`);
        if (i === 0) await new Promise(resolve => setTimeout(resolve, 500));
        
        const newQuestionData: GenerateTriviaQuestionOutput = await generateTriviaQuestion(input);

        if (newQuestionData && newQuestionData.question && newQuestionData.answers) {
          const questionToSave = {
            ...newQuestionData,
            topicValue: category.topicValue, // Keep topicValue for querying
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            source: 'batch-script-aitrivia-bilingual-v1'
          };

          await questionsRef.add(questionToSave);
          console.log(`Successfully generated and saved bilingual question: "${newQuestionData.question.en.substring(0,50)}..." / "${newQuestionData.question.es.substring(0,50)}..."`);
          
          if (newQuestionData.question.en) existingQuestionConceptTexts.push(newQuestionData.question.en);
          if (newQuestionData.question.es) existingQuestionConceptTexts.push(newQuestionData.question.es);
          
          const correctAnswer = newQuestionData.answers[newQuestionData.correctAnswerIndex];
          if (correctAnswer) {
            if (correctAnswer.en) existingCorrectAnswerConceptTexts.push(correctAnswer.en);
            if (correctAnswer.es) existingCorrectAnswerConceptTexts.push(correctAnswer.es);
          }

        } else {
          console.warn('Genkit returned empty or invalid data for bilingual question.');
        }
      } catch (error) {
        console.error(`Error generating bilingual question for ${category.name}:`, error);
      }
      if (i < numToGenerate - 1) {
         console.log(`Waiting ${GENKIT_API_CALL_DELAY_MS / 1000}s before next API call...`);
         await new Promise(resolve => setTimeout(resolve, GENKIT_API_CALL_DELAY_MS));
      }
    }
    console.log(`Finished generation for ${category.name} for this run.`);
  }
  console.log('\nBilingual question population script finished.');
}

populateQuestions().catch(error => {
  console.error("Unhandled error in populateQuestions:", error);
  process.exit(1);
});
