// src/types/index.ts

export type DifficultyLevel = "very easy" | "easy" | "medium" | "hard" | "very hard";

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
    "very easy"?: CategoryDifficultyGuideline;
    "easy"?: CategoryDifficultyGuideline;
    "medium"?: CategoryDifficultyGuideline;
    "hard"?: CategoryDifficultyGuideline;
    "very hard"?: CategoryDifficultyGuideline;
  };
}
