'use server';
/**
 * @fileOverview A Genkit flow to validate a single trivia question.
 *
 * - validateSingleTriviaQuestion - A function that validates a question and suggests fixes or rejection.
 * - ValidateSingleQuestionInput - The input type for the validateSingleTriviaQuestion function.
 * - ValidateSingleQuestionOutput - The return type for the validateSingleTriviaQuestion function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import type { GenerateTriviaQuestionOutput, BilingualText, DifficultyLevel } from '@/ai/flows/generate-trivia-question';

// Re-using GenerateTriviaQuestionOutputSchema for the fixedQuestionData
const QuestionDataSchema = z.object({
  id: z.string().describe("The Firestore ID of the question being validated."),
  topicValue: z.string().describe("The topic value associated with the question."),
  question: z.object({
    en: z.string().describe('English version of the question text.'),
    es: z.string().describe('Spanish version of the question text.'),
  }),
  answers: z.array(z.object({
    en: z.string().describe('English version of an answer option.'),
    es: z.string().describe('Spanish version of an answer option.'),
  })).length(4),
  correctAnswerIndex: z.number().min(0).max(3),
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
  fixedQuestionData: QuestionDataSchema.omit({id: true, topicValue: true, source: true, createdAt: true, status: true }).optional() // Omit fields that AI shouldn't change directly
    .describe('The corrected question data if validationStatus is "Fix". Structure should match GenerateTriviaQuestionOutputSchema but without id, topicValue, source, createdAt.'),
});
export type ValidateSingleQuestionOutput = z.infer<typeof ValidateSingleQuestionOutputSchema>;


export async function validateSingleTriviaQuestion(input: ValidateSingleQuestionInput): Promise<ValidateSingleQuestionOutput> {
  return validateSingleTriviaQuestionFlow(input);
}

const promptTemplate = `
You are an expert trivia question validator and editor.
You will be given a single trivia question with its ID, topicValue, question text (English and Spanish), four possible answers (English and Spanish), the index of the correct answer, an explanation (English and Spanish), an optional hint (English and Spanish), its assigned difficulty, and source/createdAt if available.

Your task is to meticulously evaluate the question based on the following criteria:

1.  **Clarity & Correctness**:
    *   Is the question clear, unambiguous, and grammatically correct in both English and Spanish?
    *   Is the information factually accurate?
    *   Is the question phrased naturally in both languages?

2.  **Answer Validity**:
    *   Is the indicated correct answer (at \`correctAnswerIndex\`) TRULY and UNDISPUTABLY correct?
    *   Are the other three answers plausible distractors but DEFINITELY incorrect? There should be no ambiguity or multiple correct answers.
    *   Are all answers grammatically correct and phrased naturally in both English and Spanish?

3.  **Explanation Quality**:
    *   Does the explanation clearly and accurately explain WHY the correct answer is correct?
    *   Is it concise (1-2 sentences ideally) and informative in both languages?
    *   Is it grammatically correct and natural in both languages?

4.  **Hint Usefulness (if present)**:
    *   Is the hint helpful without giving away the answer too directly?
    *   Is it too obscure or, conversely, too obvious?
    *   Is it grammatically correct and natural in both languages? If no hint is needed or appropriate, it can be omitted in a fix.

5.  **Difficulty Assessment**:
    *   Does the assigned difficulty level ('easy', 'medium', 'hard') seem appropriate for the question's content and the likely knowledge required to answer it?
    *   - "easy": Knowledge typically acquired in primary or early secondary school. Common knowledge for most people.
    *   - "medium": Knowledge typically acquired in secondary school or through general cultural awareness. Requires some specific knowledge.
    *   - "hard": Knowledge typically associated with higher education or specialized interest. Questions at this level should be challenging but answerable by someone well-versed in the subject.

6.  **Bilingual Consistency**:
    *   Are all textual fields (question, answers, explanation, hint) provided and accurately translated/localized between English and Spanish? The meaning should be identical.

Based on your evaluation, determine a \`validationStatus\`:

*   \`"Accept"\`: If the question is well-formed, factually correct, the correct answer is valid, distractors are good, explanation and hint (if any) are appropriate, difficulty is reasonable, and bilingual content is consistent.
*   \`"Reject"\`: If the question has significant flaws (e.g., factually incorrect, unsolvable, correct answer is wrong and cannot be easily fixed by rephrasing or minor data correction, multiple correct answers, offensive content, poor translations that change meaning significantly) and you cannot confidently fix it to meet all criteria.
*   \`"Fix"\`: If the question has minor to moderate issues that YOU CAN CORRECT to meet all criteria. This includes typos, grammatical errors, slightly misleading wording, improving a distractor, enhancing an explanation/hint, adjusting difficulty, or improving translations. IF YOU CHOOSE "Fix", YOU MUST PROVIDE THE ENTIRE CORRECTED QUESTION DATA IN THE \`fixedQuestionData\` field.

**Output Format Rules:**

*   Your response MUST be a single, valid JSON object.
*   The JSON object must conform to the schema: \`{ validationStatus: string, reasoning: string, fixedQuestionData?: { question: {en, es}, answers: [{en, es}, ...], correctAnswerIndex: number, explanation: {en, es}, hint?: {en, es}, difficulty: string } }\`
*   If \`validationStatus\` is \`"Fix"\`, the \`fixedQuestionData\` field is MANDATORY.
    *   In \`fixedQuestionData\`, provide the COMPLETE, corrected question data. Do not include the original 'id', 'topicValue', 'source', or 'createdAt' in \`fixedQuestionData\`. Only include the fields that can be edited: 'question', 'answers', 'correctAnswerIndex', 'explanation', 'hint' (optional), 'difficulty'.
    *   Ensure \`fixedQuestionData.answers\` is an array of 4 bilingual answer objects.
    *   Ensure \`fixedQuestionData.correctAnswerIndex\` is a number between 0 and 3.
    *   Ensure \`fixedQuestionData.difficulty\` is one of "easy", "medium", or "hard".
*   If \`validationStatus\` is \`"Accept"\` or \`"Reject"\`, the \`fixedQuestionData\` field MUST be omitted.
*   Your \`reasoning\` field should clearly explain your decision. If fixing, detail WHAT you fixed and WHY. If rejecting, specify the critical flaws.

**Input Question Details:**
Topic Value: {{{questionData.topicValue}}}
Question ID: {{{questionData.id}}}
Current Assigned Difficulty: {{{questionData.difficulty}}}
Source: {{{questionData.source}}}
Created At: {{{questionData.createdAt}}}
Current Validation Status: {{{questionData.status}}}

Question Data to Validate:
{{{json questionData}}}

Analyze carefully and provide your response in the specified JSON format.
`;

const validateSingleTriviaQuestionPrompt = ai.definePrompt({
  name: 'validateSingleTriviaQuestionPrompt',
  input: { schema: ValidateSingleQuestionInputSchema },
  output: { schema: ValidateSingleQuestionOutputSchema },
  prompt: promptTemplate,
  config: {
    temperature: 0.3, // Lower temperature for more deterministic validation and fixing
  },
});

const validateSingleTriviaQuestionFlow = ai.defineFlow(
  {
    name: 'validateSingleTriviaQuestionFlow',
    inputSchema: ValidateSingleQuestionInputSchema,
    outputSchema: ValidateSingleQuestionOutputSchema,
  },
  async (input) => {
    console.log(`[validateSingleTriviaQuestionFlow] Validating question ID: ${input.questionData.id} for topic: ${input.questionData.topicValue}`);
    
    const modelToUse = input.modelName || 'googleai/gemini-2.5-flash'; // Default model if not provided
    console.log(`[validateSingleTriviaQuestionFlow] Using model: ${modelToUse}`);

    try {
      const { output } = await validateSingleTriviaQuestionPrompt(
        input, // Pass the whole input object
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
        // Further ensure fixedQuestionData adheres to its schema parts if needed, Zod on output already does a lot.
        // Example: check if answers array has 4 elements.
        if (output.fixedQuestionData.answers?.length !== 4) {
             console.warn('[validateSingleTriviaQuestionFlow] AI provided fixedQuestionData with an incorrect number of answers. Changing status to "Reject".');
             return {
                validationStatus: "Reject",
                reasoning: "AI provided fixedQuestionData with an incorrect number of answers (" + output.fixedQuestionData.answers?.length + "). Original reasoning: " + output.reasoning,
             }
        }
      }
      
      console.log(`[validateSingleTriviaQuestionFlow] Validation result for ${input.questionData.id}: ${output.validationStatus}`);
      return output;

    } catch (error) {
      console.error('[validateSingleTriviaQuestionFlow] Error calling AI prompt:', error);
      // Provide a more informative error message to the CLI script
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during AI validation.';
      throw new Error(`AI validation failed: ${errorMessage}`);
    }
  }
);
