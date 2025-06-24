// src/types/index.ts

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
  parentTopicValue?: string; 
  difficultySpecificGuidelines?: { 
    "easy"?: CategoryDifficultyGuideline;
    "medium"?: CategoryDifficultyGuideline;
    "hard"?: CategoryDifficultyGuideline;
  };
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
  submittedAt: string; 
  locale: AppLocale;
}

export interface UserData {
  uid: string;
  email: string;
  role: 'user' | 'admin';
  createdAt: string; 
}

export interface GameSession {
  id: string;
  userId: string;
  completedAt: string; // ISO string
  categoryTopicValue: string;
  categoryName: BilingualText;
  difficultyMode: DifficultyMode;
  finalScoreCorrect: number;
  finalScoreIncorrect: number;
  totalQuestions: number;
  isCustomTopic: boolean;
}
