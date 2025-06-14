
# AI Trivia Master - Implemented Features & Progress

This document outlines the key features and improvements implemented in the AI Trivia Master application.

## Core Gameplay & AI

*   **AI-Powered Question Generation**:
    *   Utilizes Genkit and Google AI (Gemini 2.5 Flash) to dynamically generate trivia questions, four multiple-choice answers, and an explanation for the correct answer.
    *   Handles user-provided custom topics for on-the-fly question generation.
*   **Bilingual Content Generation**:
    *   AI generates all textual content (questions, answers, explanations, hints) simultaneously in both English and Spanish within a single API call.
*   **Difficulty Levels**:
    *   Questions are assigned a difficulty level by the AI ("very easy", "easy", "medium", "hard", "very hard") based on defined guidelines.
    *   The application implements adaptive difficulty: the difficulty of the next question requested from the AI or Firestore is adjusted based on whether the user answered the previous question correctly or incorrectly.
*   **Hints**:
    *   The AI generates a concise, bilingual hint for each question to assist players.
    *   A "Show Hint" button is available in the UI during gameplay.
*   **Time Limit**:
    *   Players have a configurable time limit (e.g., 30 seconds) to answer each question.
    *   A progress bar and countdown timer are displayed.
    *   If time runs out, the answer is considered incorrect.

## Predefined Questions & Offline Capabilities

*   **Firestore for Predefined Questions**:
    *   A collection in Firestore (`predefinedTriviaQuestions`) stores pre-generated bilingual trivia questions.
    *   This reduces reliance on real-time AI generation for common categories, improving speed and reducing API costs.
*   **Batch Population Script (`scripts/populate-firestore-questions.ts`)**:
    *   Generates and stores a target number of questions for each predefined category and for each difficulty level.
    *   Includes logic to avoid conceptual duplication of questions and answers by passing existing content as context to the AI.
    *   Respects API rate limits with configurable delays.
*   **Client-Side Fetching Strategy**:
    *   The application first attempts to fetch questions from the Firestore cache for predefined categories and the current target difficulty.
    *   If no suitable pre-generated question is found, it falls back to dynamic AI generation using Genkit.

## User Interface & Experience

*   **Category Selection**:
    *   Users can choose from a list of predefined categories (Science, History, Sports, Movies, Geography, Music) with associated icons.
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
*   **AI Integration**: Genkit
*   **UI Components**: ShadCN UI
*   **Styling**: Tailwind CSS
*   **Language**: TypeScript
*   **Database**: Firebase Firestore (for pre-generated questions)
*   **Deployment**: Configured for Firebase App Hosting (`apphosting.yaml`).

## Development & Workflow

*   **Component-Based Architecture**: Reusable React components for different parts of the game.
*   **Type Safety**: TypeScript used throughout the project, including for Genkit flow inputs/outputs.
*   **Environment Variables**: Configuration for Firebase and Google API keys.
*   **Modular Genkit Flows**: AI logic encapsulated in `src/ai/flows/`.
*   **Client-Side State Management**: React hooks (`useState`, `useEffect`, `useCallback`, `useRef`) for managing game state and UI logic.

This list represents the major advancements made. The application provides a robust and engaging trivia experience with a strong foundation for future enhancements.
