
// src/services/triviaService.ts
'use server';

import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit, DocumentData } from 'firebase/firestore';
import type { GenerateTriviaQuestionOutput, DifficultyLevel } from '@/ai/flows/generate-trivia-question';

export interface PredefinedQuestion extends GenerateTriviaQuestionOutput {
  id: string;
  topicValue: string;
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
      potentialQuestions.push({
        id: doc.id,
        question: data.question,
        answers: data.answers,
        correctAnswerIndex: data.correctAnswerIndex,
        explanation: data.explanation,
        difficulty: data.difficulty,
        topicValue: data.topicValue,
      });
    });

    const unaskedQuestions = potentialQuestions.filter(
      (pq) => !askedQuestionIds.includes(pq.id)
    );

    if (unaskedQuestions.length > 0) {
      const randomIndex = Math.floor(Math.random() * unaskedQuestions.length);
      return unaskedQuestions[randomIndex]!;
    }

    // If no exact match for difficulty, we could implement logic to try +/- 1 difficulty,
    // but for now, we return null and let Genkit handle it with the targetDifficulty.
    console.log(`No predefined question found for topic "${topicValue}" and difficulty "${targetDifficulty}". Falling back to Genkit.`);
    return null; 
  } catch (error) {
    console.error(`Error fetching predefined question (topic: ${topicValue}, difficulty: ${targetDifficulty}):`, error);
    return null;
  }
}
