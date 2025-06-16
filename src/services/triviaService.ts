
// src/services/triviaService.ts
'use server';

import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit, DocumentData, orderBy, Timestamp, doc, deleteDoc, updateDoc } from 'firebase/firestore'; // Added updateDoc
import type { GenerateTriviaQuestionOutput, DifficultyLevel, BilingualText } from '@/ai/flows/generate-trivia-question';

export interface PredefinedQuestion extends GenerateTriviaQuestionOutput {
  id: string;
  topicValue: string;
  createdAt?: string; 
}

const PREDEFINED_QUESTIONS_COLLECTION = 'predefinedTriviaQuestions';
const FIRESTORE_QUERY_LIMIT = 200; // Increased limit

/**
 * Fetches a predefined bilingual trivia question from Firestore for a given topicValue and targetDifficulty.
 * Excludes questions whose Firestore ID is in askedQuestionIds.
 * If no question of the exact difficulty is found, it returns null.
 * @param topicValue The topic of the question.
 * @param askedFirestoreIds An array of Firestore document IDs for questions already asked.
 * @param targetDifficulty The desired difficulty level.
 * @returns A PredefinedQuestion (bilingual) or null.
 */
export async function getPredefinedQuestion(
  topicValue: string,
  askedFirestoreIds: string[],
  targetDifficulty: DifficultyLevel
): Promise<PredefinedQuestion | null> {
  console.log(`[getPredefinedQuestion] Attempting to fetch for topic: "${topicValue}", difficulty: "${targetDifficulty}". Asked IDs count: ${askedFirestoreIds.length}`);
  try {
    const questionsRef = collection(db, PREDEFINED_QUESTIONS_COLLECTION);
    
    const q = query(
      questionsRef,
      where('topicValue', '==', topicValue),
      where('difficulty', '==', targetDifficulty),
      limit(FIRESTORE_QUERY_LIMIT) 
    );

    const querySnapshot = await getDocs(q);
    const potentialQuestions: PredefinedQuestion[] = [];
    console.log(`[getPredefinedQuestion] Firestore query for "${topicValue}" (diff: ${targetDifficulty}) returned ${querySnapshot.size} potential questions (limit was ${FIRESTORE_QUERY_LIMIT}).`);

    querySnapshot.forEach((doc) => {
      const data = doc.data() as DocumentData;
      if (data.question && data.answers && typeof data.correctAnswerIndex === 'number' && data.explanation && data.difficulty && data.topicValue) {
        potentialQuestions.push({
          id: doc.id,
          question: data.question as BilingualText,
          answers: data.answers as BilingualText[],
          correctAnswerIndex: data.correctAnswerIndex as number,
          explanation: data.explanation as BilingualText,
          difficulty: data.difficulty as DifficultyLevel,
          topicValue: data.topicValue as string,
          hint: data.hint as BilingualText | undefined,
          createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate().toISOString() : undefined
        });
      }
    });

    const unaskedQuestions = potentialQuestions.filter(
      (pq) => !askedFirestoreIds.includes(pq.id)
    );
    console.log(`[getPredefinedQuestion] After filtering ${potentialQuestions.length} potentials against ${askedFirestoreIds.length} asked IDs, found ${unaskedQuestions.length} unasked questions for "${topicValue}" (diff: ${targetDifficulty}).`);
    // console.log('[getPredefinedQuestion] Asked IDs:', JSON.stringify(askedFirestoreIds));


    if (unaskedQuestions.length > 0) {
      const randomIndex = Math.floor(Math.random() * unaskedQuestions.length);
      const foundQuestion = unaskedQuestions[randomIndex]!;
      console.log(`[getPredefinedQuestion] Returning random unasked question (ID: ${foundQuestion.id}) for "${topicValue}" (diff: ${targetDifficulty}).`);
      return foundQuestion;
    }

    console.log(`[getPredefinedQuestion] No UNASKED predefined question found for topic "${topicValue}" and difficulty "${targetDifficulty}". Will fall back to Genkit if applicable.`);
    return null; 
  } catch (error) {
    console.error(`[getPredefinedQuestion] Error fetching predefined question (topic: ${topicValue}, difficulty: ${targetDifficulty}):`, error);
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
    const q = query(questionsRef, orderBy('topicValue'), orderBy('difficulty')); 
    const querySnapshot = await getDocs(q);
    
    const questions: PredefinedQuestion[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as DocumentData;
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
          createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate().toISOString() : undefined
        });
      } else {
        // console.warn(`[triviaService] Document ${doc.id} in "${PREDEFINED_QUESTIONS_COLLECTION}" is missing essential fields. Skipping.`);
      }
    });
    
    return questions;
  } catch (error) {
    console.error(`[triviaService] Error fetching all predefined questions:`, error);
    throw error; // Re-throw to be caught by caller
  }
}

/**
 * Deletes a predefined question from Firestore.
 * @param questionId The ID of the question to delete.
 * @returns A promise that resolves when the question is deleted.
 */
export async function deletePredefinedQuestion(questionId: string): Promise<void> {
  try {
    const questionRef = doc(db, PREDEFINED_QUESTIONS_COLLECTION, questionId);
    await deleteDoc(questionRef);
  } catch (error) {
    console.error(`[triviaService] Error deleting question ${questionId}:`, error);
    throw error; // Re-throw to be caught by caller
  }
}

/**
 * Updates a predefined question in Firestore.
 * @param questionId The ID of the question to update.
 * @param data The partial data to update the question with.
 * @returns A promise that resolves when the question is updated.
 */
export async function updatePredefinedQuestion(questionId: string, data: Partial<GenerateTriviaQuestionOutput>): Promise<void> {
  try {
    const questionRef = doc(db, PREDEFINED_QUESTIONS_COLLECTION, questionId);
    await updateDoc(questionRef, data);
  } catch (error) {
    console.error(`[triviaService] Error updating question ${questionId}:`, error);
    throw error; // Re-throw to be caught by caller
  }
}

