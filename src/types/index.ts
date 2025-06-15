
// src/types/index.ts

export type DifficultyLevel = "very easy" | "easy" | "medium" | "hard" | "very hard";

export interface BilingualText {
  en: string;
  es: string;
}

export interface CategoryDifficultyGuideline extends BilingualText {}

export interface CategoryDefinition {
  id: string; // Firestore document ID, can be the same as topicValue for simplicity
  topicValue: string; // e.g., "Science", "World_History"
  name: BilingualText; // e.g., { en: "Science", es: "Ciencia" }
  icon: string; // Lucide icon name, e.g., "Lightbulb"
  detailedPromptInstructions: BilingualText; // Detailed general instructions for this category
  difficultySpecificGuidelines?: { // Optional: more specific instructions per difficulty
    "very easy"?: CategoryDifficultyGuideline;
    "easy"?: CategoryDifficultyGuideline;
    "medium"?: CategoryDifficultyGuideline;
    "hard"?: CategoryDifficultyGuideline;
    "very hard"?: CategoryDifficultyGuideline;
  };
}
