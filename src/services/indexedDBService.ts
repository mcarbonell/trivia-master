// src/services/indexedDBService.ts
'use client';

import type { PredefinedQuestion } from './triviaService';
import type { DifficultyLevel, CategoryDefinition } from '@/types';

const DB_NAME = 'AITriviaMasterDB';
const DB_VERSION = 2; // Incremented DB_VERSION
const QUESTIONS_STORE_NAME = 'predefinedQuestions';
const APP_DATA_STORE_NAME = 'appDataStore'; // New store for categories and other app data
const CATEGORIES_CACHE_ID = 'categoriesCache';

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
        store.createIndex('topicValue_difficulty', ['topicValue', 'difficulty'], { unique: false });
        store.createIndex('topicValue', 'topicValue', { unique: false });
      }
      if (!db.objectStoreNames.contains(APP_DATA_STORE_NAME)) {
        db.createObjectStore(APP_DATA_STORE_NAME, { keyPath: 'id' });
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
        console.warn('[DEBUG] [IndexedDB] Attempted to save question without ID to IndexedDB:', question);
        continue;
      }
      store.put(question);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        console.log(`[DEBUG] [IndexedDB] Successfully saved/updated ${questions.length} questions.`);
        resolve();
      };
      transaction.onerror = (event) => {
        console.error('[DEBUG] [IndexedDB] Transaction error saving questions:', (event.target as IDBTransaction).error);
        reject((event.target as IDBTransaction).error);
      };
    });
  } catch (error) {
    console.error('[DEBUG] [IndexedDB] Error opening DB or initiating transaction for saving questions:', error);
    throw error;
  }
}

export async function getQuestionFromDB(
  topicValue: string,
  difficulty: DifficultyLevel,
  askedIds: string[]
): Promise<PredefinedQuestion | null> {
  console.log(`[DEBUG] [IndexedDB] getQuestionFromDB: topicValue=${topicValue}, difficulty=${difficulty}, askedIdsCount=${askedIds.length}`);
  try {
    const db = await openDB();
    const transaction = db.transaction(QUESTIONS_STORE_NAME, 'readonly');
    const store = transaction.objectStore(QUESTIONS_STORE_NAME);
    const index = store.index('topicValue_difficulty');
    
    const keyRange = IDBKeyRange.only([topicValue, difficulty]);
    const request = index.getAll(keyRange);

    return new Promise<PredefinedQuestion | null>((resolve, reject) => {
      request.onsuccess = () => {
        const allMatchingQuestions = request.result as PredefinedQuestion[];
        console.log(`[DEBUG] [IndexedDB] getQuestionFromDB: Found ${allMatchingQuestions.length} total matching questions for ${topicValue} - ${difficulty}.`);
        const unaskedQuestions = allMatchingQuestions.filter(q => !askedIds.includes(q.id));

        if (unaskedQuestions.length > 0) {
          const randomIndex = Math.floor(Math.random() * unaskedQuestions.length);
          console.log(`[DEBUG] [IndexedDB] getQuestionFromDB: Found ${unaskedQuestions.length} unasked questions. Returning one (ID: ${unaskedQuestions[randomIndex]!.id}).`);
          resolve(unaskedQuestions[randomIndex]!);
        } else {
          console.log(`[DEBUG] [IndexedDB] getQuestionFromDB: No unasked questions found for ${topicValue} - ${difficulty} (asked IDs: ${askedIds.join(', ')}).`);
          resolve(null);
        }
      };
      request.onerror = (event) => {
        console.error('[DEBUG] [IndexedDB] getQuestionFromDB: Error fetching question:', (event.target as IDBRequest).error);
        reject((event.target as IDBRequest).error);
      };
    });
  } catch (error) {
    console.error('[DEBUG] [IndexedDB] getQuestionFromDB: Error opening DB or initiating transaction:', error);
    return null; 
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
    store.clear(); // Clears all objects from the store
    
    return new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => {
        console.log('[DEBUG] [IndexedDB] All questions cleared from questions store.');
        resolve();
      };
      transaction.onerror = (event) => {
        console.error('[DEBUG] [IndexedDB] Error clearing questions store:', (event.target as IDBTransaction).error);
        reject((event.target as IDBTransaction).error);
      };
    });
  } catch (error) {
    console.error('[DEBUG] [IndexedDB] Error opening DB or initiating transaction for clearing questions store:', error);
    throw error;
  }
}

export async function countQuestionsByCriteriaInDB(criteria: { topicValue?: string; difficulty?: DifficultyLevel }): Promise<number> {
  if (!criteria.topicValue && !criteria.difficulty) {
    console.error('[IndexedDB] countQuestionsByCriteriaInDB: Please provide at least one criterion (topicValue or difficulty).');
    return 0;
  }

  try {
    const db = await openDB();
    const transaction = db.transaction(QUESTIONS_STORE_NAME, 'readonly');
    const store = transaction.objectStore(QUESTIONS_STORE_NAME);

    if (criteria.topicValue && criteria.difficulty) {
      const index = store.index('topicValue_difficulty');
      const keyRange = IDBKeyRange.only([criteria.topicValue, criteria.difficulty]);
      const request = index.count(keyRange);
      return promisifyRequest(request);
    } else if (criteria.topicValue) {
      const index = store.index('topicValue');
      const keyRange = IDBKeyRange.only(criteria.topicValue);
      const request = index.count(keyRange);
      return promisifyRequest(request);
    } else if (criteria.difficulty) {
      let count = 0;
      return new Promise((resolve, reject) => {
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (cursor) {
            if (cursor.value.difficulty === criteria.difficulty) {
              count++;
            }
            cursor.continue();
          } else {
            resolve(count);
          }
        };
        cursorRequest.onerror = (event) => {
          console.error('[IndexedDB] Error iterating with cursor for difficulty count:', (event.target as IDBRequest).error);
          reject((event.target as IDBRequest).error);
        };
      });
    }
    return 0;
  } catch (error) {
    console.error('[IndexedDB] Error counting questions by criteria:', error);
    return 0;
  }
}

// --- Category Cache Functions ---

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

    return new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => {
        console.log(`[DEBUG] [IndexedDB] Categories saved to cache. Count: ${categories.length}`);
        resolve();
      };
      transaction.onerror = (event) => {
        console.error('[DEBUG] [IndexedDB] Transaction error saving categories to cache:', (event.target as IDBTransaction).error);
        reject((event.target as IDBTransaction).error);
      };
    });
  } catch (error) {
    console.error('[DEBUG] [IndexedDB] Error opening DB or saving categories to cache:', error);
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
        console.log(`[DEBUG] [IndexedDB] Categories fetched from cache. Count: ${result.categories.length}, LastUpdated: ${new Date(result.lastUpdated).toISOString()}`);
        return result as { categories: CategoryDefinition[], lastUpdated: number };
      }
      console.log('[DEBUG] [IndexedDB] No categories found in cache or cache entry malformed.');
      return null;
    });
  } catch (error) {
    console.error('[DEBUG] [IndexedDB] Error fetching categories from cache:', error);
    return null;
  }
}

export async function clearCategoriesCache(): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction(APP_DATA_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(APP_DATA_STORE_NAME);
    store.delete(CATEGORIES_CACHE_ID);

    return new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => {
        console.log('[DEBUG] [IndexedDB] Categories cache cleared.');
        resolve();
      };
      transaction.onerror = (event) => {
        console.error('[DEBUG] [IndexedDB] Transaction error clearing categories cache:', (event.target as IDBTransaction).error);
        reject((event.target as IDBTransaction).error);
      };
    });
  } catch (error) {
    console.error('[DEBUG] [IndexedDB] Error opening DB or clearing categories cache:', error);
    throw error;
  }
}


// Helper for console debugging during development
if (typeof window !== 'undefined') {
  (window as any).clearAITriviaDB = async () => {
    try {
      await clearAllQuestionsFromDB();
      await clearCategoriesCache();
      localStorage.removeItem(CONTENT_VERSION_STORAGE_KEY); // This is now in page.tsx
      localStorage.removeItem(DOWNLOADED_TOPICS_STORAGE_KEY); // This is now in page.tsx
      console.log('AI Trivia Master IndexedDB (questions & categories) cleared. LocalStorage flags also cleared. Please reload.');
      alert('AI Trivia Master IndexedDB (questions & categories) cleared. LocalStorage flags also cleared. Please reload the page.');
    } catch (e) {
      console.error('Error clearing AI Trivia DB:', e);
      alert('Error clearing AI Trivia DB. Check console.');
    }
  };
  (window as any).inspectAITriviaCache = async () => {
    try {
      const questionsCount = await countAllQuestionsInDB();
      const categoriesCache = await getCategoriesFromCache();
      const version = localStorage.getItem('downloadedContentVersion');
      const topics = localStorage.getItem('downloadedTopicValues_v1');
      
      console.log("--- AI Trivia Master Cache Inspection ---");
      console.log("Content Version (localStorage):", version);
      console.log("Downloaded Topics (localStorage):", topics ? JSON.parse(topics) : 'Not set');
      console.log("Questions in IndexedDB:", questionsCount);
      if (categoriesCache) {
        console.log("Categories in IndexedDB Cache:", categoriesCache.categories.length, "items");
        console.log("Categories Last Updated (IndexedDB):", new Date(categoriesCache.lastUpdated).toLocaleString());
      } else {
        console.log("Categories in IndexedDB Cache: Not found");
      }
      alert(`Cache inspection details logged to console. Questions: ${questionsCount}, Categories: ${categoriesCache ? categoriesCache.categories.length : 'N/A'}`);
    } catch (e) {
      console.error("Error inspecting cache:", e);
      alert("Error inspecting cache. Check console.");
    }
  };
}
