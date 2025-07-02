// src/services/indexedDBService.ts
'use client';

import type { PredefinedQuestion as QuestionWithNewFormat } from './triviaService';
import type { DifficultyLevel, CategoryDefinition, BilingualText } from '@/types';

// The new format from the service
export type PredefinedQuestion = QuestionWithNewFormat;

// Define old format for conversion
interface OldFormatQuestion {
  id: string;
  topicValue: string;
  question: BilingualText;
  answers: BilingualText[];
  correctAnswerIndex: number;
  explanation: BilingualText;
  difficulty: DifficultyLevel;
  hint?: BilingualText;
  createdAt?: string;
  status?: 'accepted' | 'fixed';
}


const DB_NAME = 'AITriviaMasterDB';
const DB_VERSION = 3; 
const PREDEFINED_QUESTIONS_STORE_NAME = 'predefinedQuestions';
const CUSTOM_QUESTIONS_STORE_NAME = 'customTriviaQuestions';
const CUSTOM_TOPICS_META_STORE_NAME = 'customTopicsMeta';
const APP_DATA_STORE_NAME = 'appDataStore';
const CATEGORIES_CACHE_ID = 'categoriesCache';

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
      if (!db.objectStoreNames.contains(PREDEFINED_QUESTIONS_STORE_NAME)) {
        const store = db.createObjectStore(PREDEFINED_QUESTIONS_STORE_NAME, { keyPath: 'id' });
        store.createIndex('topicValue_difficulty', ['topicValue', 'difficulty'], { unique: false });
        store.createIndex('topicValue', 'topicValue', { unique: false });
      }
      if (!db.objectStoreNames.contains(APP_DATA_STORE_NAME)) {
        db.createObjectStore(APP_DATA_STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(CUSTOM_QUESTIONS_STORE_NAME)) {
        const store = db.createObjectStore(CUSTOM_QUESTIONS_STORE_NAME, { keyPath: 'id' });
        store.createIndex('customTopicValue_difficulty', ['customTopicValue', 'difficulty'], { unique: false });
        store.createIndex('customTopicValue', 'customTopicValue', { unique: false });
      }
      if (!db.objectStoreNames.contains(CUSTOM_TOPICS_META_STORE_NAME)) {
        db.createObjectStore(CUSTOM_TOPICS_META_STORE_NAME, { keyPath: 'customTopicValue' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}

/**
 * Normalizes question data from IndexedDB to the new format.
 * @param q The question object from IndexedDB.
 * @returns A question in the new format (PredefinedQuestion).
 */
function normalizeIDBQuestion(q: any): PredefinedQuestion | null {
  // If it's already in the new format
  if (q.correctAnswer && q.distractors) {
    return q as PredefinedQuestion;
  }
  // If it's in the old format
  if (q.answers && typeof q.correctAnswerIndex === 'number') {
    const oldQ = q as OldFormatQuestion;
    const correctAnswer = oldQ.answers[oldQ.correctAnswerIndex];
    if (!correctAnswer) return null;
    const distractors = oldQ.answers.filter((_, i) => i !== oldQ.correctAnswerIndex);
    
    const newQ: PredefinedQuestion = {
      id: oldQ.id,
      topicValue: oldQ.topicValue,
      question: oldQ.question,
      explanation: oldQ.explanation,
      difficulty: oldQ.difficulty,
      correctAnswer: correctAnswer,
      distractors: distractors,
      hint: oldQ.hint,
      createdAt: oldQ.createdAt,
      status: oldQ.status
    };
    return newQ;
  }
  return null;
}


// --- Predefined Questions ---
export async function saveQuestionsToDB(questions: PredefinedQuestion[]): Promise<void> {
  if (!questions || questions.length === 0) return;
  try {
    const db = await openDB();
    const transaction = db.transaction(PREDEFINED_QUESTIONS_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(PREDEFINED_QUESTIONS_STORE_NAME);

    for (const question of questions) {
      if (!question.id) {
        console.warn('[DEBUG] [IndexedDB Predefined] Attempted to save question without ID:', question);
        continue;
      }
      store.put(question);
    }
    await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject((event.target as IDBTransaction).error);
    });
    console.log(`[DEBUG] [IndexedDB Predefined] Successfully saved/updated ${questions.length} questions.`);
  } catch (error) {
    console.error('[DEBUG] [IndexedDB Predefined] Error saving questions:', error);
    throw error;
  }
}

export async function getQuestionFromDB(
  topicValue: string,
  difficulty: DifficultyLevel,
  askedIds: string[]
): Promise<PredefinedQuestion | null> {
  console.log(`[DEBUG] [IndexedDB Predefined] getQuestion: topic=${topicValue}, diff=${difficulty}, askedCount=${askedIds.length}`);
  try {
    const db = await openDB();
    const transaction = db.transaction(PREDEFINED_QUESTIONS_STORE_NAME, 'readonly');
    const store = transaction.objectStore(PREDEFINED_QUESTIONS_STORE_NAME);
    const index = store.index('topicValue_difficulty');
    
    const keyRange = IDBKeyRange.only([topicValue, difficulty]);
    const request = index.getAll(keyRange);

    return new Promise<PredefinedQuestion | null>((resolve, reject) => {
      request.onsuccess = () => {
        const allMatchingQuestions = request.result.map(normalizeIDBQuestion).filter(Boolean) as PredefinedQuestion[];
        console.log(`[DEBUG] [IndexedDB Predefined] Found ${allMatchingQuestions.length} total normalized questions for ${topicValue}-${difficulty}.`);
        const unaskedQuestions = allMatchingQuestions.filter(q => !askedIds.includes(q.id));

        if (unaskedQuestions.length > 0) {
          const randomIndex = Math.floor(Math.random() * unaskedQuestions.length);
          resolve(unaskedQuestions[randomIndex]!);
        } else {
          resolve(null);
        }
      };
      request.onerror = (event) => reject((event.target as IDBRequest).error);
    });
  } catch (error) {
    console.error('[DEBUG] [IndexedDB Predefined] Error getting question:', error);
    return null; 
  }
}

export async function clearAllQuestionsFromDB(): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction(PREDEFINED_QUESTIONS_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(PREDEFINED_QUESTIONS_STORE_NAME);
    store.clear();
    await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject((event.target as IDBTransaction).error);
    });
    console.log('[DEBUG] [IndexedDB Predefined] All questions cleared.');
  } catch (error) {
    console.error('[DEBUG] [IndexedDB Predefined] Error clearing questions:', error);
    throw error;
  }
}

// --- Custom Questions & Meta ---
export interface CustomQuestion extends Omit<PredefinedQuestion, 'topicValue'> {
  customTopicValue: string; 
  id: string;
}
export interface CustomTopicMeta {
  customTopicValue: string; 
  name: BilingualText;
  detailedPromptInstructions: string;
  createdAt: number;
  icon?: string;
}

export async function saveCustomQuestionsToDB(questions: CustomQuestion[]): Promise<void> {
  if (!questions || questions.length === 0) return;
  try {
    const db = await openDB();
    const transaction = db.transaction(CUSTOM_QUESTIONS_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(CUSTOM_QUESTIONS_STORE_NAME);

    for (const question of questions) {
      if (!question.id) {
        console.warn('[DEBUG] [IndexedDB Custom] Attempted to save custom question without ID:', question);
        continue;
      }
      store.put(question);
    }
    await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject((event.target as IDBTransaction).error);
    });
    console.log(`[DEBUG] [IndexedDB Custom] Successfully saved/updated ${questions.length} custom questions for topic ${questions[0]?.customTopicValue}.`);
  } catch (error) {
    console.error('[DEBUG] [IndexedDB Custom] Error saving custom questions:', error);
    throw error;
  }
}

export async function getCustomQuestionFromDB(
  customTopicValue: string,
  difficulty: DifficultyLevel,
  askedIds: string[]
): Promise<CustomQuestion | null> {
  console.log(`[DEBUG] [IndexedDB Custom] getQuestion: customTopic=${customTopicValue}, diff=${difficulty}, askedCount=${askedIds.length}`);
  try {
    const db = await openDB();
    const transaction = db.transaction(CUSTOM_QUESTIONS_STORE_NAME, 'readonly');
    const store = transaction.objectStore(CUSTOM_QUESTIONS_STORE_NAME);
    const index = store.index('customTopicValue_difficulty');
    
    const keyRange = IDBKeyRange.only([customTopicValue, difficulty]);
    const request = index.getAll(keyRange);

    return new Promise<CustomQuestion | null>((resolve, reject) => {
      request.onsuccess = () => {
        const allMatchingQuestions = request.result as CustomQuestion[];
        console.log(`[DEBUG] [IndexedDB Custom] Found ${allMatchingQuestions.length} total for ${customTopicValue}-${difficulty}.`);
        const unaskedQuestions = allMatchingQuestions.filter(q => !askedIds.includes(q.id));

        if (unaskedQuestions.length > 0) {
          const randomIndex = Math.floor(Math.random() * unaskedQuestions.length);
          resolve(unaskedQuestions[randomIndex]!);
        } else {
          resolve(null);
        }
      };
      request.onerror = (event) => reject((event.target as IDBRequest).error);
    });
  } catch (error) {
    console.error('[DEBUG] [IndexedDB Custom] Error getting custom question:', error);
    return null;
  }
}

export async function saveCustomTopicMeta(meta: CustomTopicMeta): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction(CUSTOM_TOPICS_META_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(CUSTOM_TOPICS_META_STORE_NAME);
    store.put(meta);
    await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject((event.target as IDBTransaction).error);
    });
    console.log(`[DEBUG] [IndexedDB Meta] Saved custom topic meta for: ${meta.customTopicValue}`);
  } catch (error) {
    console.error('[DEBUG] [IndexedDB Meta] Error saving custom topic meta:', error);
    throw error;
  }
}

export async function getCustomTopicsMeta(): Promise<CustomTopicMeta[]> {
  try {
    const db = await openDB();
    const transaction = db.transaction(CUSTOM_TOPICS_META_STORE_NAME, 'readonly');
    const store = transaction.objectStore(CUSTOM_TOPICS_META_STORE_NAME);
    const request = store.getAll();
    const metas = await promisifyRequest(request) as CustomTopicMeta[];
    console.log(`[DEBUG] [IndexedDB Meta] Fetched ${metas.length} custom topic metas.`);
    return metas.sort((a, b) => b.createdAt - a.createdAt); // Sort by most recent
  } catch (error) {
    console.error('[DEBUG] [IndexedDB Meta] Error fetching custom topic metas:', error);
    return [];
  }
}

export async function deleteCustomTopicAndQuestions(customTopicValue: string): Promise<void> {
  try {
    const db = await openDB();
    const questionsTx = db.transaction(CUSTOM_QUESTIONS_STORE_NAME, 'readwrite');
    const questionsStore = questionsTx.objectStore(CUSTOM_QUESTIONS_STORE_NAME);
    const questionsIndex = questionsStore.index('customTopicValue');
    const cursorRequest = questionsIndex.openCursor(IDBKeyRange.only(customTopicValue));
    cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
            questionsStore.delete(cursor.primaryKey);
            cursor.continue();
        }
    };
    await new Promise<void>((resolve, reject) => {
        questionsTx.oncomplete = () => resolve();
        questionsTx.onerror = (event) => reject((event.target as IDBTransaction).error);
    });
    console.log(`[DEBUG] [IndexedDB Custom] Deleted questions for custom topic: ${customTopicValue}`);

    const metaTx = db.transaction(CUSTOM_TOPICS_META_STORE_NAME, 'readwrite');
    const metaStore = metaTx.objectStore(CUSTOM_TOPICS_META_STORE_NAME);
    metaStore.delete(customTopicValue);
    await new Promise<void>((resolve, reject) => {
        metaTx.oncomplete = () => resolve();
        metaTx.onerror = (event) => reject((event.target as IDBTransaction).error);
    });
    console.log(`[DEBUG] [IndexedDB Meta] Deleted meta for custom topic: ${customTopicValue}`);

  } catch (error) {
    console.error(`[DEBUG] [IndexedDB] Error deleting custom topic ${customTopicValue} and its questions:`, error);
    throw error;
  }
}

export async function clearAllCustomQuestionsFromDB(): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction(CUSTOM_QUESTIONS_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(CUSTOM_QUESTIONS_STORE_NAME);
    store.clear();
    await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject((event.target as IDBTransaction).error);
    });
    console.log('[DEBUG] [IndexedDB Custom] All custom questions cleared.');
  } catch (error) {
    console.error('[DEBUG] [IndexedDB Custom] Error clearing custom questions:', error);
    throw error;
  }
}

export async function clearAllCustomTopicsMeta(): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction(CUSTOM_TOPICS_META_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(CUSTOM_TOPICS_META_STORE_NAME);
    store.clear();
     await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject((event.target as IDBTransaction).error);
    });
    console.log('[DEBUG] [IndexedDB Meta] All custom topics meta cleared.');
  } catch (error) {
    console.error('[DEBUG] [IndexedDB Meta] Error clearing custom topics meta:', error);
    throw error;
  }
}


// --- Category Cache Functions (appDataStore) ---
export async function saveCategoriesToCache(categories: CategoryDefinition[]): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction(APP_DATA_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(APP_DATA_STORE_NAME);
    const cacheEntry = {
      id: CATEGORIES_CACHE_ID,
      categories: categories,
      lastUpdated: Date.now(),
    };
    store.put(cacheEntry);
    await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject((event.target as IDBTransaction).error);
    });
    console.log(`[DEBUG] [IndexedDB AppData] Categories saved to cache. Count: ${categories.length}`);
  } catch (error) {
    console.error('[DEBUG] [IndexedDB AppData] Error saving categories to cache:', error);
    throw error;
  }
}

export async function getCategoriesFromCache(): Promise<{ categories: CategoryDefinition[], lastUpdated: number } | null> {
  try {
    const db = await openDB();
    const transaction = db.transaction(APP_DATA_STORE_NAME, 'readonly');
    const store = transaction.objectStore(APP_DATA_STORE_NAME);
    const request = store.get(CATEGORIES_CACHE_ID);
    
    return promisifyRequest(request).then(result => {
      if (result && result.categories && result.lastUpdated) {
        console.log(`[DEBUG] [IndexedDB AppData] Categories fetched from cache. Count: ${result.categories.length}, LastUpdated: ${new Date(result.lastUpdated).toISOString()}`);
        return result as { categories: CategoryDefinition[], lastUpdated: number };
      }
      console.log('[DEBUG] [IndexedDB AppData] No categories found in cache or cache entry malformed.');
      return null;
    });
  } catch (error) {
    console.error('[DEBUG] [IndexedDB AppData] Error fetching categories from cache:', error);
    return null;
  }
}

export async function clearCategoriesCache(): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction(APP_DATA_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(APP_DATA_STORE_NAME);
    store.delete(CATEGORIES_CACHE_ID);
    await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject((event.target as IDBTransaction).error);
    });
    console.log('[DEBUG] [IndexedDB AppData] Categories cache cleared.');
  } catch (error) {
    console.error('[DEBUG] [IndexedDB AppData] Error opening DB or clearing categories cache:', error);
    throw error;
  }
}


// Helper for console debugging during development
if (typeof window !== 'undefined') {
  (window as any).clearAITriviaDB = async () => {
    try {
      await clearAllQuestionsFromDB(); // Predefined
      await clearCategoriesCache();
      await clearAllCustomQuestionsFromDB();
      await clearAllCustomTopicsMeta();
      localStorage.removeItem(CONTENT_VERSION_STORAGE_KEY);
      localStorage.removeItem(DOWNLOADED_TOPICS_STORAGE_KEY);
      console.log('AI Trivia Master IndexedDB (predefined questions, categories, custom questions, custom topics meta) cleared. LocalStorage flags also cleared. Please reload.');
      alert('AI Trivia Master IndexedDB cleared. LocalStorage flags also cleared. Please reload the page.');
    } catch (e) {
      console.error('Error clearing AI Trivia DB:', e);
      alert('Error clearing AI Trivia DB. Check console.');
    }
  };
  (window as any).inspectAITriviaCache = async () => {
    try {
      const db = await openDB();
      const predefinedCountRequest = db.transaction(PREDEFINED_QUESTIONS_STORE_NAME, 'readonly').objectStore(PREDEFINED_QUESTIONS_STORE_NAME).count();
      const customQuestionsCountRequest = db.transaction(CUSTOM_QUESTIONS_STORE_NAME, 'readonly').objectStore(CUSTOM_QUESTIONS_STORE_NAME).count();
      const customTopicsMeta = await getCustomTopicsMeta();
      const categoriesCache = await getCategoriesFromCache();
      const version = localStorage.getItem(CONTENT_VERSION_STORAGE_KEY);
      const downloadedPredefinedTopics = localStorage.getItem(DOWNLOADED_TOPICS_STORAGE_KEY);
      
      console.log("--- AI Trivia Master Cache Inspection ---");
      console.log("Content Version (localStorage):", version);
      console.log("Downloaded Predefined Topics (localStorage):", downloadedPredefinedTopics ? JSON.parse(downloadedPredefinedTopics) : 'Not set');
      console.log("Predefined Questions in IndexedDB:", await promisifyRequest(predefinedCountRequest));
      console.log("Custom Questions in IndexedDB:", await promisifyRequest(customQuestionsCountRequest));
      console.log("Custom Topics Meta in IndexedDB:", customTopicsMeta.length, "items", customTopicsMeta);
      if (categoriesCache) {
        console.log("App Categories in IndexedDB Cache:", categoriesCache.categories.length, "items");
        console.log("Categories Last Updated (IndexedDB):", new Date(categoriesCache.lastUpdated).toLocaleString());
      } else {
        console.log("App Categories in IndexedDB Cache: Not found");
      }
      alert(`Cache inspection details logged to console.`);
    } catch (e) {
      console.error("Error inspecting cache:", e);
      alert("Error inspecting cache. Check console.");
    }
  };
}

// --- Constants for page.tsx ---
export const CONTENT_VERSION_STORAGE_KEY = 'downloadedContentVersion';
export const DOWNLOADED_TOPICS_STORAGE_KEY = 'downloadedTopicValues_v1'; // For predefined categories download status
export const CURRENT_CONTENT_VERSION = "v1.0.584";
