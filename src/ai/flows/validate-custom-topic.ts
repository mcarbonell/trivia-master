'use server';
/**
 * @fileOverview Validates and refines a user-provided custom trivia topic.
 *
 * - validateCustomTopic - A function that uses AI to validate a topic, refine its name, and generate playing instructions.
 * - ValidateCustomTopicInput - The input type for the validateCustomTopic function.
 * - ValidateCustomTopicOutput - The return type for the validateCustomTopic function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import type { BilingualText } from '@/types';

const ValidateCustomTopicInputSchema = z.object({
  rawTopic: z.string().describe('The raw custom topic string provided by the user.'),
  currentLocale: z.enum(['en', 'es']).describe('The current locale of the user to guide language of rejection reason if any.'),
});
export type ValidateCustomTopicInput = z.infer<typeof ValidateCustomTopicInputSchema>;

const ValidateCustomTopicOutputSchema = z.object({
  isValid: z.boolean().describe('Whether the topic is considered valid and appropriate.'),
  rejectionReason: z.string().optional().describe('If not valid, a brief explanation for the user (in their currentLocale).'),
  refinedTopicName: z.object({
    en: z.string().describe('The refined topic name in English.'),
    es: z.string().describe('The refined topic name in Spanish.'),
  }).optional().describe('A slightly more formal or descriptive topic name generated by the AI, if deemed valid.'),
  detailedPromptInstructions: z.string().optional().describe('AI-generated detailed instructions (English-only) for generating trivia questions for this topic, to be used by the question generation flow. This should guide the AI to create relevant and varied questions for the refined topic.'),
});
export type ValidateCustomTopicOutput = z.infer<typeof ValidateCustomTopicOutputSchema>;

export async function validateCustomTopic(input: ValidateCustomTopicInput): Promise<ValidateCustomTopicOutput> {
  return validateCustomTopicFlow(input);
}

const validationPrompt = ai.definePrompt({
  name: 'validateCustomTopicPrompt',
  input: { schema: ValidateCustomTopicInputSchema },
  output: { schema: ValidateCustomTopicOutputSchema },
  prompt: `You are an AI assistant responsible for validating user-submitted custom trivia topics and preparing them for question generation.
The user has submitted the following raw topic: "{{rawTopic}}" in the language of their current locale '{{currentLocale}}'.

Your tasks are:
1.  **Validation**:
    *   Assess if the topic is coherent and understandable.
    *   Reject topics that are nonsensical (e.g., "asdfghjkl"), gibberish, or too vague to generate meaningful trivia.
    *   Reject topics that promote hate speech, violence, illegal activities, or are grossly offensive. Do not be overly sensitive; common historical or fictional topics involving conflict are acceptable, but direct promotion of harm is not.
    *   If you reject the topic, set 'isValid' to false and provide a brief 'rejectionReason' in the user's locale ('{{currentLocale}}'). The reason should be polite and general (e.g., "Topic is unclear or inappropriate.", "El tema no es claro o es inapropiado."). Do not include the other fields if invalid.

2.  **Refinement & Instruction Generation (only if valid)**:
    *   If the topic is valid, set 'isValid' to true.
    *   **Refined Topic Name**: Generate a concise, clear, and slightly more formal 'refinedTopicName' for this topic, in both English (en) and Spanish (es). This name will be shown to the user and used as the basis for question generation. For example, if user types "cats", refined could be "Cats" (en) / "Gatos" (es). If user types "history of Rome", it could be "History of Rome" (en) / "Historia de Roma" (es). If the topic is already well-phrased, you can use it as is for the refined name.
    *   **Detailed Prompt Instructions**: Generate 'detailedPromptInstructions' (in English only). These instructions will be given to another AI to generate actual trivia questions. They should be detailed and guide the question-generation AI to create varied and interesting questions covering different aspects of the 'refinedTopicName'. Think about what sub-topics, key figures, events, concepts, or characteristics are relevant. Aim for 2-4 sentences of rich guidance. For example, for "Solar System", instructions might include: "Generate questions about the planets, their characteristics, moons, asteroids, comets, the Sun, and history of space exploration within the solar system. Cover physical properties, orbits, and notable missions."

Output Format:
Provide your response as a single JSON object matching the output schema. Ensure all strings are properly escaped.

Example of a valid output for "cats":
{
  "isValid": true,
  "refinedTopicName": { "en": "Cats", "es": "Gatos" },
  "detailedPromptInstructions": "Generate diverse trivia questions about cats. Topics should include different cat breeds, their behaviors, common cat health and care facts, famous fictional cats, and their historical significance in various cultures. Questions should be verifiable and broadly interesting to cat enthusiasts."
}

Example of an invalid output:
{
  "isValid": false,
  "rejectionReason": "The submitted topic is too vague and does not provide enough information to generate trivia questions."
}

User's raw topic: "{{rawTopic}}"
User's locale: "{{currentLocale}}"
`,
  config: {
    temperature: 0.6,
  },
  model: 'googleai/gemini-2.5-flash'
});

const validateCustomTopicFlow = ai.defineFlow(
  {
    name: 'validateCustomTopicFlow',
    inputSchema: ValidateCustomTopicInputSchema,
    outputSchema: ValidateCustomTopicOutputSchema,
  },
  async (input) => {
    const { output } = await validationPrompt(input);
    if (!output) {
      // Fallback if the LLM doesn't return anything or there's an unexpected error
      console.warn(`[validateCustomTopicFlow] LLM returned null or undefined for topic: ${input.rawTopic}`);
      return {
        isValid: false,
        rejectionReason: input.currentLocale === 'es' ? 'No se pudo procesar el tema. Por favor, inténtalo de nuevo.' : 'Could not process the topic. Please try again.',
      };
    }
    return output;
  }
);