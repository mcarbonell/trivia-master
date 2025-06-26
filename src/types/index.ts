// src/types/index.ts
import { z } from 'zod';
import type { AppLocale } from '@/lib/i18n-config';

// Zod Schemas
export const DifficultyLevelSchema = z.enum([
  "easy",
  "medium",
  "hard"
]).describe("The assessed or targeted difficulty level of the question.");

export const BilingualTextSchema = z.object({
  en: z.string().describe('English version of the text.'),
  es: z.string().describe('Spanish version of the text.'),
});

export const BilingualAnswerSchema = z.object({
  en: z.string().describe('English version of the answer.'),
  es: z.string().describe('Spanish version of the answer.'),
});

export const GenerateTriviaQuestionOutputSchema = z.object({
  question: BilingualTextSchema.describe('The trivia question in English and Spanish.'),
  correctAnswer: BilingualAnswerSchema.describe('The single correct answer to the question, in English and Spanish.'),
  distractors: z.array(BilingualAnswerSchema).length(3).describe('Three plausible but incorrect answers (distractors), each in English and Spanish.'),
  explanation: BilingualTextSchema.describe('A brief explanation (1-2 sentences) of why the correct answer is correct, in English and Spanish.'),
  hint: BilingualTextSchema.describe('A concise hint (1 short sentence) to help the user deduce the answer without revealing it directly, in English and Spanish.'),
  difficulty: DifficultyLevelSchema,
  imagePrompt: z.string().optional().describe('A detailed, English-only prompt for a text-to-image model to generate a relevant image.'),
  imageUrl: z.string().optional().describe('The URL of the generated image. Should be left empty by this flow.'),
});


// TypeScript Types
export type DifficultyLevel = z.infer<typeof DifficultyLevelSchema>;
export type BilingualText = z.infer<typeof BilingualTextSchema>;
export type GenerateTriviaQuestionOutput = z.infer<typeof GenerateTriviaQuestionOutputSchema>;

export type CategoryDifficultyGuideline = string;

export interface CategoryDefinition {
  id: string; 
  topicValue: string; 
  name: BilingualText; 
  icon: string; 
  detailedPromptInstructions: string; 
  parentTopicValue?: string; 
  isVisual?: boolean;
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
