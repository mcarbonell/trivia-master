
'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating trivia questions and answers based on a given topic,
 * ensuring questions are not repeated within a session and providing explanations for correct answers.
 *
 * The flow takes a topic and a list of previous questions as input, and returns a trivia question,
 * four possible answers, the index of the correct answer, and an explanation.
 *
 * @interface GenerateTriviaQuestionInput - Input schema for the generateTriviaQuestion flow.
 * @interface GenerateTriviaQuestionOutput - Output schema for the generateTriviaQuestion flow.
 * @function generateTriviaQuestion - The main function to generate a trivia question.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateTriviaQuestionInputSchema = z.object({
  topic: z.string().describe('The topic for the trivia question.'),
  previousQuestions: z.array(z.string()).optional().describe('A list of questions already asked on this topic in the current session, to avoid repetition.'),
});
export type GenerateTriviaQuestionInput = z.infer<typeof GenerateTriviaQuestionInputSchema>;

const GenerateTriviaQuestionOutputSchema = z.object({
  question: z.string().describe('The trivia question.'),
  answers: z.array(z.string()).length(4).describe('Four possible answers to the question.'),
  correctAnswerIndex: z
    .number()
    .min(0)
    .max(3)
    .describe('The index (0-3) of the correct answer in the answers array.'),
  explanation: z.string().describe('A brief explanation (1-2 sentences) of why the correct answer is correct.'),
});
export type GenerateTriviaQuestionOutput = z.infer<typeof GenerateTriviaQuestionOutputSchema>;

export async function generateTriviaQuestion(input: GenerateTriviaQuestionInput): Promise<GenerateTriviaQuestionOutput> {
  return generateTriviaQuestionFlow(input);
}

const generateTriviaQuestionPrompt = ai.definePrompt({
  name: 'generateTriviaQuestionPrompt',
  input: {schema: GenerateTriviaQuestionInputSchema},
  output: {schema: GenerateTriviaQuestionOutputSchema},
  prompt: `You are an expert trivia question generator. Given a topic, you will generate a trivia question, four possible answers, indicate the index of the correct answer, and provide a brief explanation for the correct answer.

Topic: {{{topic}}}

{{#if previousQuestions}}
Please ensure the new question is different from the following questions that have already been asked on this topic:
{{#each previousQuestions}}
- "{{this}}"
{{/each}}
{{/if}}

Your response should be formatted as a JSON object with the following keys:
- question: The trivia question.
- answers: An array of four strings, representing the possible answers.
- correctAnswerIndex: An integer between 0 and 3 (inclusive), indicating the index of the correct answer in the answers array.
- explanation: A brief explanation (1-2 sentences) of why the correct answer is correct.

Make sure that only one answer is correct.
`,
});

const generateTriviaQuestionFlow = ai.defineFlow(
  {
    name: 'generateTriviaQuestionFlow',
    inputSchema: GenerateTriviaQuestionInputSchema,
    outputSchema: GenerateTriviaQuestionOutputSchema,
  },
  async input => {
    const {output} = await generateTriviaQuestionPrompt(input);
    return output!;
  }
);
