
'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating bilingual (English and Spanish) trivia questions.
 * It ensures questions and their correct answers are not repeated within a session, provides explanations, hints,
 * and generates questions of a specified or assessed difficulty level.
 * It can now accept detailed category-specific (English-only) and difficulty-specific (English-only) instructions to guide generation.
 *
 * @interface GenerateTriviaQuestionInput - Input schema for the generateTriviaQuestion flow.
 * @interface GenerateTriviaQuestionOutput - Output schema for the generateTriviaQuestion flow.
 * @function generateTriviaQuestion - The main function to generate a trivia question.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DifficultyLevelSchema = z.enum([
  "easy",
  "medium",
  "hard"
]).describe("The assessed or targeted difficulty level of the question.");
export type DifficultyLevel = z.infer<typeof DifficultyLevelSchema>;

const BilingualTextSchema = z.object({
  en: z.string().describe('English version of the text.'),
  es: z.string().describe('Spanish version of the text.'),
});
export type BilingualText = z.infer<typeof BilingualTextSchema>;


const BilingualAnswerSchema = z.object({
  en: z.string().describe('English version of the answer.'),
  es: z.string().describe('Spanish version of the answer.'),
});

const GenerateTriviaQuestionInputSchema = z.object({
  topic: z.string().describe('The topic for the trivia question. This will be the general theme, e.g., "Science", "Movies".'),
  previousQuestions: z.array(z.string()).optional().describe('A list of question texts (can be in English or Spanish, or a mix if user switched languages) already asked on this topic in the current session, to avoid repetition of the same conceptual question. The AI should consider these as distinct concepts already covered.'),
  previousCorrectAnswers: z.array(z.string()).optional().describe('A list of correct answer texts (can be in English or Spanish) from questions already asked on this topic, to ensure variety in the subject matter. The AI should avoid these concepts as correct answers for the new question.'),
  targetDifficulty: DifficultyLevelSchema.optional().describe('If provided, the AI should attempt to generate a question of this specific difficulty level. If not provided, the AI will assess and assign a difficulty level based on the content and its guidelines.'),
  categoryInstructions: z.string().optional().describe('Detailed English-only instructions for the AI on how to generate questions for this specific category.'),
  difficultySpecificInstruction: z.string().optional().describe('More granular English-only instructions for the AI, specific to the target difficulty level within this category.')
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
  hint: BilingualTextSchema.optional().describe('A concise hint (1 short sentence) to help the user deduce the answer without revealing it directly, in English and Spanish.'),
  difficulty: DifficultyLevelSchema,
});
export type GenerateTriviaQuestionOutput = z.infer<typeof GenerateTriviaQuestionOutputSchema>;

export async function generateTriviaQuestion(input: GenerateTriviaQuestionInput): Promise<GenerateTriviaQuestionOutput> {
  return generateTriviaQuestionFlow(input);
}

const promptTemplateString = `You are an expert trivia question generator. Given a topic, you will generate a trivia question, four possible answers, indicate the index of the correct answer, provide a brief explanation for the correct answer, a concise hint, and assess its difficulty level.

IMPORTANT: You MUST generate all textual content (question, each of the four answers, the explanation, and the hint) in BOTH English (en) and Spanish (es).

Topic: {{{topic}}}

{{#if categoryInstructions}}
SPECIFIC ENGLISH-ONLY INSTRUCTIONS FOR THE CATEGORY "{{topic}}":
{{{categoryInstructions}}}
You should prioritize these category-specific instructions when generating the question.
{{/if}}

{{#if difficultySpecificInstruction}}
SPECIFIC ENGLISH-ONLY INSTRUCTIONS FOR THE TARGETED DIFFICULTY LEVEL:
{{{difficultySpecificInstruction}}}
These difficulty-specific instructions are very important for tailoring the question appropriately.
{{/if}}

IMPORTANT INSTRUCTIONS FOR QUESTION VARIETY:
1. If the topic is broad (e.g., "Geography", "Science", "History", "Chess") and no specific category instructions are given, ensure the questions cover DIFFERENT ASPECTS or SUB-TOPICS. For "Chess", consider aspects like its history, famous players, championships, different openings, common endgames, tactical motifs, in addition to basic rules.
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

HINT GUIDELINES:
- The hint MUST be provided in BOTH English (en) and Spanish (es).
- It should be a single, short, and concise sentence.
- It should guide the user towards the correct answer without explicitly stating it or making it too obvious.
- It should relate to the core subject of the question.

DIFFICULTY GUIDELINES AND ASSESSMENT:
You MUST assess the difficulty of the question you generate and assign it to the 'difficulty' output field. Use the following three levels:
- "easy": Knowledge typically acquired in primary or early secondary school (e.g., 'What is the capital of France?'). Common knowledge for most people.
- "medium": Knowledge typically acquired in secondary school or through general cultural awareness (e.g., 'Who painted the Mona Lisa?'). Requires some specific knowledge.
- "hard": Knowledge typically associated with higher education (university level) or specialized interest in a topic (e.g., 'What is the Chandrasekhar limit?'). Questions at this level should be challenging but answerable by someone well-versed in the subject.

{{#if targetDifficulty}}
The user has requested a question of "{{targetDifficulty}}" difficulty. Please try to generate a question that matches this level based on the guidelines above AND any difficulty-specific instructions provided. The 'difficulty' field in your output MUST reflect this targetDifficulty.
{{else}}
Please assess the inherent difficulty of the question you generate based on the guidelines above AND any difficulty-specific instructions provided, and set the 'difficulty' field in your output accordingly.
{{/if}}

Your response should be a JSON object. The 'question', 'explanation', and 'hint' fields should be objects with 'en' and 'es' properties. The 'answers' field should be an array of 4 objects, where each object has 'en' and 'es' properties.

Example for a single answer object within the 'answers' array: { "en": "Answer A", "es": "Respuesta A" }
Example for the 'question' object: { "en": "What is the capital of France?", "es": "¿Cuál es la capital de Francia?" }
Example for the 'hint' object: { "en": "It's a famous European city known for a tall iron tower.", "es": "Es una famosa ciudad europea conocida por una alta torre de hierro." }

Make sure that only one answer is correct (indicated by correctAnswerIndex).
`;

const generateTriviaQuestionPrompt = ai.definePrompt({
  name: 'generateTriviaQuestionPrompt',
  input: {schema: GenerateTriviaQuestionInputSchema},
  output: {schema: GenerateTriviaQuestionOutputSchema},
  config: {
    temperature: 0.9, 
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
