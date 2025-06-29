
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { adminDb } from '../src/lib/firebase-admin';
import { validateSingleTriviaQuestion } from '../src/ai/flows/validate-single-trivia-question';
import { getScriptSettings } from '@/services/settingsService';
import type { ValidateSingleQuestionInput, QuestionData } from '../src/types';
import type { DifficultyLevel, BilingualText } from '@/types';
import type { firestore } from 'firebase-admin';

const PREDEFINED_QUESTIONS_COLLECTION = 'predefinedTriviaQuestions';
const ALL_DIFFICULTY_LEVELS_CONST: DifficultyLevel[] = ["easy", "medium", "hard"];


async function main() {
    const settings = await getScriptSettings();

    const argv = yargs(hideBin(process.argv))
    .option('topicValue', {
        alias: 't',
        type: 'string',
        description: 'TopicValue of the category to validate.',
        demandOption: true,
    })
    .option('difficulty', {
        alias: 'd',
        type: 'string',
        choices: ALL_DIFFICULTY_LEVELS_CONST,
        description: 'Specific difficulty level to validate. If not provided, validates all.',
    })
    .option('model', {
        alias: 'm',
        type: 'string',
        description: `Genkit model name to use. Defaults to the one in Admin Settings.`,
        default: settings.validateQuestions.defaultModel,
    })
    .option('batchSize', {
        alias: 'b',
        type: 'number',
        default: 1,
        description: 'Number of questions to validate in parallel.',
    })
    .option('autofix', {
        alias: 'af',
        type: 'boolean',
        default: false,
        description: 'Automatically apply AI fixes.',
    })
    .option('autodelete', {
        alias: 'ad',
        type: 'boolean',
        default: false,
        description: 'Automatically delete rejected questions.',
    })
    .option('auto', {
        alias: 'a',
        type: 'boolean',
        default: false,
        description: 'Shorthand for --autofix and --autodelete.',
    })
    .option('force', {
        alias: 'f',
        type: 'boolean',
        default: false,
        description: "Force re-validation of all questions, ignoring their current status (e.g., 'accepted' or 'fixed').",
    })
    .help()
    .alias('help', 'h')
    .parseSync();

    await validateMultipleQuestions(argv);
}


function normalizeFirestoreDocToQuestionData(doc: firestore.DocumentSnapshot): QuestionData | null {
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
        createdAt: data.createdAt ? (data.createdAt as firestore.Timestamp).toDate().toISOString() : undefined,
        imagePrompt: data.imagePrompt as string | undefined,
        searchTerm: data.searchTerm as string | undefined,
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

async function validateMultipleQuestions(argv: any) {
  const { topicValue, difficulty, model: modelToUse, auto, autofix, autodelete, force, batchSize } = argv;
  const doAutoFix = autofix || auto;
  const doAutoDelete = autodelete || auto;

  console.log(`Starting bulk validation for topic: "${topicValue}"...`);
  if (difficulty) console.log(`Difficulty filter: "${difficulty}"`);
  console.log(`Using model: "${modelToUse}"`);
  console.log(`Auto-fix: ${doAutoFix}, Auto-delete: ${doAutoDelete}`);
  console.log(`Force re-validation: ${force}`);
  console.log(`Batch size: ${batchSize}`);
  console.log('----------------------------------------------------');

  try {
    let firestoreQuery: firestore.Query = adminDb.collection(PREDEFINED_QUESTIONS_COLLECTION).where('topicValue', '==', topicValue);
    if (difficulty) {
      firestoreQuery = firestoreQuery.where('difficulty', '==', difficulty as DifficultyLevel);
    }
    
    const snapshot = await firestoreQuery.get();
    
    if (snapshot.empty) {
      console.log(`No questions found for topic "${topicValue}"` + (difficulty ? ` and difficulty "${difficulty}"` : '.') );
      return;
    }

    const allQuestionsInScope = snapshot.docs
        .map(normalizeFirestoreDocToQuestionData)
        .filter((q): q is QuestionData => q !== null);

    const questionsToValidate = force
      ? allQuestionsInScope
      : allQuestionsInScope.filter(q => !['accepted', 'fixed'].includes(q.status || ''));

    if (questionsToValidate.length === 0) {
        console.log('All questions found for the specified criteria have already been validated. Use --force to re-validate all.');
        return;
    }

    console.log(`Found ${allQuestionsInScope.length} total questions. Will validate ${questionsToValidate.length} of them.`);
    let acceptedCount = 0;
    let fixedCount = 0;
    let rejectedCount = 0;
    let deletedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < questionsToValidate.length; i += batchSize) {
      const batch = questionsToValidate.slice(i, i + batchSize);
      console.log(`\n--- Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(questionsToValidate.length / batchSize)} (size: ${batch.length}) ---`);

      const validationPromises = batch.map(question => {
        const flowInput: ValidateSingleQuestionInput = {
          questionData: question,
          modelName: modelToUse,
        };
        return validateSingleTriviaQuestion(flowInput);
      });

      const results = await Promise.allSettled(validationPromises);

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const question = batch[j]!;

        console.log(`\n[${i + j + 1}/${questionsToValidate.length}] Validating question ID: ${question.id} (Current status: ${question.status || 'none'})`);

        if (result.status === 'fulfilled') {
          const validationResult = result.value;
          console.log(`  > AI Status: ${validationResult.validationStatus}. Reason: ${validationResult.reasoning}`);

          if (validationResult.validationStatus === 'Accept') {
            acceptedCount++;
            await adminDb.collection(PREDEFINED_QUESTIONS_COLLECTION).doc(question.id).update({ status: 'accepted' });
            console.log(`  > ACTION: Question ${question.id} accepted and status updated.`);
          } else if (validationResult.validationStatus === 'Reject') {
            rejectedCount++;
            if (doAutoDelete) {
              await adminDb.collection(PREDEFINED_QUESTIONS_COLLECTION).doc(question.id).delete();
              console.log(`  > ACTION: Question ${question.id} automatically DELETED.`);
              deletedCount++;
            } else {
              console.log(`  > ACTION: Manual deletion recommended.`);
            }
          } else if (validationResult.validationStatus === 'Fix' && validationResult.fixedQuestionData) {
            fixedCount++;
            if (doAutoFix) {
              await adminDb.collection(PREDEFINED_QUESTIONS_COLLECTION).doc(question.id).update({ 
                ...validationResult.fixedQuestionData,
                status: 'fixed'
              });
              console.log(`  > ACTION: Question ${question.id} automatically FIXED and status updated.`);
            } else {
              console.log(`  > ACTION: Manual fix recommended.`);
            }
          }
        } else { // status is 'rejected'
          console.error(`  > ERROR validating question ${question.id}:`, result.reason);
          errorCount++;
        }
      }
    }

    console.log('\n--- Validation Summary ---');
    console.log(`Total Questions Processed: ${questionsToValidate.length}`);
    console.log(`Accepted & Status Set: ${acceptedCount}`);
    console.log(`Fixed & Status Set: ${fixedCount} (applied automatically if --autofix or --auto was used)`);
    console.log(`Rejected: ${rejectedCount}`);
    console.log(`  - Deleted: ${deletedCount} (applied automatically if --autodelete or --auto was used)`);
    console.log(`Errors during validation: ${errorCount}`);
    console.log('--------------------------');

  } catch (error) {
    console.error("Fatal error during script execution:", error);
  }
}

main().catch(error => {
  console.error("Unhandled error in validateMultipleQuestions script:", error);
  process.exit(1);
});
