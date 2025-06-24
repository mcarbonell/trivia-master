'use server';
/**
 * @fileOverview A Genkit flow to validate a single trivia question.
 * It now includes category-specific instructions to provide better context to the AI.
 *
 * - validateSingleTriviaQuestion - A function that validates a question and suggests fixes or rejection.
 * - ValidateSingleQuestionInput - The input type for the validateSingleTriviaQuestion function.
 * - ValidateSingleQuestionOutput - The return type for the validateSingleQuestionOutput function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import type { GenerateTriviaQuestionOutput } from '@/ai/flows/generate-trivia-question';
import admin from 'firebase-admin';

// Initialize Firebase Admin SDK
try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    console.log('[validate-single-trivia-question-flow] Firebase Admin SDK initialized.');
  }
} catch (error) {
  console.error('[validate-single-trivia-question-flow] Firebase Admin initialization error.', error);
  // We don't want to crash the whole process, so we'll just log the error.
  // The flow will proceed without category context.
}
const db = admin.firestore();
const CATEGORIES_COLLECTION = 'triviaCategories';

// --- Zod Schemas ---

const BilingualAnswerSchema = z.object({
    en: z.string().describe('English version of the answer text.'),
    es: z.string().describe('Spanish version of the answer text.'),
});

const QuestionDataSchema = z.object({
  id: z.string().describe("The Firestore ID of the question being validated."),
  topicValue: z.string().describe("The topic value associated with the question."),
  question: z.object({
    en: z.string().describe('English version of the question text.'),
    es: z.string().describe('Spanish version of the question text.'),
  }),
  correctAnswer: BilingualAnswerSchema.describe('The single correct answer.'),
  distractors: z.array(BilingualAnswerSchema).length(3).describe('An array of three incorrect answers (distractors).'),
  explanation: z.object({
    en: z.string().describe('English version of the explanation.'),
    es: z.string().describe('Spanish version of the explanation.'),
  }),
  hint: z.object({
    en: z.string().describe('English version of the hint.'),
    es: z.string().describe('Spanish version of the hint.'),
  }).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  status: z.string().optional().describe("Validation status of the question, if any (e.g., 'accepted', 'fixed')."),
  source: z.string().optional().describe("Source information for the question, if available."),
  createdAt: z.string().optional().describe("Creation timestamp, if available.")
});
export type QuestionData = z.infer<typeof QuestionDataSchema>;

export const ValidateSingleQuestionInputSchema = z.object({
  questionData: QuestionDataSchema.describe('The full data of the trivia question to validate.'),
  modelName: z.string().optional().describe('Optional Genkit model name to use for validation (e.g., googleai/gemini-1.5-flash).')
});
export type ValidateSingleQuestionInput = z.infer<typeof ValidateSingleQuestionInputSchema>;

const ValidationStatusSchema = z.enum(["Accept", "Reject", "Fix"])
  .describe('Status of the validation: "Accept" if correct, "Reject" if unfixable, "Fix" if correctable.');

export const ValidateSingleQuestionOutputSchema = z.object({
  validationStatus: ValidationStatusSchema,
  reasoning: z.string().describe('AI\'s reasoning for the validation status. If "Fix", should explain what was fixed.'),
  fixedQuestionData: QuestionDataSchema.omit({id: true, topicValue: true, source: true, createdAt: true, status: true }).optional()
    .describe('The corrected question data if validationStatus is "Fix". Structure should match GenerateTriviaQuestionOutputSchema but without id, topicValue, source, createdAt.'),
});
export type ValidateSingleQuestionOutput = z.infer<typeof ValidateSingleQuestionOutputSchema>;

// Input schema specifically for the prompt, including the fetched context
const PromptInputSchema = ValidateSingleQuestionInputSchema.extend({
  categoryInstructions: z.string().optional().describe('Specific instructions for the category this question belongs to.'),
});

// --- Exported Function ---

export async function validateSingleTriviaQuestion(input: ValidateSingleQuestionInput): Promise<ValidateSingleQuestionOutput> {
  return validateSingleTriviaQuestionFlow(input);
}

// --- Prompt Definition ---

const promptTemplate = `
You are an expert trivia question validator and editor.
You will be given a single trivia question with its ID, topicValue, question text, a single \`correctAnswer\`, an array of three incorrect \`distractors\`, an explanation, and other metadata.

Your task is to meticulously evaluate the question based on the following criteria:

{{#if categoryInstructions}}
**IMPORTANT CATEGORY CONTEXT:** This question belongs to the "{{questionData.topicValue}}" category. This category has specific guidelines that you MUST consider during your evaluation.
Category Instructions: "{{categoryInstructions}}"
For example, if the category is about the English language, the answers should be in English, not Spanish.
{{/if}}

1.  **Clarity & Correctness**:
    *   Is the question clear, unambiguous, and grammatically correct in both English and Spanish?
    *   Is the information factually accurate?

2.  **Answer Validity**:
    *   Is the \`correctAnswer\` TRULY and UNDISPUTABLY correct?
    *   Are all three \`distractors\` plausible but DEFINITELY incorrect? There should be no ambiguity or other correct answers within the distractors.
    *   Are all answer texts (correct and distractors) grammatically correct and phrased naturally in both languages?

3.  **Explanation Quality**:
    *   Does the explanation clearly and accurately explain WHY the \`correctAnswer\` is correct?
    *   Is it concise (1-2 sentences ideally) and informative in both languages?

4.  **Hint Usefulness (if present)**:
    *   Is the hint helpful without giving away the answer too directly? Is it too obscure or, conversely, too obvious?

5.  **Difficulty Assessment**:
    *   Does the assigned difficulty level ('easy', 'medium', 'hard') seem appropriate?
    *   - "easy": Common knowledge.
    *   - "medium": Requires some specific knowledge.
    *   - "hard": Specialized, university-level knowledge.

6.  **Bilingual Consistency**:
    *   Are all textual fields (question, answers, explanation, hint) provided and accurately translated/localized between English and Spanish?

Based on your evaluation, determine a \`validationStatus\`:

*   \`"Accept"\`: If the question and all its parts are excellent and meet all criteria.
*   \`"Reject"\`: If the question has significant flaws (e.g., factually incorrect, unsolvable, offensive) and you cannot confidently fix it.
*   \`"Fix"\`: If the question has minor to moderate issues that YOU CAN CORRECT. This includes typos, grammar, improving a distractor, adjusting difficulty, or enhancing an explanation. IF YOU CHOOSE "Fix", YOU MUST PROVIDE THE ENTIRE CORRECTED QUESTION DATA IN THE \`fixedQuestionData\` field.

**Output Format Rules:**

*   Your response MUST be a single, valid JSON object.
*   If \`validationStatus\` is \`"Fix"\`, the \`fixedQuestionData\` field is MANDATORY.
    *   In \`fixedQuestionData\`, provide the COMPLETE, corrected question data. It must include: \`question\`, \`correctAnswer\`, \`distractors\` (as an array of 3 bilingual objects), \`explanation\`, \`hint\` (optional), and \`difficulty\`.
*   If \`validationStatus\` is \`"Accept"\` or \`"Reject"\`, the \`fixedQuestionData\` field MUST be omitted.
*   Your \`reasoning\` field should clearly explain your decision. If fixing, detail WHAT you fixed and WHY.

**Input Question Details:**
Topic Value: {{{questionData.topicValue}}}
Question ID: {{{questionData.id}}}
Current Assigned Difficulty: {{{questionData.difficulty}}}

Question Data to Validate:
{{{json questionData}}}

Analyze carefully and provide your response in the specified JSON format.
`;

const validateSingleTriviaQuestionPrompt = ai.definePrompt({
  name: 'validateSingleTriviaQuestionPrompt',
  input: { schema: PromptInputSchema }, // Use the new schema with context
  output: { schema: ValidateSingleQuestionOutputSchema },
  prompt: promptTemplate,
  config: {
    temperature: 0.3,
  },
});

// --- Flow Definition ---

const validateSingleTriviaQuestionFlow = ai.defineFlow(
  {
    name: 'validateSingleTriviaQuestionFlow',
    inputSchema: ValidateSingleQuestionInputSchema,
    outputSchema: ValidateSingleQuestionOutputSchema,
  },
  async (input) => {
    // console.log(`[validateSingleTriviaQuestionFlow] Validating question ID: ${input.questionData.id} for topic: ${input.questionData.topicValue}`);
    
    const modelToUse = input.modelName || 'googleai/gemini-2.5-flash';
    // console.log(`[validateSingleTriviaQuestionFlow] Using model: ${modelToUse}`);

    let categoryInstructions: string | undefined = undefined;

    // Fetch category instructions to provide more context to the AI
    if (admin.apps.length > 0) { // Check if Firebase Admin is initialized
        try {
            const categoryRef = db.collection(CATEGORIES_COLLECTION).doc(input.questionData.topicValue);
            const categoryDoc = await categoryRef.get();
            if (categoryDoc.exists) {
                categoryInstructions = categoryDoc.data()?.detailedPromptInstructions;
                if (categoryInstructions) {
                  // console.log(`[validateSingleTriviaQuestionFlow] Found category instructions for topic "${input.questionData.topicValue}".`);
                }
            } else {
              console.warn(`[validateSingleTriviaQuestionFlow] Category document for topic "${input.questionData.topicValue}" not found.`);
            }
        } catch (error) {
            console.error('[validateSingleTriviaQuestionFlow] Error fetching category instructions from Firestore:', error);
        }
    } else {
        console.warn('[validateSingleTriviaQuestionFlow] Firebase Admin SDK not initialized. Proceeding without category context.');
    }

    const promptInput = {
      ...input,
      categoryInstructions: categoryInstructions,
    };

    try {
      const { output } = await validateSingleTriviaQuestionPrompt(
        promptInput, // Pass the input with instructions
        { model: modelToUse }
      );
      
      if (!output) {
        console.error('[validateSingleTriviaQuestionFlow] AI returned no output (null or undefined).');
        throw new Error('AI returned no output.');
      }

      // Post-processing validation for "Fix" status
      if (output.validationStatus === "Fix") {
        if (!output.fixedQuestionData) {
          console.warn('[validateSingleTriviaQuestionFlow] AI reported "Fix" but did not provide fixedQuestionData. Changing status to "Reject".');
          return {
            validationStatus: "Reject",
            reasoning: "AI suggested a fix but failed to provide the corrected data. Original reasoning: " + output.reasoning,
          };
        }
        if (output.fixedQuestionData.distractors?.length !== 3) {
             console.warn('[validateSingleTriviaQuestionFlow] AI provided fixedQuestionData with an incorrect number of distractors. Changing status to "Reject".');
             return {
                validationStatus: "Reject",
                reasoning: "AI provided fixedQuestionData with an incorrect number of distractors (" + output.fixedQuestionData.distractors?.length + "). Original reasoning: " + output.reasoning,
             }
        }
      }
      
      // console.log(`[validateSingleTriviaQuestionFlow] Validation result for ${input.questionData.id}: ${output.validationStatus}`);
      return output;

    } catch (error) {
      console.error('[validateSingleTriviaQuestionFlow] Error calling AI prompt:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during AI validation.';
      throw new Error(`AI validation failed: ${errorMessage}`);
    }
  }
);
