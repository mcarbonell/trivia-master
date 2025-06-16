// src/services/reportService.ts
'use server';

import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import type { ReportData } from '@/types';

const REPORTS_COLLECTION = 'reportedQuestions';

/**
 * Adds a new question report to Firestore.
 * @param reportData - The data for the report.
 * @returns A promise that resolves when the report is added.
 */
export async function addReport(
  reportData: Omit<ReportData, 'id' | 'reportedAt' | 'status'>
): Promise<void> {
  try {
    const dataToSave: Omit<ReportData, 'id'> = {
      ...reportData,
      reportedAt: serverTimestamp(),
      status: 'new',
    };
    await addDoc(collection(db, REPORTS_COLLECTION), dataToSave);
    console.log('[reportService] Report added successfully:', dataToSave.questionTextEn);
  } catch (error) {
    console.error('[reportService] Error adding report to Firestore:', error);
    throw new Error('Failed to submit report.'); // Generic error for client
  }
}
