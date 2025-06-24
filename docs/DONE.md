# AI Trivia Master - Implemented Features & Progress

This document outlines the key features and improvements implemented in the AI Trivia Master application.

## Core Gameplay & AI

*   **AI-Powered Question Generation**:
    *   Utilizes Genkit and Google AI (Gemini model) to dynamically generate trivia questions, a correct answer, three incorrect distractors, and an explanation.
    *   Handles user-provided custom topics for on-the-fly question generation.
*   **Bilingual Content Generation**:
    *   AI generates all textual content (questions, answers, explanations, hints) simultaneously in both English and Spanish within a single API call.
*   **Controlled Difficulty Levels**:
    *   The application requests questions of a specific difficulty level from the AI ("easy", "medium", "hard").
    *   AI is guided by detailed definitions for each difficulty level (e.g., "easy" = primary/secondary school, "hard" = university level).
    *   The application implements adaptive difficulty: the difficulty of the next question is adjusted based on whether the user answered the previous question correctly or incorrectly.
*   **Hints**:
    *   The AI generates a concise, bilingual hint for each question.
    *   A "Show Hint" button is available in the UI.
*   **Time Limit**:
    *   Players have a configurable time limit (30 seconds) to answer each question.
    *   A progress bar and countdown timer are displayed.
    *   If time runs out, the answer is considered incorrect.
*   **Fixed Game Length**:
    *   Implemented a fixed number of questions per game session (currently 10 questions).
    *   Includes a "Game Over" screen displaying the final score and offering options to play again (same topic/difficulty) or start a completely new game.

## Data Model & Question Integrity

*   **Robust Data Model Refactoring**:
    *   The core data structure for questions has been significantly improved.
    *   **Old model**: An array of 4 answers (`answers`) and a pointer to the correct one (`correctAnswerIndex`).
    *   **New model**: A dedicated `correctAnswer` object and an array of three incorrect `distractors`.
    *   **Benefits**: This eliminates positional bias in the AI-generated data, simplifies the cognitive load for the AI (improving generation quality), and makes the data structure more semantic and robust.
*   **Data Migration**:
    *   A dedicated script (`migrate:questions`) was created and run to successfully migrate the entire Firestore database of tens of thousands of questions to the new data model without data loss.

## Categories & Content Management

*   **Dynamic Categories from Firestore**:
    *   Predefined categories are managed in a Firestore collection (`triviaCategories`).
    *   Each category document includes:
        *   Bilingual names (`name.en`, `name.es`).
        *   Lucide icon name (`icon`).
        *   A `topicValue` for AI interaction.
        *   Detailed prompt instructions (`detailedPromptInstructions`) to guide AI question generation for that category.
        *   Optional difficulty-specific guidelines (`difficultySpecificGuidelines`) for even finer control.
    *   The application fetches and displays these categories dynamically.
*   **Category Seeding Script (`scripts/populate-firestore-categories.ts`)**:
    *   Populates the `triviaCategories` collection in Firestore from a local JSON file (`src/data/initial-categories.json`).
    *   Allows for easy management and versioning of initial category definitions.

## Predefined Questions & Offline Capabilities Potential

*   **Firestore for Predefined Questions**:
    *   A collection in Firestore (`predefinedTriviaQuestions`) stores pre-generated bilingual trivia questions.
    *   This reduces reliance on real-time AI generation for common categories, improving speed and reducing API costs.
*   **Batch Population Script (`scripts/populate-firestore-questions.ts`)**:
    *   Generates and stores a target number of questions for each predefined category and for each difficulty level, using the detailed category instructions from Firestore and the new data model.
    *   Includes logic to avoid conceptual duplication by passing existing content as context to the AI.
    *   Respects API rate limits with configurable delays.
    *   Validates each question individually from AI batch responses, discarding malformed ones while keeping valid ones.
*   **Client-Side Fetching Strategy**:
    *   The application first attempts to fetch questions from the Firestore cache for predefined categories and the current target difficulty.
    *   If no suitable pre-generated question is found, it falls back to dynamic AI generation using Genkit, providing the AI with detailed category and difficulty instructions.

## User Interface & Experience

*   **Client-Side Answer Shuffling**:
    *   To ensure fairness and prevent users from memorizing answer positions, the application now shuffles the correct answer and distractors on the client-side before displaying them. This completely mitigates any potential positional bias from the AI.
*   **Category Selection**:
    *   Users can choose from a list of predefined categories (fetched from Firestore) with associated icons.
    *   Users can input a custom topic.
*   **Question Display**:
    *   Multiple-choice format with clear presentation of question and answers.
    *   Visual feedback for correct/incorrect answers, including explanations.
*   **Score Tracking**:
    *   Displays the number of correct and incorrect answers during the game.
*   **Game Progress Display**:
    *   The UI now shows the current question number out of the total for the game (e.g., "Question 1 of 10").
*   **Internationalization (i18n)**:
    *   Full UI and AI-generated content support for English and Spanish.
    *   Language switcher component allows users to change language, with preference persisted in a cookie.
    *   Uses `next-intl` for localization.
*   **Responsive Design**:
    *   Interface adapts to various screen sizes.
*   **PWA (Progressive Web App)**:
    *   Configured with `@ducanh2912/next-pwa` for improved caching, offline capabilities (for app shell), and "add to home screen" functionality. PWA is now enabled in development mode to improve stability.
*   **Visual Difficulty Indicator**:
    *   Displays the current adaptive difficulty level to the user.
*   **Question Reporting**:
    *   Users can report questions directly from the game interface (during or after answering).
    *   A dialog allows users to select a reason for the report and provide optional details.
    *   Reports are submitted to Firestore for admin review.
*   **"About / Contact" Page**:
    *   Added an `/about` page with project information.
    *   Includes a contact form for users to submit general suggestions or feedback, which are stored in Firestore.

## Analytics & Feedback

*   **Firebase Analytics Integration**:
    *   Tracks key user interactions within the game.
    *   **`select_category`**: Logged when a user chooses a category (predefined or custom). Includes category name, topic value, and if it's custom.
    *   **`start_game_with_difficulty`**: Logged when a user selects a difficulty mode and starts the game. Includes category, selected difficulty mode, and initial difficulty level.
    *   **`answer_question`**: Logged for each question answered or timed out. Includes category, question difficulty, correctness, and if it was timed out.
    *   **`use_hint`**: Logged when a user reveals a hint for a question. Includes category and question difficulty.
    *   **`game_over`**: Logged when a game session (e.g., 10 questions) concludes. Includes category, final score, and difficulty mode.
*   **User Feedback System**:
    *   Question reporting functionality allows users to provide direct feedback on question quality.
    *   A dedicated "About/Contact" page with a form for general suggestions and feedback, stored in Firestore.

## Admin Panel & Management

*   **Firebase Authentication**:
    *   Secure admin area (`/admin/*`) accessible via email/password login.
    *   Authentication state managed via `AuthContext`.
*   **Admin Layout**:
    *   Consistent layout for all admin pages with navigation sidebar.
    *   Logout functionality.
    *   Bilingual UI support for the admin panel.
*   **Admin Dashboard (`/admin/dashboard`)**:
    *   Landing page for the admin section with quick links to management areas.
*   **Category Management (`/admin/categories`)**:
    *   **CRUD Operations**:
        *   **Create**: Add new categories with bilingual names, icon, topic value, detailed AI prompt instructions, and optional difficulty-specific guidelines.
        *   **Read**: View all categories in a paginated table.
        *   **Update**: Edit existing category details (except topic value).
        *   **Delete**: Remove categories with confirmation.
    *   **Question Counts**: Displays the number of predefined questions available for each difficulty level (easy, medium, hard) per category.
*   **Predefined Question Management (`/admin/questions`)**:
    *   **Updated for New Data Model**: The editor now has distinct fields for "Correct Answer" and three "Distractors", making manual editing more intuitive and aligned with the new data model.
    *   **List Questions**: View all predefined questions in a paginated table.
    *   **Filter**: Filter questions by category and/or difficulty.
    *   **Search**: Search questions by ID, question text, or answer text.
    *   **Delete**: Remove specific predefined questions with confirmation.
    *   **Update**: Edit the content of existing predefined questions.
    *   Table displays question text (truncated with tooltip for full view), category name, difficulty, and correct answer.
*   **Report Management (`/admin/reports`)**:
    *   **View Reports**: Lists all user-submitted question reports, sortable and filterable by status.
    *   **Report Details**: Shows reported question text (bilingual), category, difficulty, reason for report, user details, and date.
    *   **Status Update**: Admins can change the status of a report (e.g., 'New', 'Reviewed', 'Resolved', 'Ignored').
    *   **Actions on Reports**:
        *   Copy Question ID: Allows quick copying of the reported question's Firestore ID (if applicable).
        *   Delete Report: Removes the report ticket.
        *   Delete Reported Question: If the report links to a predefined question ID, allows direct deletion of that question from the game (with confirmation).
*   **Suggestion Management (`/admin/suggestions`)**:
    *   New admin section to view and delete user-submitted suggestions from the "About/Contact" page.
    *   Suggestions are displayed in a paginated table with details like date, sender information (if provided), message content, and the locale of submission.

## Technical Stack & Setup

*   **Framework**: Next.js 15+ (App Router)
*   **AI Integration**: Genkit (Google AI - Gemini model)
*   **UI Components**: ShadCN UI
*   **Styling**: Tailwind CSS
*   **Language**: TypeScript
*   **Database**: Firebase Firestore (for predefined questions, category definitions, user reports, and user suggestions)
*   **Authentication**: Firebase Authentication
*   **Analytics**: Firebase Analytics
*   **Deployment**: Configured for Firebase App Hosting (`apphosting.yaml`).

## Development & Workflow

*   **Component-Based Architecture**: Reusable React components.
*   **Type Safety**: TypeScript used throughout, including for Genkit flows and Firestore data structures.
*   **Environment Variables**: Configuration for Firebase and Google API keys.
*   **Modular Genkit Flows**: AI logic encapsulated in `src/ai/flows/`.
*   **Client-Side State Management**: React hooks for game state and UI.
*   **Data Seeding Scripts**: For populating categories and questions in Firestore.
*   **Service Layer**: Dedicated service files (`categoryService.ts`, `triviaService.ts`, `reportService.ts`, `suggestionService.ts`) for Firestore interactions.
*   **Robust Batch Question Generation**:
    *   The `populate-firestore-questions.ts` script was enhanced to handle cases where the Genkit AI model returns a partially valid batch of questions. The script now attempts to parse and save individually valid questions even if the overall batch response has schema issues, significantly improving the yield of pre-generated questions.
    *   Resolved issue with default model usage in `populate-firestore-questions.ts`.
*   **Flexible Category Population Script**:
    *   The `scripts/populate-firestore-categories.ts` script now accepts a `--source` argument, allowing dynamic selection of different category JSON files for import (e.g., `initial-categories.json`, `sports-categories.json`).
*   **Expanded Category Data Files**:
    *   Created new JSON data files for diverse trivia categories: `more-categories.json`, `education-categories.json`, `country-categories.json`, and `sports-categories.json` to facilitate broader content population.

This list represents the major advancements made. The application provides a robust and engaging trivia experience with a strong foundation for future enhancements.
