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
  imagePrompt: z.string().optional().describe('For AI-generated images: A detailed, English-only prompt for a text-to-image model.'),
  searchTerm: z.string().optional().describe("A concise and effective search query in English to find a real image of the subject (e.g., 'Mona Lisa Leonardo da Vinci', 'Eiffel Tower at night')."),
  imageUrl: z.string().url().optional().describe('The URL of the final image.'),
});

// Wikimedia Image Search Schemas
export const FindWikimediaImagesInputSchema = z.object({
  searchTerm: z.string().describe("The term to search for on Wikimedia Commons."),
});
export const WikimediaImageCandidateSchema = z.object({
  pageUrl: z.string().url().describe("The URL to the Wikimedia Commons file page."),
  thumbnailUrl: z.string().url().describe("The URL for a thumbnail version of the image."),
  fullUrl: z.string().url().describe("The URL for the full-sized version of the image."),
  license: z.string().describe("The short name of the license (e.g., 'Public domain', 'CC BY-SA 4.0')."),
  title: z.string().describe("The title of the file on Wikimedia."),
});
export const FindWikimediaImagesOutputSchema = z.array(WikimediaImageCandidateSchema);

// Process Wikimedia Image Schemas
export const ProcessWikimediaImageInputSchema = z.object({
  imageUrl: z.string().url().describe("The URL of the image to process from Wikimedia Commons."),
  questionId: z.string().describe("The Firestore ID of the question to update."),
});
export const ProcessWikimediaImageOutputSchema = z.object({
  publicUrl: z.string().url().describe("The final public URL of the image in Firebase Storage."),
});

// Process AI-Generated Image Schemas
export const GenerateAndStoreImageInputSchema = z.object({
  prompt: z.string().describe("The text prompt to generate an image from."),
  questionId: z.string().describe("The Firestore ID of the question to update."),
  model: z.string().optional().describe("The specific image generation model to use."),
  addWatermark: z.boolean().optional().describe("Whether to add a watermark to the image."),
});
export type GenerateAndStoreImageInput = z.infer<typeof GenerateAndStoreImageInputSchema>;

export const GenerateAndStoreImageOutputSchema = z.object({
  publicUrl: z.string().url().describe("The final public URL of the image in Firebase Storage."),
});
export type GenerateAndStoreImageOutput = z.infer<typeof GenerateAndStoreImageOutputSchema>;

// Process Manual Upload Schemas
export const UploadAndStoreImageInputSchema = z.object({
  questionId: z.string().describe("The Firestore ID of the question to update."),
  imageDataUri: z.string().describe("The image file encoded as a Base64 data URI."),
  addWatermark: z.boolean().optional().describe("Whether to add a watermark to the image."),
});
export type UploadAndStoreImageInput = z.infer<typeof UploadAndStoreImageInputSchema>;

export const UploadAndStoreImageOutputSchema = z.object({
  publicUrl: z.string().url().describe("The final public URL of the image in Firebase Storage."),
});
export type UploadAndStoreImageOutput = z.infer<typeof UploadAndStoreImageOutputSchema>;


// --- Schemas for AI-driven Question Validation ---
export const QuestionDataSchema = GenerateTriviaQuestionOutputSchema.extend({
  id: z.string().describe("The Firestore ID of the question being validated."),
  topicValue: z.string().describe("The topic value associated with the question."),
  status: z.string().optional().describe("Validation status of the question, if any (e.g., 'accepted', 'fixed')."),
  source: z.string().optional().describe("Source information for the question, if available."),
  createdAt: z.string().optional().describe("Creation timestamp, if available.")
});
export const ValidateSingleQuestionInputSchema = z.object({
  questionData: QuestionDataSchema.describe('The full data of the trivia question to validate.'),
  modelName: z.string().optional().describe('Optional Genkit model name to use for validation (e.g., googleai/gemini-1.5-flash).')
});
export const ValidateSingleQuestionOutputSchema = z.object({
  validationStatus: z.enum(["Accept", "Reject", "Fix"])
    .describe('Status of the validation: "Accept" if correct, "Reject" if unfixable, "Fix" if correctable.'),
  reasoning: z.string().describe('AI\'s reasoning for the validation status. If "Fix", should explain what was fixed.'),
  fixedQuestionData: GenerateTriviaQuestionOutputSchema.optional()
    .describe('The corrected question data if validationStatus is "Fix". This must include all necessary fields like question, correctAnswer, distractors, explanation, difficulty, and imagePrompt if applicable.'),
});


// TypeScript Types
export type DifficultyLevel = z.infer<typeof DifficultyLevelSchema>;
export type BilingualText = z.infer<typeof BilingualTextSchema>;
export type GenerateTriviaQuestionOutput = z.infer<typeof GenerateTriviaQuestionOutputSchema>;

export type FindWikimediaImagesInput = z.infer<typeof FindWikimediaImagesInputSchema>;
export type WikimediaImageCandidate = z.infer<typeof WikimediaImageCandidateSchema>;
export type FindWikimediaImagesOutput = z.infer<typeof FindWikimediaImagesOutputSchema>;

export type ProcessWikimediaImageInput = z.infer<typeof ProcessWikimediaImageInputSchema>;
export type ProcessWikimediaImageOutput = z.infer<typeof ProcessWikimediaImageOutputSchema>;

export type QuestionData = z.infer<typeof QuestionDataSchema>;
export type ValidateSingleQuestionInput = z.infer<typeof ValidateSingleQuestionInputSchema>;
export type ValidateSingleQuestionOutput = z.infer<typeof ValidateSingleQuestionOutputSchema>;

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

export interface ScriptSettings {
  populateQuestions: {
    targetPerDifficulty: number;
    maxNewPerRun: number;
    batchSize: number;
    defaultModel: string;
  };
  populateImages: {
    limit: number;
    delay: number;
    defaultImageModel: string;
  };
  checkDuplicates: {
    defaultModel: string;
  };
  validateQuestions: {
    defaultModel: string;
  };
}

export interface AvailableModels {
  textModels: string[];
  imageModels: string[];
}
