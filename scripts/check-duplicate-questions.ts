
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import inquirer from 'inquirer'; // Import inquirer
import { adminDb } from '../src/lib/firebase-admin';
import { detectDuplicateQuestions, type QuestionInput, type DetectDuplicatesInput, type DetectDuplicatesOutput } from '../src/ai/flows/detect-duplicate-questions';
import { getScriptSettings } from '../src/services/settingsService';
import type { PredefinedQuestion } from '../src/services/triviaService'; 
import type { DifficultyLevel, BilingualText } from '../src/types';
import type { firestore } from 'firebase-admin';


const PREDEFINED_QUESTIONS_COLLECTION = 'predefinedTriviaQuestions';
const ALL_DIFFICULTY_LEVELS_CONST: DifficultyLevel[] = ["easy", "medium", "hard"];

async function main() {
    const settings = await getScriptSettings();

    const argv = yargs(hideBin(process.argv))
        .option('topicValue', {
            alias: 't',
            type: 'string',
            description: 'TopicValue of the category to check for duplicate questions.',
            demandOption: true, // Make topicValue mandatory
        })
        .option('difficulty', {
            alias: 'd',
            type: 'string',
            choices: ALL_DIFFICULTY_LEVELS_CONST,
            description: 'Specific difficulty level to check (easy, medium, hard). If not provided, checks all difficulties for the topic.',
        })
        .option('model', {
            alias: 'm',
            type: 'string',
            description: `Genkit model name to use for detection. Defaults to the one set in Admin Settings.`,
            default: settings.checkDuplicates.defaultModel,
        })
        .help()
        .alias('help', 'h')
        .parseSync();
    
    await checkDuplicates(argv);
}


function normalizeQuestionForDuplicateCheck(doc: firestore.DocumentSnapshot): QuestionInput | null {
    const data = doc.data();
    if (!data || !data.question || !data.question.en) {
        return null;
    }
    
    let correctAnswerText: string | undefined;

    // New format
    if (data.correctAnswer && data.correctAnswer.en) {
        correctAnswerText = data.correctAnswer.en;
    } 
    // Old format
    else if (data.answers && typeof data.correctAnswerIndex === 'number' && data.answers[data.correctAnswerIndex]?.en) {
        correctAnswerText = data.answers[data.correctAnswerIndex].en;
    }

    if (!correctAnswerText) {
        console.warn(`Could not determine correct answer for question ID ${doc.id}. Skipping.`);
        return null;
    }

    return {
        id: doc.id,
        questionText: data.question.en,
        correctAnswerText: correctAnswerText,
    };
}


async function checkDuplicates(argv: any) {
  const { topicValue, difficulty, model: modelToUse } = argv;

  console.log(`Starting duplicate question check for topicValue: "${topicValue}"...`);
  if (difficulty) {
    console.log(`Targeting difficulty: "${difficulty}"`);
  } else {
    console.log(`Targeting all difficulties for this topic.`);
  }
  console.log(`Using AI model: "${modelToUse}" for detection.`);

  try {
    let firestoreQuery = adminDb.collection(PREDEFINED_QUESTIONS_COLLECTION).where('topicValue', '==', topicValue);
    if (difficulty) {
      firestoreQuery = firestoreQuery.where('difficulty', '==', difficulty as DifficultyLevel);
    }

    const querySnapshot = await firestoreQuery.get();

    if (querySnapshot.empty) {
      console.log(`No questions found for topicValue "${topicValue}"` + (difficulty ? ` and difficulty "${difficulty}"` : '') + ".");
      return;
    }

    const questionsFromFirestore: QuestionInput[] = [];
    querySnapshot.forEach(doc => {
      const normalizedQuestion = normalizeQuestionForDuplicateCheck(doc);
      if (normalizedQuestion) {
        questionsFromFirestore.push(normalizedQuestion);
      }
    });

    if (questionsFromFirestore.length < 2) {
      console.log(`Found only ${questionsFromFirestore.length} question(s). Need at least 2 to check for duplicates.`);
      return;
    }
    
    console.log(`Fetched and normalized ${questionsFromFirestore.length} questions from Firestore. Sending to AI for duplicate detection...`);

    const flowInput: DetectDuplicatesInput = {
      questionsList: questionsFromFirestore,
      modelName: modelToUse,
    };

    const duplicateResults: DetectDuplicatesOutput = await detectDuplicateQuestions(flowInput);

    if (duplicateResults.length === 0) {
      console.log("AI analysis complete: No conceptual duplicates found.");
    } else {
      console.log(`AI analysis complete: Found ${duplicateResults.length} duplicate pair(s):`);
      const duplicateIdsToDelete = new Set<string>();
      duplicateResults.forEach(pair => {
        console.log(`  ID ${pair.duplicateId} is duplicated of ID ${pair.originalId} (Reason: ${pair.reason || 'N/A'})`);
        duplicateIdsToDelete.add(pair.duplicateId);
      });

      if (duplicateIdsToDelete.size > 0) {
        const { confirmDelete } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmDelete',
            message: `Do you want to delete the ${duplicateIdsToDelete.size} identified 'duplicateId' questions from Firestore?`,
            default: false,
          },
        ]);

        if (confirmDelete) {
          console.log('Deleting questions...');
          let successCount = 0;
          let failCount = 0;
          for (const idToDelete of duplicateIdsToDelete) {
            try {
              await adminDb.collection(PREDEFINED_QUESTIONS_COLLECTION).doc(idToDelete).delete();
              console.log(`  Successfully deleted question ID: ${idToDelete}`);
              successCount++;
            } catch (deleteError) {
              console.error(`  Failed to delete question ID: ${idToDelete}`, deleteError);
              failCount++;
            }
          }
          console.log(`Finished deleting. ${successCount} questions deleted. ${failCount} deletions failed.`);
        } else {
          console.log('No questions were deleted.');
        }
      }
    }

  } catch (error) {
    console.error("Error during duplicate check process:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }

  console.log('Duplicate check script finished.');
}

main().catch(error => {
  console.error("Unhandled error in checkDuplicates script:", error);
  process.exit(1);
});
