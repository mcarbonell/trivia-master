
'use server';
/**
 * @fileOverview A Genkit flow to validate a single trivia question.
 * It now includes category-specific instructions to provide better context to the AI.
 *
 * - validateSingleTriviaQuestion - A function that validates a question and suggests fixes or rejection.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { adminDb } from '@/lib/firebase-admin';
import { 
  ValidateSingleQuestionInputSchema, 
  ValidateSingleQuestionOutputSchema,
  type ValidateSingleQuestionInput,
  type ValidateSingleQuestionOutput,
} from '@/types';


const CATEGORIES_COLLECTION = 'triviaCategories';

// --- Exported Function ---

export async function validateSingleTriviaQuestion(input: ValidateSingleQuestionInput): Promise<ValidateSingleQuestionOutput> {
  return validateSingleTriviaQuestionFlow(input);
}

// Input schema specifically for the prompt, including the fetched context
const PromptInputSchema = ValidateSingleQuestionInputSchema.extend({
  categoryInstructions: z.string().optional().describe('Specific instructions for the category this question belongs to.'),
});


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

7.  **Visual Category Check (if applicable)**:
    *   If the category is visual (instructions will mention this), BOTH an \`imagePrompt\` and a \`searchTerm\` are **MANDATORY**.
    *   The \`imagePrompt\` should be a detailed, English-only description for AI generation. It MUST include the name of the subject to ensure accuracy.
    *   The \`searchTerm\` should be a concise English-only query for finding a real image.
    *   If a question in a visual category is missing either \`imagePrompt\` or \`searchTerm\`, you MUST generate an appropriate one based on the question and correct answer, then choose the "Fix" status.

Based on your evaluation, determine a \`validationStatus\`:

*   \`"Accept"\`: If the question and all its parts are excellent and meet all criteria.
*   \`"Reject"\`: If the question has significant flaws (e.g., factually incorrect, unsolvable, offensive) and you cannot confidently fix it.
*   \`"Fix"\`: If the question has minor to moderate issues that YOU CAN CORRECT. This includes typos, grammar, improving a distractor, adjusting difficulty, enhancing an explanation, or adding/improving an \`imagePrompt\` or \`searchTerm\`. IF YOU CHOOSE "Fix", YOU MUST PROVIDE THE ENTIRE CORRECTED QUESTION DATA IN THE \`fixedQuestionData\` field.

**Output Format Rules:**

*   Your response MUST be a single, valid JSON object.
*   If \`validationStatus\` is \`"Fix"\`, the \`fixedQuestionData\` field is MANDATORY.
    *   In \`fixedQuestionData\`, provide the COMPLETE, corrected question data. It must include all relevant fields like \`question\`, \`correctAnswer\`, \`distractors\`, \`explanation\`, \`difficulty\`, and \`imagePrompt\`/\`searchTerm\` if applicable.
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
    try {
        const categoryRef = adminDb.collection(CATEGORIES_COLLECTION).doc(input.questionData.topicValue);
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
