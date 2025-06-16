// src/services/triviaService.ts
'use server';

import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit, DocumentData, orderBy } from 'firebase/firestore'; // Added orderBy
import type { GenerateTriviaQuestionOutput, DifficultyLevel, BilingualText } from '@/ai/flows/generate-trivia-question'; // Added BilingualText

export interface PredefinedQuestion extends GenerateTriviaQuestionOutput {
  id: string;
  topicValue: string;
  createdAt?: admin.firestore.Timestamp | Date; // Optional, if populated by script
}

const PREDEFINED_QUESTIONS_COLLECTION = 'predefinedTriviaQuestions';
const BATCH_SIZE_PER_DIFFICULTY = 5; // Fetch a smaller batch if filtering by difficulty

/**
 * Fetches a predefined bilingual trivia question from Firestore for a given topicValue and targetDifficulty.
 * Excludes questions whose Firestore ID is in askedQuestionIds.
 * If no question of the exact difficulty is found, it returns null.
 * @param topicValue The topic of the question.
 * @param askedQuestionIds An array of Firestore document IDs for questions already asked.
 * @param targetDifficulty The desired difficulty level.
 * @returns A PredefinedQuestion (bilingual) or null.
 */
export async function getPredefinedQuestion(
  topicValue: string,
  askedQuestionIds: string[],
  targetDifficulty: DifficultyLevel
): Promise<PredefinedQuestion | null> {
  try {
    const questionsRef = collection(db, PREDEFINED_QUESTIONS_COLLECTION);
    
    // Query for questions matching topic AND difficulty
    const q = query(
      questionsRef,
      where('topicValue', '==', topicValue),
      where('difficulty', '==', targetDifficulty),
      limit(BATCH_SIZE_PER_DIFFICULTY) 
    );

    const querySnapshot = await getDocs(q);
    const potentialQuestions: PredefinedQuestion[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data() as DocumentData;
      // Ensure all required fields from GenerateTriviaQuestionOutput are present
      if (data.question && data.answers && typeof data.correctAnswerIndex === 'number' && data.explanation && data.difficulty && data.topicValue) {
        potentialQuestions.push({
          id: doc.id,
          question: data.question as BilingualText,
          answers: data.answers as BilingualText[],
          correctAnswerIndex: data.correctAnswerIndex as number,
          explanation: data.explanation as BilingualText,
          difficulty: data.difficulty as DifficultyLevel,
          topicValue: data.topicValue as string,
          hint: data.hint as BilingualText | undefined, // Add hint
          createdAt: data.createdAt // Keep createdAt if it exists
        });
      }
    });

    const unaskedQuestions = potentialQuestions.filter(
      (pq) => !askedQuestionIds.includes(pq.id)
    );

    if (unaskedQuestions.length > 0) {
      const randomIndex = Math.floor(Math.random() * unaskedQuestions.length);
      return unaskedQuestions[randomIndex]!;
    }

    console.log(`No predefined question found for topic "${topicValue}" and difficulty "${targetDifficulty}". Falling back to Genkit.`);
    return null; 
  } catch (error) {
    console.error(`Error fetching predefined question (topic: ${topicValue}, difficulty: ${targetDifficulty}):`, error);
    return null;
  }
}


/**
 * Fetches all predefined bilingual trivia questions from Firestore.
 * @returns A promise that resolves to an array of PredefinedQuestion.
 */
export async function getAllPredefinedQuestions(): Promise<PredefinedQuestion[]> {
  try {
    const questionsRef = collection(db, PREDEFINED_QUESTIONS_COLLECTION);
    // Optionally, order by creation date or topic
    const q = query(questionsRef, orderBy('topicValue'), orderBy('difficulty')); 
    const querySnapshot = await getDocs(q);
    
    const questions: PredefinedQuestion[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as DocumentData;
      // Basic validation to ensure essential fields are present
      if (data.question && data.answers && typeof data.correctAnswerIndex === 'number' && data.explanation && data.difficulty && data.topicValue) {
        questions.push({
          id: doc.id,
          question: data.question as BilingualText,
          answers: data.answers as BilingualText[],
          correctAnswerIndex: data.correctAnswerIndex as number,
          explanation: data.explanation as BilingualText,
          difficulty: data.difficulty as DifficultyLevel,
          topicValue: data.topicValue as string,
          hint: data.hint as BilingualText | undefined,
          createdAt: data.createdAt // Keep createdAt if it exists
        });
      } else {
        console.warn(`[triviaService] Document ${doc.id} in "${PREDEFINED_QUESTIONS_COLLECTION}" is missing essential fields. Skipping.`);
      }
    });
    
    return questions;
  } catch (error) {
    console.error(`[triviaService] Error fetching all predefined questions:`, error);
    throw error; // Re-throw to be caught by caller
  }
}
