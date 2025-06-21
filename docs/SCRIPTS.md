# Command-Line Scripts for AI Trivia Master

This document provides a reference for the command-line interface (CLI) scripts used to manage and populate content for the AI Trivia Master application.

**Prerequisites:**
- Ensure all dependencies are installed (`npm install`).
- For scripts interacting with Genkit/AI, the Genkit development server should be running in a separate terminal: `npm run genkit:watch`.
- Ensure your environment variables are correctly set up in a `.env` or `.env.local` file, particularly `GOOGLE_APPLICATION_CREDENTIALS` for server-side Firebase Admin access.

---

## Content Import Scripts

These scripts are used to import content from local JSON files into Firestore.

### 1. Import Categories (`import:categories`)

- **Purpose:** Imports or updates trivia categories from a specified JSON file into the `triviaCategories` collection in Firestore.
- **Command:** `npm run import:categories -- --source <filename_prefix>`
- **Arguments:**
    - `--source <prefix>` (or `-s <prefix>`): **Required**. The prefix of the JSON file located in `src/data/`. For example, a source of `initial` will use the file `src/data/initial-categories.json`.
- **Usage Example:**
  ```bash
  # Import categories from src/data/sports-categories.json
  npm run import:categories -- --source sports
  ```
- **Notes:**
    - The document ID in Firestore will be the `topicValue` from the JSON.
    - If a category with the same `topicValue` already exists, it will be updated (`{ merge: true }`).

### 2. Import Questions (`import:questions`)

- **Purpose:** Imports or updates predefined trivia questions from a specified JSON file into the `predefinedTriviaQuestions` collection in Firestore.
- **Command:** `npm run import:questions -- --source <filename_prefix>`
- **Arguments:**
    - `--source <prefix>` (or `-s <prefix>`): **Required**. The prefix of the JSON file located in `src/data/`. For example, a source of `history-set1` will use `src/data/history-set1-questions.json`.
- **Usage Example:**
  ```bash
  # Import questions from src/data/science-questions.json
  npm run import:questions -- --source science
  ```
- **Notes:**
    - The JSON file must be an array of question objects. Each object must have a unique `id` which will be used as the document ID in Firestore.
    - If a question with the same `id` already exists, it will be updated (`{ merge: true }`), which is useful for correcting questions exported from the admin panel.

---

## Content Generation & Validation Scripts (AI-Powered)

These scripts leverage Genkit and AI models to generate or validate content. Remember to run `npm run genkit:watch` first.

### 3. Populate Questions (`populate:questions`)

- **Purpose:** Uses AI to generate a batch of new, unique trivia questions for specified categories and difficulties and saves them to Firestore.
- **Command:** `npm run populate:questions -- [options]`
- **Arguments:**
    - `-c, --category <topicValue>`: Optional. Process only the category with this specific `topicValue`. If omitted, all predefined categories are processed.
    - `-d, --difficulty <level>`: Optional. Process only this specific difficulty (`easy`, `medium`, `hard`). If omitted, all three difficulties are processed.
    - `-t, --targetPerDifficulty <number>`: Optional. The target total number of questions for each category/difficulty combo. Default: `200`.
    - `-m, --maxNewPerRun <number>`: Optional. Maximum new questions to fetch per combo in a single script run. Default: `25`.
    - `-b, --batchSize <number>`: Optional. Number of questions to request in each single API call to the AI. Default: `25`.
    - `--noContext`: Optional. If passed, the script will not send existing questions as context to the AI, which can speed up requests but may increase the chance of duplicates.
    - `--model <model_name>`: Optional. Specify the Genkit model name to use for generation (e.g., `googleai/gemini-1.5-flash`). Defaults to the one specified in the script.
    - `--updateExistingSources`: Optional. A utility flag. If passed, the script will not generate new questions. Instead, it will iterate through all existing questions and update their `source` field to reflect the currently configured model. Useful after changing the default model in the script.
- **Usage Examples:**
  ```bash
  # Populate up to 25 'hard' questions for the 'Science' category
  npm run populate:questions -- -c Science -d hard -m 25

  # Populate questions for all categories and difficulties up to their targets
  npm run populate:questions
  ```

### 4. Check for Duplicate Questions (`check:questions`)

- **Purpose:** Uses AI to analyze all questions within a category (and optionally a specific difficulty) to find conceptual duplicates, even if they are worded differently. It then gives an interactive prompt to delete the identified duplicates.
- **Command:** `npm run check:questions -- --topicValue <topicValue> [options]`
- **Arguments:**
    - `-t, --topicValue <topicValue>`: **Required**. The `topicValue` of the category to check.
    - `-d, --difficulty <level>`: Optional. Check only a specific difficulty (`easy`, `medium`, `hard`). If omitted, all difficulties for the topic are checked together.
    - `-m, --model <model_name>`: Optional. Specify the Genkit model to use for detection (e.g., `googleai/gemini-1.5-flash`).
- **Usage Example:**
  ```bash
  # Check for all duplicates within the 'History' category
  npm run check:questions -- --topicValue="History"
  ```
- **Interaction:** The script will list the duplicate pairs found by the AI and then ask for confirmation (`Y/n`) before deleting the questions marked as duplicates.

### 5. Validate a Single Question (`validate:question`)

- **Purpose:** Uses AI to perform a detailed quality check on a single question from Firestore. The AI can accept it, reject it (and recommend deletion), or propose a fix.
- **Command:** `npm run validate:question -- --id <firestore_id> [options]`
- **Arguments:**
    - `-i, --id <firestore_id>`: **Required**. The Firestore document ID of the question you want to validate.
    - `-m, --model <model_name>`: Optional. Specify the Genkit model to use for validation (e.g., `googleai/gemini-1.5-pro`).
- **Usage Example:**
  ```bash
  # Validate a question with a specific ID
  npm run validate:question -- --id="9vMnFraiklXm3KSZZoQN"
  ```
- **Interaction:**
    - If the AI suggests a fix, it will display the original and the fixed version and ask for confirmation to apply the update.
    - If the AI recommends rejection, it will ask for confirmation to delete the question.
    - If the AI accepts the question, it will simply report that no action is needed.
