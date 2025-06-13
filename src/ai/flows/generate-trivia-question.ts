'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating trivia questions and answers based on a given topic.
 *
 * The flow takes a topic as input and returns a trivia question, four possible answers, and the index of the correct answer.
 *
 * @interface GenerateTriviaQuestionInput - Input schema for the generateTriviaQuestion flow.
 * @interface GenerateTriviaQuestionOutput - Output schema for the generateTriviaQuestion flow.
 * @function generateTriviaQuestion - The main function to generate a trivia question.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateTriviaQuestionInputSchema = z.object({
  topic: z.string().describe('The topic for the trivia question.'),
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
});
export type GenerateTriviaQuestionOutput = z.infer<typeof GenerateTriviaQuestionOutputSchema>;

export async function generateTriviaQuestion(input: GenerateTriviaQuestionInput): Promise<GenerateTriviaQuestionOutput> {
  return generateTriviaQuestionFlow(input);
}

const generateTriviaQuestionPrompt = ai.definePrompt({
  name: 'generateTriviaQuestionPrompt',
  input: {schema: GenerateTriviaQuestionInputSchema},
  output: {schema: GenerateTriviaQuestionOutputSchema},
  prompt: `You are an expert trivia question generator. Given a topic, you will generate a trivia question, four possible answers, and indicate the index of the correct answer.

Topic: {{{topic}}}

Your response should be formatted as a JSON object with the following keys:
- question: The trivia question.
- answers: An array of four strings, representing the possible answers.
- correctAnswerIndex: An integer between 0 and 3 (inclusive), indicating the index of the correct answer in the answers array.

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
