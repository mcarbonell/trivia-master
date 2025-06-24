// src/services/gameSessionService.ts
'use server';

import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, getDocs, type Timestamp } from 'firebase/firestore';
import type { GameSession, BilingualText, DifficultyMode } from '@/types';

const GAME_SESSIONS_COLLECTION = 'gameSessions';

/**
 * Adds a new completed game session to Firestore for a specific user.
 * @param sessionData Data for the game session, excluding the Firestore ID and completion timestamp.
 */
export async function addGameSession(
  sessionData: Omit<GameSession, 'id' | 'completedAt'>
): Promise<void> {
  try {
    const dataToSave = {
      ...sessionData,
      completedAt: serverTimestamp(),
    };
    await addDoc(collection(db, GAME_SESSIONS_COLLECTION), dataToSave);
  } catch (error) {
    console.error(`[gameSessionService] Error adding game session for user ${sessionData.userId}:`, error);
    // We don't throw here to not interrupt the user's game-over flow
  }
}

/**
 * Fetches all game sessions for a specific user, ordered by completion date.
 * @param userId The UID of the user whose sessions are to be fetched.
 * @returns A promise that resolves to an array of GameSession objects.
 */
export async function getUserGameSessions(userId: string): Promise<GameSession[]> {
  try {
    const sessionsRef = collection(db, GAME_SESSIONS_COLLECTION);
    // The query was changed to remove orderBy to prevent a missing-index error in Firestore.
    // Sorting is now handled in the application code after fetching.
    const q = query(
      sessionsRef,
      where('userId', '==', userId)
      // orderBy('completedAt', 'desc') // This requires a composite index in Firestore.
    );
    const querySnapshot = await getDocs(q);

    const sessions: GameSession[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const completedAtTimestamp = data.completedAt as Timestamp | null;
      // Handle cases where completedAt might not be set yet if using serverTimestamp
      const completedAtString = completedAtTimestamp ? completedAtTimestamp.toDate().toISOString() : new Date().toISOString();

      sessions.push({
        id: doc.id,
        userId: data.userId,
        completedAt: completedAtString,
        categoryTopicValue: data.categoryTopicValue,
        categoryName: data.categoryName,
        difficultyMode: data.difficultyMode,
        finalScoreCorrect: data.finalScoreCorrect,
        finalScoreIncorrect: data.finalScoreIncorrect,
        totalQuestions: data.totalQuestions,
        isCustomTopic: data.isCustomTopic,
      });
    });
    
    // Sort the sessions by completion date descending in the application code.
    sessions.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    
    return sessions;
  } catch (error) {
    console.error(`[gameSessionService] Error fetching game sessions for user ${userId}:`, error);
    throw new Error('Failed to fetch game history.');
  }
}
