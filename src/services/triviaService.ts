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
 * Normalizes question data from Firestore to the new format (correctAnswer + distractors).
 * Handles both new and old data structures.
 * @param docId The Firestore document ID.
 * @param data The document data.
 * @returns A PredefinedQuestion object in the new format, or null if data is invalid.
 */
export async function normalizeQuestionData(docId: string, data: DocumentData): Promise<PredefinedQuestion | null> {
  // Base validation for common fields
  if (!data.question || !data.explanation || !data.difficulty || !data.topicValue) {
    return null;
  }

  const baseQuestion = {
    id: docId,
    question: data.question as BilingualText,
    explanation: data.explanation as BilingualText,
    difficulty: data.difficulty as DifficultyLevel,
    topicValue: data.topicValue as string,
    hint: data.hint as BilingualText | undefined,
    status: data.status as 'accepted' | 'fixed' | undefined,
    createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate().toISOString() : undefined
  };

  // Check for new format (correctAnswer + distractors)
  if (data.correctAnswer && Array.isArray(data.distractors)) {
    return {
      ...baseQuestion,
      correctAnswer: data.correctAnswer as BilingualText,
      distractors: data.distractors as BilingualText[]
    };
  }

  // Check for old format (answers + correctAnswerIndex) and convert it
  if (Array.isArray(data.answers) && typeof data.correctAnswerIndex === 'number') {
    const { answers, correctAnswerIndex } = data;
    if (correctAnswerIndex < 0 || correctAnswerIndex >= answers.length) {
        console.warn(`[normalizeQuestionData] Invalid old format for ${docId}: correctAnswerIndex out of bounds.`);
        return null;
    }
    const correctAnswer = answers[correctAnswerIndex];
    if (!correctAnswer) {
      console.warn(`[normalizeQuestionData] Invalid old format for ${docId}: correctAnswer at index ${correctAnswerIndex} is missing.`);
      return null;
    }
    const distractors = answers.filter((_: any, i: number) => i !== correctAnswerIndex);

    return {
      ...baseQuestion,
      correctAnswer: correctAnswer,
      distractors: distractors
    };
  }

  console.warn(`[normalizeQuestionData] Document ${docId} does not match any known question format. Skipping.`);
  return null;
}


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
    const normalizationPromises = querySnapshot.docs.map(doc => normalizeQuestionData(doc.id, doc.data()));
    const potentialQuestions = (await Promise.all(normalizationPromises)).filter((q): q is PredefinedQuestion => q !== null);

    const unaskedQuestions = potentialQuestions.filter(
      (pq) => !askedFirestoreIds.includes(pq.id)
    );

    if (unaskedQuestions.length > 0) {
      const randomIndex = Math.floor(Math.random() * unaskedQuestions.length);
      const foundQuestion = unaskedQuestions[randomIndex]!;
      return foundQuestion;
    }

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

    const normalizationPromises = querySnapshot.docs.map(doc => normalizeQuestionData(doc.id, doc.data()));
    const questions = (await Promise.all(normalizationPromises)).filter((q): q is PredefinedQuestion => q !== null);
    
    return questions;
  } catch (error) {
    console.error(`[triviaService.getAllQuestionsForTopic] Error fetching questions for topic ${topicValue}:`, error);
    throw error;
  }
}


/**
 * Fetches all predefined bilingual trivia questions from Firestore for a specific category (for Admin Panel).
 * It normalizes data on read to ensure the admin panel always works with the new format.
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
        orderBy('difficulty') 
    ); 
    const querySnapshot = await getDocs(q);
    
    const normalizationPromises = querySnapshot.docs.map(doc => normalizeQuestionData(doc.id, doc.data()));
    const questions = (await Promise.all(normalizationPromises)).filter((q): q is PredefinedQuestion => q !== null);
    
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
    await updateDoc(questionRef, data as any);
  } catch (error) {
    console.error(`[triviaService] Error updating question ${questionId}:`, error);
    throw error; 
  }
}

/**
 * Fetches and normalizes a single question by its ID.
 * This is a server action to be called from client components to avoid passing non-plain objects.
 * @param questionId The Firestore document ID of the question.
 * @returns A promise that resolves to a normalized PredefinedQuestion or null if not found.
 */
export async function getNormalizedQuestionById(questionId: string): Promise<PredefinedQuestion | null> {
  try {
    const questionRef = doc(db, PREDEFINED_QUESTIONS_COLLECTION, questionId);
    const docSnap = await getDoc(questionRef);

    if (docSnap.exists()) {
      return normalizeQuestionData(docSnap.id, docSnap.data());
    }
    
    console.warn(`[getNormalizedQuestionById] Question with ID "${questionId}" not found.`);
    return null;

  } catch (error) {
    console.error(`[getNormalizedQuestionById] Error fetching question ${questionId}:`, error);
    throw error;
  }
}
