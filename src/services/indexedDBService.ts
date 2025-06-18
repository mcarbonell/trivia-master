// src/services/indexedDBService.ts
'use client';

import type { PredefinedQuestion } from './triviaService'; // Assuming PredefinedQuestion is exported
import type { DifficultyLevel } from '@/types';

const DB_NAME = 'AITriviaMasterDB';
const DB_VERSION = 1;
const QUESTIONS_STORE_NAME = 'predefinedQuestions';

// Utility to promisify IDBRequest
function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}

export async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      console.warn('IndexedDB not supported or not in browser environment.');
      return reject(new Error('IndexedDB not supported.'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(QUESTIONS_STORE_NAME)) {
        const store = db.createObjectStore(QUESTIONS_STORE_NAME, { keyPath: 'id' });
        // Index for fetching questions by topic and difficulty
        store.createIndex('topicValue_difficulty', ['topicValue', 'difficulty'], { unique: false });
        // Optional: Index for just topicValue if needed for other queries
        store.createIndex('topicValue', 'topicValue', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}

export async function saveQuestionsToDB(questions: PredefinedQuestion[]): Promise<void> {
  if (!questions || questions.length === 0) return;
  try {
    const db = await openDB();
    const transaction = db.transaction(QUESTIONS_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(QUESTIONS_STORE_NAME);

    for (const question of questions) {
      if (!question.id) {
        console.warn('Attempted to save question without ID to IndexedDB:', question);
        continue;
      }
      store.put(question); // put will add or update
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        // console.log(`[IndexedDB] Successfully saved/updated ${questions.length} questions.`);
        resolve();
      };
      transaction.onerror = (event) => {
        console.error('[IndexedDB] Transaction error saving questions:', (event.target as IDBTransaction).error);
        reject((event.target as IDBTransaction).error);
      };
    });
  } catch (error) {
    console.error('[IndexedDB] Error opening DB or initiating transaction for saving questions:', error);
    throw error;
  }
}

export async function getQuestionFromDB(
  topicValue: string,
  difficulty: DifficultyLevel,
  askedIds: string[]
): Promise<PredefinedQuestion | null> {
  try {
    const db = await openDB();
    const transaction = db.transaction(QUESTIONS_STORE_NAME, 'readonly');
    const store = transaction.objectStore(QUESTIONS_STORE_NAME);
    const index = store.index('topicValue_difficulty');
    
    // Using a key range for compound index
    const keyRange = IDBKeyRange.only([topicValue, difficulty]);
    const request = index.getAll(keyRange);

    return new Promise<PredefinedQuestion | null>((resolve, reject) => {
      request.onsuccess = () => {
        const allMatchingQuestions = request.result as PredefinedQuestion[];
        const unaskedQuestions = allMatchingQuestions.filter(q => !askedIds.includes(q.id));

        if (unaskedQuestions.length > 0) {
          const randomIndex = Math.floor(Math.random() * unaskedQuestions.length);
          // console.log(`[IndexedDB] Found ${unaskedQuestions.length} unasked questions for ${topicValue} - ${difficulty}. Returning one.`);
          resolve(unaskedQuestions[randomIndex]!);
        } else {
          // console.log(`[IndexedDB] No unasked questions found for ${topicValue} - ${difficulty} with ${askedIds.length} asked IDs.`);
          resolve(null);
        }
      };
      request.onerror = (event) => {
        console.error('[IndexedDB] Error fetching question:', (event.target as IDBRequest).error);
        reject((event.target as IDBRequest).error);
      };
    });
  } catch (error) {
    console.error('[IndexedDB] Error opening DB or initiating transaction for getting question:', error);
    return null; // Or rethrow, depending on desired error handling
  }
}

export async function countAllQuestionsInDB(): Promise<number> {
  try {
    const db = await openDB();
    const transaction = db.transaction(QUESTIONS_STORE_NAME, 'readonly');
    const store = transaction.objectStore(QUESTIONS_STORE_NAME);
    const request = store.count();
    return promisifyRequest(request);
  } catch (error) {
     console.error('[IndexedDB] Error counting questions:', error);
     return 0;
  }
}

export async function clearAllQuestionsFromDB(): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction(QUESTIONS_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(QUESTIONS_STORE_NAME);
    const request = store.clear();
    
    return new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => {
        // console.log('[IndexedDB] All questions cleared.');
        resolve();
      };
      transaction.onerror = (event) => {
        console.error('[IndexedDB] Error clearing questions:', (event.target as IDBTransaction).error);
        reject((event.target as IDBTransaction).error);
      };
      // Note: request.onsuccess is for the clear operation itself, 
      // but transaction.oncomplete signals the whole transaction is done.
      // request.onsuccess = () => resolve(); 
      // request.onerror = () => reject(request.error); // Already handled by transaction.onerror
    });
  } catch (error) {
    console.error('[IndexedDB] Error opening DB or initiating transaction for clearing questions:', error);
    throw error;
  }
}

// Helper for console debugging during development
if (typeof window !== 'undefined') {
  (window as any).clearTriviaDB = async () => {
    try {
      await clearAllQuestionsFromDB();
      localStorage.removeItem('initialQuestionsDownloaded_v1');
      console.log('AI Trivia Master IndexedDB cleared and download flag removed. Please reload.');
      alert('AI Trivia Master IndexedDB cleared and download flag removed. Please reload the page.');
    } catch (e) {
      console.error('Error clearing Trivia DB:', e);
      alert('Error clearing Trivia DB. Check console.');
    }
  };
  (window as any).countTriviaDB = async () => {
    try {
      const count = await countAllQuestionsInDB();
      console.log(`AI Trivia Master IndexedDB question count: ${count}`);
      alert(`AI Trivia Master IndexedDB question count: ${count}`);
    } catch (e) {
      console.error('Error counting Trivia DB:', e);
      alert('Error counting Trivia DB. Check console.');
    }
  };
}
