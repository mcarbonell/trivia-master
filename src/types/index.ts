// src/types/index.ts
import type { FieldValue } from 'firebase/firestore';
import type { AppLocale } from '@/lib/i18n-config';

export type DifficultyLevel = "easy" | "medium" | "hard";

export interface BilingualText {
  en: string;
  es: string;
}

export type CategoryDifficultyGuideline = string;

export interface CategoryDefinition {
  id: string; 
  topicValue: string; 
  name: BilingualText; 
  icon: string; 
  detailedPromptInstructions: string; 
  difficultySpecificGuidelines?: { 
    "easy"?: CategoryDifficultyGuideline;
    "medium"?: CategoryDifficultyGuideline;
    "hard"?: CategoryDifficultyGuideline;
  };
  isPredefined?: boolean; 
}

export type DifficultyMode = "adaptive" | DifficultyLevel;

export type ReportReason =
  | 'incorrect_info'
  | 'poorly_worded'
  | 'typo_grammar'
  | 'duplicate_question'
  | 'offensive_content'
  | 'other';

export type ReportStatus = 'new' | 'reviewed' | 'resolved' | 'ignored';

export interface ReportData {
  id: string; // Firestore document ID for the report itself
  questionId?: string; // Firestore ID of the predefined question, if reported from one
  questionTextEn: string;
  questionTextEs: string;
  categoryTopicValue: string;
  difficulty: DifficultyLevel;
  reason: ReportReason;
  details?: string;
  reportedAt: FieldValue | Timestamp; // Allow Timestamp for reading
  locale: AppLocale; 
  status: ReportStatus; 
}
// Add Timestamp for reading compatibility
import type { Timestamp } from 'firebase/firestore';

