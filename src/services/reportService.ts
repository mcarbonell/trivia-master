// src/services/reportService.ts
'use server';

import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, doc, updateDoc, deleteDoc, type Timestamp } from 'firebase/firestore';
import type { ReportData, ReportStatus } from '@/types';

const REPORTS_COLLECTION = 'reportedQuestions';

/**
 * Adds a new question report to Firestore.
 * @param reportData - The data for the report, excluding id, reportedAt, status.
 * @returns A promise that resolves when the report is added.
 */
export async function addReport(
  reportData: Omit<ReportData, 'id' | 'reportedAt' | 'status'>
): Promise<void> {
  try {
    const dataToSave: Omit<ReportData, 'id'> = {
      ...reportData,
      reportedAt: serverTimestamp(),
      status: 'new', // Default status for new reports
    };
    await addDoc(collection(db, REPORTS_COLLECTION), dataToSave);
    console.log('[reportService] Report added successfully for question related to:', reportData.questionTextEn);
  } catch (error) {
    console.error('[reportService] Error adding report to Firestore:', error);
    throw new Error('Failed to submit report.'); 
  }
}

/**
 * Fetches all reported questions from Firestore, ordered by reportedAt descending.
 * @returns A promise that resolves to an array of ReportData.
 */
export async function getReportedQuestions(): Promise<ReportData[]> {
  try {
    const reportsRef = collection(db, REPORTS_COLLECTION);
    const q = query(reportsRef, orderBy('reportedAt', 'desc'));
    const querySnapshot = await getDocs(q);

    const reports: ReportData[] = [];
    querySnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      reports.push({
        id: docSnapshot.id,
        questionId: data.questionId,
        questionTextEn: data.questionTextEn,
        questionTextEs: data.questionTextEs,
        categoryTopicValue: data.categoryTopicValue,
        difficulty: data.difficulty,
        reason: data.reason,
        details: data.details,
        reportedAt: data.reportedAt as Timestamp, // Cast to Timestamp for consistent handling
        locale: data.locale,
        status: data.status,
      });
    });
    return reports;
  } catch (error) {
    console.error('[reportService] Error fetching reported questions:', error);
    throw error;
  }
}

/**
 * Updates the status of a specific report.
 * @param reportId The ID of the report to update.
 * @param status The new status for the report.
 * @returns A promise that resolves when the report status is updated.
 */
export async function updateReportStatus(reportId: string, status: ReportStatus): Promise<void> {
  try {
    const reportRef = doc(db, REPORTS_COLLECTION, reportId);
    await updateDoc(reportRef, { status });
    console.log(`[reportService] Status of report ${reportId} updated to ${status}.`);
  } catch (error) {
    console.error(`[reportService] Error updating status for report ${reportId}:`, error);
    throw error;
  }
}

/**
 * Deletes a specific report from Firestore.
 * @param reportId The ID of the report to delete.
 * @returns A promise that resolves when the report is deleted.
 */
export async function deleteReport(reportId: string): Promise<void> {
  try {
    const reportRef = doc(db, REPORTS_COLLECTION, reportId);
    await deleteDoc(reportRef);
    console.log(`[reportService] Report ${reportId} deleted successfully.`);
  } catch (error) {
    console.error(`[reportService] Error deleting report ${reportId}:`, error);
    throw error;
  }
}
