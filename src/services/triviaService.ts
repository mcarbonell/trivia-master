
// src/services/triviaService.ts
'use server';

import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit, DocumentData } from 'firebase/firestore';
import type { GenerateTriviaQuestionOutput } from '@/ai/flows/generate-trivia-question';

// PredefinedQuestion now directly uses the bilingual GenerateTriviaQuestionOutput structure
// and adds Firestore document ID and the original topicValue.
export interface PredefinedQuestion extends GenerateTriviaQuestionOutput {
  id: string; // Firestore document ID
  topicValue: string; // The original topic value used for querying (e.g., "Science")
}

const PREDEFINED_QUESTIONS_COLLECTION = 'predefinedTriviaQuestions';
const BATCH_SIZE = 10; // Number of questions to fetch in a batch

/**
 * Fetches a batch of predefined bilingual trivia questions from Firestore for a given topicValue,
 * excluding questions whose Firestore ID is in askedQuestionIds.
 * It then randomly picks one suitable question from the fetched batch.
 * @param topicValue The topic of the question (e.g., "Science").
 * @param askedQuestionIds An array of Firestore document IDs for questions already asked.
 * @returns A PredefinedQuestion (bilingual) or null if no suitable question is found.
 */
export async function getPredefinedQuestion(
  topicValue: string,
  askedQuestionIds: string[]
): Promise<PredefinedQuestion | null> {
  try {
    const questionsRef = collection(db, PREDEFINED_QUESTIONS_COLLECTION);
    
    // Fetch a batch of questions for the given topic.
    // Filtering by askedQuestionIds will happen client-side on this batch.
    const q = query(
      questionsRef,
      where('topicValue', '==', topicValue),
      limit(BATCH_SIZE) // Fetch a small batch
    );

    const querySnapshot = await getDocs(q);
    const potentialQuestions: PredefinedQuestion[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data() as DocumentData; // Firestore data
      // Construct the PredefinedQuestion, assuming data matches GenerateTriviaQuestionOutput structure + topicValue
      potentialQuestions.push({
        id: doc.id,
        question: data.question, // e.g., { en: "...", es: "..." }
        answers: data.answers,   // e.g., [ { en: "...", es: "..." }, ... ]
        correctAnswerIndex: data.correctAnswerIndex,
        explanation: data.explanation, // e.g., { en: "...", es: "..." }
        difficulty: data.difficulty,
        topicValue: data.topicValue, // Persisted topicValue from script
      });
    });

    const unaskedQuestions = potentialQuestions.filter(
      (pq) => !askedQuestionIds.includes(pq.id)
    );

    if (unaskedQuestions.length > 0) {
      const randomIndex = Math.floor(Math.random() * unaskedQuestions.length);
      return unaskedQuestions[randomIndex]!;
    }

    return null; 
  } catch (error) {
    console.error("Error fetching predefined bilingual question from Firestore:", error);
    return null;
  }
}
