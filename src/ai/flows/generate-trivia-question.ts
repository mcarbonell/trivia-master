
'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating bilingual (English and Spanish) trivia questions.
 * It ensures questions and their correct answers are not repeated within a session, provides explanations,
 * and generates questions of a specified or assessed difficulty level.
 *
 * The flow takes a topic, a list of previous questions (texts), a list of previous correct answers (texts),
 * and an optional target difficulty as input.
 * It returns a trivia question object containing English and Spanish versions for question, answers, and explanation,
 * along with the correct answer index and difficulty level.
 *
 * @interface GenerateTriviaQuestionInput - Input schema for the generateTriviaQuestion flow.
 * @interface GenerateTriviaQuestionOutput - Output schema for the generateTriviaQuestion flow.
 * @function generateTriviaQuestion - The main function to generate a trivia question.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DifficultyLevelSchema = z.enum([
  "very easy",
  "easy",
  "medium",
  "hard",
  "very hard"
]).describe("The assessed or targeted difficulty level of the question.");
export type DifficultyLevel = z.infer<typeof DifficultyLevelSchema>;

const BilingualTextSchema = z.object({
  en: z.string().describe('English version of the text.'),
  es: z.string().describe('Spanish version of the text.'),
});

const BilingualAnswerSchema = z.object({
  en: z.string().describe('English version of the answer.'),
  es: z.string().describe('Spanish version of the answer.'),
});

const GenerateTriviaQuestionInputSchema = z.object({
  topic: z.string().describe('The topic for the trivia question.'),
  previousQuestions: z.array(z.string()).optional().describe('A list of question texts (can be in English or Spanish, or a mix if user switched languages) already asked on this topic in the current session, to avoid repetition of the same conceptual question. The AI should consider these as distinct concepts already covered.'),
  previousCorrectAnswers: z.array(z.string()).optional().describe('A list of correct answer texts (can be in English or Spanish) from questions already asked on this topic, to ensure variety in the subject matter. The AI should avoid these concepts as correct answers for the new question.'),
  targetDifficulty: DifficultyLevelSchema.optional().describe('If provided, the AI should attempt to generate a question of this specific difficulty level. If not provided, the AI will assess and assign a difficulty level based on the content and its guidelines.'),
});
export type GenerateTriviaQuestionInput = z.infer<typeof GenerateTriviaQuestionInputSchema>;

const GenerateTriviaQuestionOutputSchema = z.object({
  question: BilingualTextSchema.describe('The trivia question in English and Spanish.'),
  answers: z.array(BilingualAnswerSchema).length(4).describe('Four possible answers to the question, each in English and Spanish.'),
  correctAnswerIndex: z
    .number()
    .min(0)
    .max(3)
    .describe('The index (0-3) of the correct answer in the answers array. This index applies to both language versions of the answers.'),
  explanation: BilingualTextSchema.describe('A brief explanation (1-2 sentences) of why the correct answer is correct, in English and Spanish.'),
  difficulty: DifficultyLevelSchema,
});
export type GenerateTriviaQuestionOutput = z.infer<typeof GenerateTriviaQuestionOutputSchema>;

export async function generateTriviaQuestion(input: GenerateTriviaQuestionInput): Promise<GenerateTriviaQuestionOutput> {
  return generateTriviaQuestionFlow(input);
}

const promptTemplateString = `You are an expert trivia question generator. Given a topic, you will generate a trivia question, four possible answers, indicate the index of the correct answer, provide a brief explanation for the correct answer, and assess its difficulty level.

IMPORTANT: You MUST generate all textual content (question, each of the four answers, and the explanation) in BOTH English (en) and Spanish (es).

Topic: {{{topic}}}

IMPORTANT INSTRUCTIONS FOR QUESTION VARIETY:
1. If the topic is broad (e.g., "Geography", "Science", "History", "Chess"), ensure the questions cover DIFFERENT ASPECTS or SUB-TOPICS. For "Chess", consider aspects like its history, famous players, championships, different openings, common endgames, tactical motifs, in addition to basic rules.
2. The new question MUST be SIGNIFICANTLY DIFFERENT from any previous questions. Avoid asking about the same specific entity or concept even if worded differently or in another language.

{{#if previousQuestions}}
The following question texts (which might be in English or Spanish) have already been asked on this topic in the current session. You MUST generate a NEW and DIFFERENT question that explores a new facet of the topic. DO NOT repeat or ask very similar questions to any of the following concepts:
{{#each previousQuestions}}
- "{{this}}"
{{/each}}
{{/if}}

{{#if previousCorrectAnswers}}
Furthermore, the correct answer for the new question MUST NOT cover the same concept as any of the following, nor should it be a trivial variation of them, regardless of language. Aim for questions that test different facts or concepts related to the topic.
Previously correct answer concepts (texts might be in English or Spanish) for this topic in this session:
{{#each previousCorrectAnswers}}
- "{{this}}"
{{/each}}
{{/if}}

DIFFICULTY GUIDELINES AND ASSESSMENT:
You MUST assess the difficulty of the question you generate and assign it to the 'difficulty' output field. Use the following five levels:
- "very easy": Knowledge typically acquired in primary school. Simple, common facts.
- "easy": Knowledge typically acquired in primary or early secondary school. Common knowledge for most people.
- "medium": Knowledge typically acquired in secondary school or through general cultural awareness. Requires some specific knowledge.
- "hard": Knowledge typically associated with higher education (university level) or specialized interest in a topic.
- "very hard": Knowledge typically associated with advanced degrees (e.g., PhD level) or very deep, niche expertise in a topic.

{{#if targetDifficulty}}
The user has requested a question of "{{targetDifficulty}}" difficulty. Please try to generate a question that matches this level based on the guidelines above. The 'difficulty' field in your output MUST reflect this targetDifficulty.
{{else}}
Please assess the inherent difficulty of the question you generate based on the guidelines above and set the 'difficulty' field in your output accordingly.
{{/if}}

Your response should be a JSON object. The 'question', 'explanation' fields should be objects with 'en' and 'es' properties. The 'answers' field should be an array of 4 objects, where each object has 'en' and 'es' properties.

Example for a single answer object within the 'answers' array: { "en": "Answer A", "es": "Respuesta A" }
Example for the 'question' object: { "en": "What is the capital of France?", "es": "¿Cuál es la capital de Francia?" }

Make sure that only one answer is correct (indicated by correctAnswerIndex).
`;

const generateTriviaQuestionPrompt = ai.definePrompt({
  name: 'generateTriviaQuestionPrompt',
  input: {schema: GenerateTriviaQuestionInputSchema},
  output: {schema: GenerateTriviaQuestionOutputSchema},
  config: {
    temperature: 1.0,
  },
  prompt: promptTemplateString,
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
