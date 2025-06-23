'use server';
/**
 * @fileOverview A Genkit flow to detect conceptually duplicate trivia questions.
 *
 * - detectDuplicateQuestions - A function that identifies pairs of duplicate questions.
 * - DetectDuplicatesInput - The input type for the detectDuplicateQuestions function.
 * - DetectDuplicatesOutput - The return type for the detectDuplicateQuestions function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const QuestionInputSchema = z.object({
  id: z.string().describe('The unique Firestore ID of the question.'),
  questionText: z.string().describe('The English text of the question.'),
  correctAnswerText: z.string().describe('The English text of the correct answer.'),
});
export type QuestionInput = z.infer<typeof QuestionInputSchema>;

const DetectDuplicatesInputSchema = z.object({
  questionsList: z.array(QuestionInputSchema).describe('A list of questions to check for duplicates.'),
  modelName: z.string().optional().describe('Optional Genkit model name to use for detection (e.g., googleai/gemini-1.5-flash).')
});
export type DetectDuplicatesInput = z.infer<typeof DetectDuplicatesInputSchema>;

const DuplicatePairSchema = z.object({
  originalId: z.string().describe("The ID of the first question in a duplicate pair. If a pair (X,Y) is found, this should be the ID that is lexicographically smaller."),
  duplicateId: z.string().describe("The ID of the second question in the pair that is considered a duplicate of the original. This ID should be lexicographically larger than originalId."),
  reason: z.string().optional().describe('A brief explanation of why these two questions are considered duplicates.'),
});
export type DuplicatePair = z.infer<typeof DuplicatePairSchema>;

const DetectDuplicatesOutputSchema = z.array(DuplicatePairSchema).describe('An array of identified duplicate pairs. Each pair should be listed only once, with the lexicographically smaller ID as originalId.');
export type DetectDuplicatesOutput = z.infer<typeof DetectDuplicatesOutputSchema>;

export async function detectDuplicateQuestions(input: DetectDuplicatesInput): Promise<DetectDuplicatesOutput> {
  return detectDuplicateQuestionsFlow(input);
}

const promptTemplate = `
You are an expert in identifying duplicate trivia questions.
You will be given a list of questions, each with a unique 'id', 'questionText', and 'correctAnswerText'.
Your task is to identify pairs of questions from this list that are conceptually duplicates.

A question is a duplicate of another if it tests the exact same fact.
- They MUST have the same or a synonymously identical correct answer.
- Their question texts must be asking for the same piece of information, even if worded differently.

Example of duplicates:
- Q1: "What is the capital of France?", Answer: "Paris"
- Q2: "Which city is the capital of France?", Answer: "Paris"
Reason: Both ask for the capital of France and have the same answer.

Example of NON-duplicates:
- Q1: "What is the capital of France?", Answer: "Paris"
- Q2: "Which famous city does the Seine River pass through?", Answer: "Paris"
Reason: Although the answer is the same, they test different facts (one tests knowledge of capitals, the other of geography related to rivers).

- For each pair of duplicates found (X, Y), list the one with the lexicographically **smaller** ID as \`originalId\` and the one with the lexicographically **larger** ID as \`duplicateId\`. This ensures each pair is reported only once and in a consistent order.
- A single question might be part of multiple duplicate pairs if it shares the same core concept with several other questions. In such cases, list all valid pairs following the lexicographical ID rule.
- Ensure \`originalId\` and \`duplicateId\` are different. A question cannot be a duplicate of itself.
- Provide a brief 'reason' explaining why you consider them duplicates.

Return ONLY the duplicates. If two questions are not duplicates you dont have to indicate it.

Return your findings as a JSON array of objects. Example format:
[
  { "originalId": "abc123_smaller_id", "duplicateId": "xyz789_larger_id", "reason": "Both ask for the capital of France." }
]

If no duplicates are found, return an empty array: [].

Here is the list of questions:
{{{json questionsList}}}
`;

const detectDuplicatesPrompt = ai.definePrompt({
  name: 'detectDuplicatesPrompt',
  input: { schema: DetectDuplicatesInputSchema },
  output: { schema: DetectDuplicatesOutputSchema },
  prompt: promptTemplate,
  config: {
    temperature: 0.3, // Lower temperature for more deterministic analysis
  },
});

const detectDuplicateQuestionsFlow = ai.defineFlow(
  {
    name: 'detectDuplicateQuestionsFlow',
    inputSchema: DetectDuplicatesInputSchema,
    outputSchema: DetectDuplicatesOutputSchema,
  },
  async (input) => {
    console.log(`[detectDuplicateQuestionsFlow] Received ${input.questionsList.length} questions to check.`);
    if (input.questionsList.length < 2) {
      console.log('[detectDuplicateQuestionsFlow] Fewer than 2 questions provided, no duplicates possible.');
      return [];
    }
    
    const modelToUse = input.modelName || 'googleai/gemini-2.5-flash'; // Default model
    console.log(`[detectDuplicateQuestionsFlow] Using model: ${modelToUse}`);

    try {
      const { output } = await detectDuplicatesPrompt(
        { questionsList: input.questionsList }, // Pass only the questionsList as per prompt input schema
        { model: modelToUse } 
      );
      
      if (output) {
        console.log(`[detectDuplicateQuestionsFlow] AI identified ${output.length} duplicate pairs.`);
        // Additional validation to ensure originalId < duplicateId
        const validatedOutput = output.filter(pair => pair.originalId < pair.duplicateId);
        if (validatedOutput.length < output.length) {
            console.warn(`[detectDuplicateQuestionsFlow] Some pairs were filtered out because originalId was not lexicographically smaller than duplicateId.`);
        }
        return validatedOutput;
      }
      console.log('[detectDuplicateQuestionsFlow] AI returned no output (null or undefined).');
      return [];
    } catch (error) {
      console.error('[detectDuplicateQuestionsFlow] Error calling detectDuplicatesPrompt:', error);
      throw new Error('AI failed to process duplicate detection.');
    }
  }
);
