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
    - `--source <prefix>` (or `-s <prefix>`): **Required**. The prefix of the JSON file located in `src/data/`. For example, a source of `initial` will use the file `src/data/initial-categories.json`. A source of `visual` will use `src/data/visual-categories.json`.
- **Usage Example:**
  ```bash
  # Import categories from src/data/visual-categories.json
  npm run import:categories -- --source visual
  ```
- **Notes:**
    - The document ID in Firestore will be the `topicValue` from the JSON.
    - If a category with the same `topicValue` already exists, it will be updated (`{ merge: true }`).

### 2. Import Questions (`import:questions`)

- **Purpose:** Imports or updates predefined trivia questions from a specified JSON file into the `predefinedTriviaQuestions` collection in Firestore. This is useful for bulk-editing questions, such as adding `imageUrl`s.
- **Command:** `npm run import:questions -- --source <filename_prefix>`
- **Arguments:**
    - `--source <prefix>` (or `-s <prefix>`): **Required**. The prefix of the JSON file located in `src/data/`. For example, a source of `history-set1` will use `src/data/history-set1-questions.json`.
- **Usage Example:**
  ```bash
  # Import questions from a file you edited, e.g., src/data/famous-paintings-with-urls-questions.json
  npm run import:questions -- --source famous-paintings-with-urls
  ```
- **Notes:**
    - The JSON file must be an array of question objects. Each object must have a unique `id` which will be used as the document ID in Firestore.
    - If a question with the same `id` already exists, its data will be updated/merged with the content from the file.

---

## Content Generation & Validation Scripts (AI-Powered)

These scripts leverage Genkit and AI models to generate or validate content. Remember to run `npm run genkit:watch` first.

### 3. Populate Questions (`populate:questions`)

- **Purpose:** Uses AI to generate a batch of new, unique trivia questions for specified categories and difficulties and saves them to Firestore. Now generates using the new data model (`correctAnswer`, `distractors`).
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

### 4. Populate Images (`populate:images`)

- **Purpose:** Finds questions that need an image and populates their `imageUrl` field. It has two modes of operation depending on the question's data:
    1.  **AI Generation:** If a question has an `imagePrompt` field, it calls an AI model to generate an image from that prompt.
    2.  **Wikimedia Fetch:** If a question has `artworkTitle` and `artworkAuthor` fields, it searches Wikimedia Commons for a suitable, permissively licensed image.
- **Behavior:**
    - The script uploads the final image (either AI-generated or fetched) to Firebase Storage and saves the public URL to the question document.
    - By default, it only processes questions that do not already have an `imageUrl`.
- **Command:** `npm run populate:images -- [options]`
- **Arguments:**
    - `-c, --category <topicValue>`: Optional. Process only the category with this specific `topicValue`. If omitted, processes all categories.
    - `-l, --limit <number>`: Optional. The maximum number of images to process in a single run. Default: `10`.
    - `-d, --delay <milliseconds>`: Optional. The delay in milliseconds between each image processing call to respect API rate limits. Default: `2000`.
    - `-f, --force`: Optional. If passed, forces regeneration/re-fetching of images for all matching questions, even those that already have an `imageUrl`.
- **Usage Examples:**
  ```bash
  # Generate/fetch up to 5 images for the 'WorldCapitals' category
  npm run populate:images -- --category WorldCapitals --limit 5

  # Force regeneration of 2 images for the 'FamousPaintings' category
  npm run populate:images -- --category FamousPaintings --limit 2 --force
  ```

### 5. Optimize Images (`optimize:images`)

- **Purpose:** Scans all questions with images, downloads them, resizes and optimizes them to a smaller file size, re-uploads them, and updates the question's `imageUrl` in Firestore. It also deletes the original, larger image file from storage to save space.
- **Command:** `npm run optimize:images -- [options]`
- **Arguments:**
    - `-c, --category <topicValue>`: Optional. Process only questions in the category with this specific `topicValue`.
    - `-l, --limit <number>`: Optional. The maximum number of images to process in a single run. Default: `10`.
    - `-w, --width <number>`: Optional. The target width in pixels for the resized image. Height scales proportionally. Default: `800`.
    - `-q, --quality <number>`: Optional. The image quality (1-100) for the optimized WebP image. Default: `80`.
    - `-f, --force`: Optional. If passed, re-optimizes images even if they appear to be optimized already (i.e., their URL contains `_optimized`).
    - `-d, --dryRun`: Optional. If passed, the script will download and process images, and log what it *would* do, but will not actually upload new images, update Firestore, or delete original files.
- **Usage Examples:**
  ```bash
  # Optimize up to 20 images from the 'WorldLandmarks' category
  npm run optimize:images -- -c WorldLandmarks -l 20

  # Do a dry run on 5 images to see the potential savings
  npm run optimize:images -- -l 5 -d

  # Force re-optimization of all images with a width of 1024px
  npm run optimize:images -- -w 1024 -f
  ```

### 6. Check for Duplicate Questions (`check:questions`)

- **Purpose:** Uses AI to analyze all questions within a category (and optionally a specific difficulty) to find conceptual duplicates, even if they are worded differently. It now considers both the question text and the correct answer for a more accurate check. It then gives an interactive prompt to delete the identified duplicates.
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

### 7. Validate a Single Question (`validate:question`)

- **Purpose:** Uses AI to perform a detailed quality check on a single question from Firestore. The AI can accept it, reject it (and recommend deletion), or propose a fix. After validation, the question's `status` field in Firestore is updated to `'accepted'` or `'fixed'`.
- **Command:** `npm run validate:question -- --id <firestore_id> [options]`
- **Arguments:**
    - `-i, --id <firestore_id>`: **Required**. The Firestore document ID of the question you want to validate.
    - `--autofix` (alias `-af`): Optional, boolean. If passed, the script will automatically apply any fix proposed by the AI without asking for confirmation. Default: `false`.
    - `--autodelete` (alias `-ad`): Optional, boolean. If passed, the script will automatically delete any question the AI recommends rejecting. Default: `false`.
    - `--auto` (alias `-a`): Optional, boolean. A shortcut that enables both `--autofix` and `--autodelete` simultaneously.
    - `-m, --model <model_name>`: Optional. Specify the Genkit model to use for validation (e.g., `googleai/gemini-1.5-pro`).
- **Usage Examples:**
  ```bash
  # Validate a question with a specific ID interactively
  npm run validate:question -- --id="9vMnFraiklXm3KSZZoQN"

  # Validate and automatically fix a question if the AI suggests it
  npm run validate:question -- --id="9vMnFraiklXm3KSZZoQN" --autofix

  # Validate and automatically fix OR delete a question based on AI output
  npm run validate:question -- --id="9vMnFraiklXm3KSZZoQN" --auto
  ```
- **Interaction:**
    - If the AI suggests a fix:
        - With `--autofix` or `--auto`, it applies the fix automatically.
        - Without these flags, it displays the original and the fixed version and asks for confirmation to apply the update.
    - If the AI recommends rejection:
        - With `--autodelete` or `--auto`, it deletes the question automatically.
        - Without these flags, it will always ask for confirmation to delete the question.
    - If the AI accepts the question, it will simply report that no action is needed and set the question's status to `'accepted'`.

### 8. Validate Multiple Questions (`validate:questions`)

- **Purpose:** Runs the same AI quality check as `validate:question` but in bulk for all questions matching a given category and optional difficulty. By default, this script **only processes questions that have not been validated before** (i.e., do not have a `status` of 'accepted' or 'fixed').
- **Command:** `npm run validate:questions -- --topicValue <topicValue> [options]`
- **Arguments:**
    - `-t, --topicValue <topicValue>`: **Required**. The `topicValue` of the category to validate.
    - `-d, --difficulty <level>`: Optional. Validate only a specific difficulty (`easy`, `medium`, `hard`). If omitted, all difficulties for the topic are validated.
    - `-b, --batchSize <number>`: Optional. Number of questions to validate in parallel. Higher values are faster but consume more resources and API quota. Default: `1`.
    - `--autofix` (alias `-af`): Optional, boolean. Automatically apply any fix proposed by the AI. Default: `false`.
    - `--autodelete` (alias `-ad`): Optional, boolean. Automatically delete any question the AI recommends rejecting. Default: `false`.
    - `--auto` (alias `-a`): Optional, boolean. Enables both `--autofix` and `--autodelete`.
    - `--force` (alias `-f`): Optional, boolean. Force re-validation of all questions, ignoring their current status.
    - `-m, --model <model_name>`: Optional. Specify the Genkit model to use for validation.
- **Usage Examples:**
  ```bash
  # Run a 'dry run' validation on all unvalidated 'easy' History questions, logging recommendations
  npm run validate:questions -- -t History -d easy

  # Automatically fix and delete all unvalidated questions for the 'Science' category in parallel batches of 10
  npm run validate:questions -- --topicValue="Science" --auto --batchSize=10

  # Force re-validation of ALL 'hard' questions for 'Philosophy', even those already validated
  npm run validate:questions -- -t Philosophy -d hard --force
  ```
- **Interaction:**
    - This script is designed for automation. It does not ask for confirmation.
    - If run without `--auto`, `--autofix`, or `--autodelete`, it will log the AI's recommendations for each question but will not modify any data.
    - If run with the automation flags, it will perform fixes and deletions automatically and log the actions taken.
    - A summary of all actions is provided at the end of the script's execution.

---

## Data Migration Scripts

### 9. Migrate Questions Format (`migrate:questions`)

- **Purpose:** A one-time utility script to migrate all predefined questions in Firestore from the old data format (using `answers` array and `correctAnswerIndex`) to the new, more robust format (using a single `correctAnswer` object and a `distractors` array). This should be run after updating the application code to handle the new format.
- **Command:** `npm run migrate:questions`
- **Arguments:** None. This script runs on the entire `predefinedTriviaQuestions` collection.
- **Usage Example:**
  ```bash
  # Run the migration script for all questions
  npm run migrate:questions
  ```
- **Notes:**
    - The script is idempotent; it will only modify questions that are in the old format. Running it multiple times is safe and will have no effect after the first successful run.
    - This script directly modifies your production data. It's recommended to have a backup of your Firestore data before running it, just in case.
    - It processes questions in batches to avoid overwhelming Firestore resources.

---

NOTE: To update the categories and questions on the client side, update CURRENT_CONTENT_VERSION  on src/services/indexedDBService.ts.
