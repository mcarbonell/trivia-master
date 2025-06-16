// src/types/index.ts
import type { FieldValue } from 'firebase/firestore';
import type { AppLocale } from '@/lib/i18n-config';

export type DifficultyLevel = "easy" | "medium" | "hard";

export interface BilingualText {
  en: string;
  es: string;
}

// CategoryDifficultyGuideline will now be a simple string (English instruction)
export type CategoryDifficultyGuideline = string;

export interface CategoryDefinition {
  id: string; // Firestore document ID, can be the same as topicValue for simplicity
  topicValue: string; // e.g., "Science", "World_History"
  name: BilingualText; // e.g., { en: "Science", es: "Ciencia" } - Name remains bilingual for UI
  icon: string; // Lucide icon name, e.g., "Lightbulb"
  detailedPromptInstructions: string; // English-only detailed general instructions for this category
  difficultySpecificGuidelines?: { // Optional: more specific English-only instructions per difficulty
    "easy"?: CategoryDifficultyGuideline;
    "medium"?: CategoryDifficultyGuideline;
    "hard"?: CategoryDifficultyGuideline;
  };
  /** Controls if this category appears in the main selection screen of the app.
   *  Users can still access categories with isPredefined:false if they know the topicValue (e.g. via direct link or if it was pre-selected).
   *  The question population script will attempt to generate questions for ALL categories
   *  in Firestore, regardless of this flag. */
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

export interface ReportData {
  id?: string; // Firestore document ID, will be auto-generated
  questionId?: string; // ID of the predefined question from 'predefinedTriviaQuestions' collection, if available
  questionTextEn: string;
  questionTextEs: string;
  categoryTopicValue: string;
  difficulty: DifficultyLevel;
  reason: ReportReason;
  details?: string;
  reportedAt: FieldValue; // ServerTimestamp
  locale: AppLocale; // Language user was using when reporting
  status?: 'new' | 'reviewed' | 'resolved' | 'ignored'; // For admin panel processing later
}
