
'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating bilingual (English and Spanish) trivia questions.
 * It can generate a single question or a batch of questions.
 * It ensures questions and their correct answers are not repeated within a session/batch, provides explanations, hints,
 * and generates questions of a specified or assessed difficulty level.
 * It accepts detailed category-specific (English-only) and difficulty-specific (English-only) instructions.
 *
 * @interface GenerateTriviaQuestionsInput - Input schema for the generateTriviaQuestions flow.
 * @interface GenerateTriviaQuestionOutput - Output schema for a single trivia question.
 * @function generateTriviaQuestions - The main function to generate one or more trivia questions.
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

const GenerateTriviaQuestionsInputSchema = z.object({
  topic: z.string().describe('The topic for the trivia question. This will be the general theme, e.g., "Science", "Movies".'),
  previousQuestions: z.array(z.string()).optional().describe('A list of question texts (can be in English or Spanish, or a mix if user switched languages) already asked on this topic in the current session, to avoid repetition of the same conceptual question. The AI should consider these as distinct concepts already covered.'),
  previousCorrectAnswers: z.array(z.string()).optional().describe('A list of correct answer texts (can be in English or Spanish) from questions already asked on this topic, to ensure variety in the subject matter. The AI should avoid these concepts as correct answers for the new question.'),
  targetDifficulty: DifficultyLevelSchema.optional().describe('If provided, the AI should attempt to generate a question of this specific difficulty level. If not provided, the AI will assess and assign a difficulty level based on the content and its guidelines.'),
  categoryInstructions: z.string().optional().describe('Detailed English-only instructions for the AI on how to generate questions for this specific category.'),
  difficultySpecificInstruction: z.string().optional().describe('More granular English-only instructions for the AI, specific to the target difficulty level within this category.'),
  count: z.number().min(1).max(1000).optional().default(1).describe('Number of distinct trivia questions to generate. Max 1000. Defaults to 1.')
});
export type GenerateTriviaQuestionsInput = z.infer<typeof GenerateTriviaQuestionsInputSchema>;

// This remains the schema for a SINGLE question.
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

// The flow will output an array of GenerateTriviaQuestionOutput (valid questions)
const GenerateTriviaQuestionsOutputSchema = z.array(GenerateTriviaQuestionOutputSchema);

export async function generateTriviaQuestions(input: GenerateTriviaQuestionsInput): Promise<GenerateTriviaQuestionOutput[]> {
  return generateTriviaQuestionsFlow(input);
}

const promptTemplateString = `You are an expert trivia question generator.
Given a topic, you will generate a specified number of distinct trivia questions. For each question, provide:
- The question text.
- Four possible answer texts.
- The 0-indexed integer for the correct answer.
- A brief explanation (1-2 sentences) of why the correct answer is correct.
- A concise hint (1 short sentence).
- An assessed difficulty level ("easy", "medium", or "hard").

IMPORTANT: You MUST generate all textual content (question, each of the four answers, the explanation, and the hint) in BOTH English (en) and Spanish (es).

Topic: {{{topic}}}
Number of distinct questions to generate: {{{count}}}

{{#if categoryInstructions}}
SPECIFIC ENGLISH-ONLY INSTRUCTIONS FOR THE CATEGORY "{{topic}}":
{{{categoryInstructions}}}
You should prioritize these category-specific instructions when generating the questions.
{{/if}}

{{#if difficultySpecificInstruction}}
SPECIFIC ENGLISH-ONLY INSTRUCTIONS FOR THE TARGETED DIFFICULTY LEVEL:
{{{difficultySpecificInstruction}}}
These difficulty-specific instructions are very important for tailoring the questions appropriately.
{{/if}}

IMPORTANT INSTRUCTIONS FOR QUESTION VARIETY:
1. ALL questions generated in this batch MUST be SIGNIFICANTLY DIFFERENT from each other, exploring unique facts or aspects of the topic.
2. If the topic is broad (e.g., "Geography", "Science", "History", "Chess") and no specific category instructions are given, ensure the questions cover DIFFERENT ASPECTS or SUB-TOPICS. For "Chess", consider aspects like its history, famous players, championships, different openings, common endgames, tactical motifs, in addition to basic rules.
3. Each new question MUST be SIGNIFICANTLY DIFFERENT from any previous questions provided. Avoid asking about the same specific entity or concept even if worded differently or in another language.

{{#if previousQuestions}}
The following question texts (which might be in English or Spanish) have already been asked on this topic. You MUST generate NEW and DIFFERENT questions that explore new facets of the topic. DO NOT repeat or ask very similar questions to any of the following concepts:
{{#each previousQuestions}}
- "{{this}}"
{{/each}}
{{/if}}

{{#if previousCorrectAnswers}}
Furthermore, the correct answer for any new question MUST NOT cover the same concept as any of the following, nor should it be a trivial variation of them, regardless of language. Aim for questions that test different facts or concepts related to the topic.
Previously correct answer concepts (texts might be in English or Spanish) for this topic:
{{#each previousCorrectAnswers}}
- "{{this}}"
{{/each}}
{{/if}}

HINT GUIDELINES (for each question):
- The hint MUST be provided in BOTH English (en) and Spanish (es).
- It should be a single, short, and concise sentence.
- It should guide the user towards the correct answer without explicitly stating it or making it too obvious.
- It should relate to the core subject of the question.

DIFFICULTY GUIDELINES AND ASSESSMENT (for each question):
You MUST assess the difficulty of each question you generate and assign it to its 'difficulty' output field. Use the following three levels:
- "easy": Knowledge typically acquired in primary or early secondary school. Common knowledge.
- "medium": Knowledge typically acquired in secondary school or through general cultural awareness. Requires some specific knowledge.
- "hard": Knowledge typically associated with higher education or specialized interest. Challenging but answerable by someone well-versed.

{{#if targetDifficulty}}
The user has requested questions of "{{targetDifficulty}}" difficulty. Please try to generate questions that match this level based on the guidelines above AND any difficulty-specific instructions provided. Each question's 'difficulty' field in your output MUST reflect this targetDifficulty.
{{else}}
Please assess the inherent difficulty of each question you generate based on the guidelines above AND any difficulty-specific instructions provided, and set the 'difficulty' field in each question's output accordingly.
{{/if}}

Your response should be a JSON object containing a single key "questions_batch", which is an array of question objects. Each question object in the array must conform to the following structure:
{
  "question": { "en": "English Question Text", "es": "Spanish Question Text" },
  "answers": [
    { "en": "Answer A en", "es": "Respuesta A es" },
    { "en": "Answer B en", "es": "Respuesta B es" },
    { "en": "Answer C en", "es": "Respuesta C es" },
    { "en": "Answer D en", "es": "Respuesta D es" }
  ],
  "correctAnswerIndex": 0, // (0-3)
  "explanation": { "en": "English Explanation", "es": "Spanish Explanation" },
  "hint": { "en": "English Hint", "es": "Spanish Hint (optional)" },
  "difficulty": "easy" // or "medium", "hard"
}
Ensure the entire response is a single JSON object like: { "questions_batch": [ {question1_object}, {question2_object}, ... ] }
The number of question objects in the "questions_batch" array SHOULD ideally match the requested "{{count}}", but it is more important that each object is valid.
`;

// Zod schema for the direct output from the LLM: an object with a "questions_batch" field containing an array of unknown items.
const LLMOutputStructureSchema = z.object({
  questions_batch: z.array(z.unknown()), // We will validate each item in the array individually
});

const generateTriviaQuestionsPrompt = ai.definePrompt({
  name: 'generateTriviaQuestionsPrompt',
  input: {schema: GenerateTriviaQuestionsInputSchema},
  output: {schema: LLMOutputStructureSchema}, // Expecting the raw batch structure
  config: {
    temperature: 0.9, // Keep temperature a bit high for creativity in questions
  },
  prompt: promptTemplateString,
});

const generateTriviaQuestionsFlow = ai.defineFlow(
  {
    name: 'generateTriviaQuestionsFlow',
    inputSchema: GenerateTriviaQuestionsInputSchema,
    outputSchema: GenerateTriviaQuestionsOutputSchema, // Flow output is an array of VALID questions
  },
  async (input) => {
    const effectiveInput = { ...input, count: input.count || 1 };

    const {output} = await generateTriviaQuestionsPrompt(effectiveInput);
    
    if (!output || !Array.isArray(output.questions_batch)) {
      console.error('LLM did not return the expected "questions_batch" array structure. Input:', JSON.stringify(effectiveInput), 'LLM Output:', JSON.stringify(output));
      throw new Error('Failed to parse questions array from LLM response.');
    }

    const validQuestions: GenerateTriviaQuestionOutput[] = [];
    let llmReturnedCount = 0;

    if (output.questions_batch) {
      llmReturnedCount = output.questions_batch.length;
      for (let i = 0; i < output.questions_batch.length; i++) {
        const rawQuestion = output.questions_batch[i];
        const parsedQuestion = GenerateTriviaQuestionOutputSchema.safeParse(rawQuestion);

        if (parsedQuestion.success) {
          validQuestions.push(parsedQuestion.data);
        } else {
          console.warn(`[generateTriviaQuestionsFlow] Discarding malformed question object at index ${i} from LLM batch. Errors:`, parsedQuestion.error.flatten().fieldErrors);
          // console.warn(`[generateTriviaQuestionsFlow] Malformed question data:`, JSON.stringify(rawQuestion)); // Uncomment for deep debugging
        }
      }
    }
    
    if (validQuestions.length !== effectiveInput.count) {
      console.warn(`[generateTriviaQuestionsFlow] LLM was asked for ${effectiveInput.count} questions, returned ${llmReturnedCount} raw items, and ${validQuestions.length} were valid. For topic: ${effectiveInput.topic}`);
    }

    return validQuestions;
  }
);
