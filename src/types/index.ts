
// src/types/index.ts
import type { FieldValue } from 'firebase/firestore'; // Keep for write operations if needed elsewhere
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
  parentTopicValue?: string; // Added for hierarchy
  difficultySpecificGuidelines?: { 
    "easy"?: CategoryDifficultyGuideline;
    "medium"?: CategoryDifficultyGuideline;
    "hard"?: CategoryDifficultyGuideline;
  };
  isPredefined?: boolean; // Controls visibility in the main game category selection UI
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
  id: string; 
  questionId?: string; 
  questionTextEn: string;
  questionTextEs: string;
  categoryTopicValue: string;
  difficulty: DifficultyLevel;
  reason: ReportReason;
  details?: string;
  reportedAt: string; 
  locale: AppLocale; 
  status: ReportStatus; 
}

export interface SuggestionData {
  id: string;
  name?: string;
  email?: string;
  message: string;
  submittedAt: string; // Changed to string for client components
  locale: AppLocale;
}

// Add Timestamp for reading compatibility where services interact directly with Firestore
// but ensure conversion to string before passing to client.
import type { Timestamp } from 'firebase/firestore';

