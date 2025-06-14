
// src/services/triviaService.ts
'use server';

import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit, orderBy, startAt, DocumentData } from 'firebase/firestore';
import type { GenerateTriviaQuestionOutput } from '@/ai/flows/generate-trivia-question';

export interface PredefinedQuestion extends GenerateTriviaQuestionOutput {
  id: string; // Firestore document ID
  topicValue: string;
  language: string;
}

const PREDEFINED_QUESTIONS_COLLECTION = 'predefinedTriviaQuestions';
const BATCH_SIZE = 10; // Number of questions to fetch in a batch

/**
 * Fetches a batch of predefined trivia questions from Firestore for a given topic and language,
 * excluding questions whose text is in askedQuestionTexts.
 * It then randomly picks one suitable question from the fetched batch.
 * @param topicValue The topic of the question (e.g., "Science").
 * @param language The language of the question (e.g., "en", "es").
 * @param askedQuestionTexts An array of question texts that have already been asked in the current session.
 * @returns A PredefinedQuestion or null if no suitable question is found.
 */
export async function getPredefinedQuestion(
  topicValue: string,
  language: string,
  askedQuestionTexts: string[]
): Promise<PredefinedQuestion | null> {
  try {
    const questionsRef = collection(db, PREDEFINED_QUESTIONS_COLLECTION);
    
    // We fetch a batch of questions and filter client-side because complex "not-in" queries are limited in Firestore,
    // and "askedQuestionTexts" could grow.
    // For true randomness over a large dataset without re-fetching everything, more complex strategies
    // would be needed (e.g., random document ID generation within a range, Cloud Function for random pick).
    // This approach is a practical compromise.
    const q = query(
      questionsRef,
      where('topicValue', '==', topicValue),
      where('language', '==', language),
      limit(BATCH_SIZE) // Fetch a small batch
    );

    const querySnapshot = await getDocs(q);
    const potentialQuestions: PredefinedQuestion[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data() as DocumentData;
      potentialQuestions.push({
        id: doc.id,
        question: data.question,
        answers: data.answers,
        correctAnswerIndex: data.correctAnswerIndex,
        explanation: data.explanation,
        topicValue: data.topicValue,
        language: data.language,
      });
    });

    const unaskedQuestions = potentialQuestions.filter(
      (pq) => !askedQuestionTexts.includes(pq.question)
    );

    if (unaskedQuestions.length > 0) {
      // Pick a random question from the unasked ones in the batch
      const randomIndex = Math.floor(Math.random() * unaskedQuestions.length);
      return unaskedQuestions[randomIndex]!;
    }

    return null; // No unasked questions found in this batch
  } catch (error) {
    console.error("Error fetching predefined question from Firestore:", error);
    return null;
  }
}
