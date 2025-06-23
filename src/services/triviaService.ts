
// src/services/triviaService.ts
'use server';

import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit, DocumentData, orderBy, Timestamp, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import type { GenerateTriviaQuestionOutput, DifficultyLevel, BilingualText } from '@/ai/flows/generate-trivia-question';

export interface PredefinedQuestion extends GenerateTriviaQuestionOutput {
  id: string;
  topicValue: string;
  createdAt?: string; 
  status?: 'accepted' | 'fixed';
}

const PREDEFINED_QUESTIONS_COLLECTION = 'predefinedTriviaQuestions';
const FIRESTORE_QUERY_LIMIT_FOR_SINGLE_FETCH = 200; 

/**
 * Fetches a predefined bilingual trivia question from Firestore for a given topicValue and targetDifficulty.
 * Excludes questions whose Firestore ID is in askedQuestionIds.
 * If no question of the exact difficulty is found, it returns null.
 * THIS FUNCTION IS PRIMARILY A FALLBACK FOR WHEN IndexedDB fails or is not populated for a predefined category.
 * @param topicValue The topic of the question.
 * @param askedFirestoreIds An array of Firestore document IDs for questions already asked.
 * @param targetDifficulty The desired difficulty level.
 * @returns A PredefinedQuestion (bilingual) or null.
 */
export async function getPredefinedQuestionFromFirestore( 
  topicValue: string,
  askedFirestoreIds: string[],
  targetDifficulty: DifficultyLevel
): Promise<PredefinedQuestion | null> {
  console.log(`[getPredefinedQuestionFromFirestore] Fallback: Attempting to fetch for topic: "${topicValue}", difficulty: "${targetDifficulty}". Asked IDs count: ${askedFirestoreIds.length}`);
  try {
    const questionsRef = collection(db, PREDEFINED_QUESTIONS_COLLECTION);
    
    const q = query(
      questionsRef,
      where('topicValue', '==', topicValue),
      where('difficulty', '==', targetDifficulty),
      limit(FIRESTORE_QUERY_LIMIT_FOR_SINGLE_FETCH) 
    );

    const querySnapshot = await getDocs(q);
    const potentialQuestions: PredefinedQuestion[] = [];
    // console.log(`[getPredefinedQuestionFromFirestore] Firestore query for "${topicValue}" (diff: ${targetDifficulty}) returned ${querySnapshot.size} potential questions (limit was ${FIRESTORE_QUERY_LIMIT_FOR_SINGLE_FETCH}).`);

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
          status: data.status,
          createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate().toISOString() : undefined
        });
      }
    });

    const unaskedQuestions = potentialQuestions.filter(
      (pq) => !askedFirestoreIds.includes(pq.id)
    );
    // console.log(`[getPredefinedQuestionFromFirestore] After filtering ${potentialQuestions.length} potentials against ${askedFirestoreIds.length} asked IDs, found ${unaskedQuestions.length} unasked questions for "${topicValue}" (diff: ${targetDifficulty}).`);


    if (unaskedQuestions.length > 0) {
      const randomIndex = Math.floor(Math.random() * unaskedQuestions.length);
      const foundQuestion = unaskedQuestions[randomIndex]!;
      // console.log(`[getPredefinedQuestionFromFirestore] Fallback: Returning random unasked question (ID: ${foundQuestion.id}) for "${topicValue}" (diff: ${targetDifficulty}).`);
      return foundQuestion;
    }

    // console.log(`[getPredefinedQuestionFromFirestore] Fallback: No UNASKED predefined question found for topic "${topicValue}" and difficulty "${targetDifficulty}".`);
    return null; 
  } catch (error) {
    console.error(`[getPredefinedQuestionFromFirestore] Fallback: Error fetching predefined question (topic: ${topicValue}, difficulty: ${targetDifficulty}):`, error);
    return null;
  }
}

/**
 * Fetches ALL predefined questions for a specific topicValue from Firestore.
 * Used for initial download to IndexedDB.
 * @param topicValue The topicValue to fetch questions for.
 * @returns A promise that resolves to an array of PredefinedQuestion.
 */
export async function getAllQuestionsForTopic(topicValue: string): Promise<PredefinedQuestion[]> {
  try {
    const questionsRef = collection(db, PREDEFINED_QUESTIONS_COLLECTION);
    const q = query(questionsRef, where('topicValue', '==', topicValue));
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
          status: data.status,
          createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate().toISOString() : undefined
        });
      } else {
        console.warn(`[triviaService.getAllQuestionsForTopic] Document ${doc.id} for topic ${topicValue} is missing essential fields. Skipping.`);
      }
    });
    // console.log(`[triviaService.getAllQuestionsForTopic] Fetched ${questions.length} questions for topic: ${topicValue}`);
    return questions;
  } catch (error) {
    console.error(`[triviaService.getAllQuestionsForTopic] Error fetching questions for topic ${topicValue}:`, error);
    throw error;
  }
}


/**
 * Fetches all predefined bilingual trivia questions from Firestore for a specific category (for Admin Panel).
 * If no topicValue is provided, it returns an empty array.
 * @param topicValue The topicValue of the category to fetch questions for. If null/undefined, returns empty.
 * @returns A promise that resolves to an array of PredefinedQuestion.
 */
export async function getAllPredefinedQuestionsForAdmin(topicValue: string | null): Promise<PredefinedQuestion[]> {
  if (!topicValue) {
    return []; // Return empty if no category is selected
  }
  try {
    const questionsRef = collection(db, PREDEFINED_QUESTIONS_COLLECTION);
    const q = query(
        questionsRef, 
        where('topicValue', '==', topicValue), 
        orderBy('difficulty') // Keep some basic ordering within category
    ); 
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
          status: data.status,
          createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate().toISOString() : undefined
        });
      }
    });
    
    return questions;
  } catch (error) {
    console.error(`[triviaService] Error fetching predefined questions for admin (topic: ${topicValue}):`, error);
    throw error; 
  }
}

export async function deletePredefinedQuestion(questionId: string): Promise<void> {
  try {
    const questionRef = doc(db, PREDEFINED_QUESTIONS_COLLECTION, questionId);
    await deleteDoc(questionRef);
  } catch (error) {
    console.error(`[triviaService] Error deleting question ${questionId}:`, error);
    throw error; 
  }
}

export async function updatePredefinedQuestion(questionId: string, data: Partial<GenerateTriviaQuestionOutput> & { status?: 'accepted' | 'fixed' }): Promise<void> {
  try {
    const questionRef = doc(db, PREDEFINED_QUESTIONS_COLLECTION, questionId);
    // This will now accept the new format from GenerateTriviaQuestionOutput
    await updateDoc(questionRef, data as any); // Using 'as any' to bypass temporary type mismatch during refactor
  } catch (error) {
    console.error(`[triviaService] Error updating question ${questionId}:`, error);
    throw error; 
  }
}
