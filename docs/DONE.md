
# AI Trivia Master - Implemented Features & Progress

This document outlines the key features and improvements implemented in the AI Trivia Master application.

## Core Gameplay & AI

*   **AI-Powered Question Generation**:
    *   Utilizes Genkit and Google AI (Gemini model) to dynamically generate trivia questions, four multiple-choice answers, and an explanation for the correct answer.
    *   Handles user-provided custom topics for on-the-fly question generation.
*   **Bilingual Content Generation**:
    *   AI generates all textual content (questions, answers, explanations, hints) simultaneously in both English and Spanish within a single API call.
*   **Controlled Difficulty Levels**:
    *   The application requests questions of a specific difficulty level from the AI ("very easy", "easy", "medium", "hard", "very hard").
    *   AI is guided by detailed definitions for each difficulty level (e.g., "very easy" = primary school, "hard" = university level).
    *   The application implements adaptive difficulty: the difficulty of the next question is adjusted based on whether the user answered the previous question correctly or incorrectly.
*   **Hints**:
    *   The AI generates a concise, bilingual hint for each question.
    *   A "Show Hint" button is available in the UI.
*   **Time Limit**:
    *   Players have a configurable time limit (30 seconds) to answer each question.
    *   A progress bar and countdown timer are displayed.
    *   If time runs out, the answer is considered incorrect.

## Categories & Content Management

*   **Dynamic Categories from Firestore**:
    *   Predefined categories are managed in a Firestore collection (`triviaCategories`).
    *   Each category document includes:
        *   Bilingual names (`name.en`, `name.es`).
        *   Lucide icon name (`icon`).
        *   A `topicValue` for AI interaction.
        *   Detailed bilingual prompt instructions (`detailedPromptInstructions`) to guide AI question generation for that category.
        *   Optional bilingual difficulty-specific guidelines (`difficultySpecificGuidelines`) for even finer control.
    *   The application fetches and displays these categories dynamically.
*   **Category Seeding Script (`scripts/populate-firestore-categories.ts`)**:
    *   Populates the `triviaCategories` collection in Firestore from a local JSON file (`src/data/initial-categories.json`).
    *   Allows for easy management and versioning of initial category definitions.

## Predefined Questions & Offline Capabilities Potential

*   **Firestore for Predefined Questions**:
    *   A collection in Firestore (`predefinedTriviaQuestions`) stores pre-generated bilingual trivia questions.
    *   This reduces reliance on real-time AI generation for common categories, improving speed and reducing API costs.
*   **Batch Population Script (`scripts/populate-firestore-questions.ts`)**:
    *   Generates and stores a target number of questions for each predefined category and for each difficulty level, using the detailed category instructions from Firestore.
    *   Includes logic to avoid conceptual duplication by passing existing content as context to the AI.
    *   Respects API rate limits with configurable delays.
*   **Client-Side Fetching Strategy**:
    *   The application first attempts to fetch questions from the Firestore cache for predefined categories and the current target difficulty.
    *   If no suitable pre-generated question is found, it falls back to dynamic AI generation using Genkit, providing the AI with detailed category and difficulty instructions.

## User Interface & Experience

*   **Category Selection**:
    *   Users can choose from a list of predefined categories (fetched from Firestore) with associated icons.
    *   Users can input a custom topic.
*   **Question Display**:
    *   Multiple-choice format with clear presentation of question and answers.
    *   Visual feedback for correct/incorrect answers, including explanations.
*   **Score Tracking**:
    *   Displays the number of correct and incorrect answers during the game.
*   **Internationalization (i18n)**:
    *   Full UI and AI-generated content support for English and Spanish.
    *   Language switcher component allows users to change language, with preference persisted in a cookie.
    *   Uses `next-intl` for localization.
*   **Responsive Design**:
    *   Interface adapts to various screen sizes.
*   **PWA (Progressive Web App)**:
    *   Configured with `@ducanh2912/next-pwa` for improved caching, offline capabilities (for app shell), and "add to home screen" functionality.
*   **Visual Difficulty Indicator**:
    *   Displays the current adaptive difficulty level to the user.

## Technical Stack & Setup

*   **Framework**: Next.js 15+ (App Router)
*   **AI Integration**: Genkit (Google AI - Gemini model)
*   **UI Components**: ShadCN UI
*   **Styling**: Tailwind CSS
*   **Language**: TypeScript
*   **Database**: Firebase Firestore (for predefined questions and category definitions)
*   **Deployment**: Configured for Firebase App Hosting (`apphosting.yaml`).

## Development & Workflow

*   **Component-Based Architecture**: Reusable React components.
*   **Type Safety**: TypeScript used throughout, including for Genkit flows and Firestore data structures.
*   **Environment Variables**: Configuration for Firebase and Google API keys.
*   **Modular Genkit Flows**: AI logic encapsulated in `src/ai/flows/`.
*   **Client-Side State Management**: React hooks for game state and UI.
*   **Data Seeding Scripts**: For populating categories and questions in Firestore.

This list represents the major advancements made. The application provides a robust and engaging trivia experience with a strong foundation for future enhancements.

    