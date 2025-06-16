
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
  count: z.number().min(1).max(1000).optional().default(1).describe('Number of distinct trivia questions to generate. Max 1000. Defaults to 1.'),
  modelName: z.string().optional().describe('Optional Genkit model name to use for generation (e.g., googleai/gemini-1.5-pro).')
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
  hint: BilingualTextSchema.describe('A concise hint (1 short sentence) to help the user deduce the answer without revealing it directly, in English and Spanish.'),
  difficulty: DifficultyLevelSchema,
});
export type GenerateTriviaQuestionOutput = z.infer<typeof GenerateTriviaQuestionOutputSchema>;

// The flow will output an array of GenerateTriviaQuestionOutput (valid questions)
// This schema is used for internal validation within the flow, not for the prompt's direct output.
const ValidatedQuestionsArraySchema = z.array(GenerateTriviaQuestionOutputSchema);


export async function generateTriviaQuestions(input: GenerateTriviaQuestionsInput): Promise<GenerateTriviaQuestionOutput[]> {
  return generateTriviaQuestionsFlow(input);
}

const promptTemplateString = `You are an expert trivia question generator. Given a topic, you will generate a trivia question, four possible answers, indicate the index of the correct answer, provide a brief explanation for the correct answer, a concise hint, and assess its difficulty level.

IMPORTANT: You MUST generate all textual content (question, each of the four answers, the explanation, and the hint) in BOTH English (en) and Spanish (es).

Your response MUST be a valid JSON string that represents an array of question objects.

Topic: {{{topic}}}
Number of distinct questions to generate: {{{count}}}

{{#if categoryInstructions}}
SPECIFIC INSTRUCTIONS FOR THE CATEGORY "{{topic}}":
{{{categoryInstructions}}}
You should prioritize these category-specific instructions when generating the questions.
{{/if}}

{{#if difficultySpecificInstruction}}
SPECIFIC INSTRUCTIONS FOR THE TARGETED DIFFICULTY LEVEL:
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
- "easy": Knowledge typically acquired in primary or early secondary school. Common knowledge for most people.
- "medium": Knowledge typically acquired in secondary school or through general cultural awareness. Requires some specific knowledge.
- "hard": Knowledge typically associated with higher education or specialized interest. Questions at this level should be challenging but answerable by someone well-versed in the subject.

{{#if targetDifficulty}}
The user has requested questions of "{{targetDifficulty}}" difficulty. Please try to generate questions that match this level based on the guidelines above AND any difficulty-specific instructions provided. Each question's 'difficulty' field in your output MUST reflect this targetDifficulty.
{{else}}
Please assess the inherent difficulty of each question you generate based on the guidelines above AND any difficulty-specific instructions provided, and set the 'difficulty' field in each question's output accordingly.
{{/if}}

Each question object in the array must conform to the following structure:
{
  "question": { "en": "English Question Text", "es": "Spanish Question Text" },
  "answers": [
    { "en": "Answer A en", "es": "Respuesta A es" },
    { "en": "Answer B en", "es": "Respuesta B es" },
    { "en": "Answer C en", "es": "Respuesta C es" },
    { "en": "Answer D en", "es": "Respuesta D es" }
  ],
  "correctAnswerIndex": 0,
  "explanation": { "en": "English Explanation", "es": "Spanish Explanation" },
  "hint": { "en": "English Hint", "es": "Spanish Hint (optional)" },
  "difficulty": "easy"
}
Ensure the entire response is a single JSON string like: "[ {question1_object}, {question2_object}, ... ]"

Example for the 'question' object: { "en": "What is the capital of France?", "es": "¿Cuál es la capital de Francia?" }
Example for a single answer object within the 'answers' array: { "en": "Paris", "es": "París" }
Example for the 'hint' object: { "en": "It's a famous European city known for a tall iron tower.", "es": "Es una famosa ciudad europea conocida por una alta torre de hierro." }

Make sure that only one answer is correct (indicated by correctAnswerIndex).

The number of question objects in the JSON array string SHOULD ideally match the requested "{{count}}", but it is more important that each object is valid.
`;

const generateTriviaQuestionsPrompt = ai.definePrompt({
  name: 'generateTriviaQuestionsPrompt',
  input: {schema: GenerateTriviaQuestionsInputSchema},
  // The prompt now outputs a JSON string, or null if the LLM fails.
  output: {schema: z.string().nullable().describe("A JSON string representing an array of trivia question objects, or null.")},
  config: {
    temperature: 1,
  },
  prompt: promptTemplateString,
});

const generateTriviaQuestionsFlow = ai.defineFlow(
  {
    name: 'generateTriviaQuestionsFlow',
    inputSchema: GenerateTriviaQuestionsInputSchema,
    // The flow's final output is still an array of valid questions.
    outputSchema: ValidatedQuestionsArraySchema,
  },
  async (input) => {
    const effectiveInput = { ...input, count: input.count || 1 };
    // console.log('[generateTriviaQuestionsFlow] Input received:', JSON.stringify(effectiveInput, null, 2)); // Verbose log, can be enabled if needed
    console.log('[generateTriviaQuestionsFlow] Checking ai object and ai.model method. Type of ai.model:', typeof ai.model);

    // The prompt's output is now expected to be a JSON string or null.
    const {output: jsonStringOutput} = await generateTriviaQuestionsPrompt(
        effectiveInput,
        effectiveInput.modelName ? { model: effectiveInput.modelName } : undefined // Pass modelName string directly
      );

    if (jsonStringOutput === null) {
      console.warn('[generateTriviaQuestionsFlow] LLM returned null. This might be due to safety filters or inability to generate content for the request. Topic:', effectiveInput.topic);
      return [];
    }
    
    if (typeof jsonStringOutput !== 'string') {
      console.error('[generateTriviaQuestionsFlow] LLM did not return a JSON string or null as expected. Output type:', typeof jsonStringOutput, "Output:", jsonStringOutput);
      return []; 
    }
    
    let parsedJsonArray: any[];
    try {
      parsedJsonArray = JSON.parse(jsonStringOutput);
    } catch (parseError) {
      console.error('[generateTriviaQuestionsFlow] Failed to parse JSON string from LLM. String:', jsonStringOutput, 'Error:', parseError);
      return []; 
    }

    if (!Array.isArray(parsedJsonArray)) {
      console.error('[generateTriviaQuestionsFlow] Parsed JSON is not an array. Parsed data:', parsedJsonArray);
      return []; 
    }
    
    const validQuestions: GenerateTriviaQuestionOutput[] = [];
    let llmReturnedCount = parsedJsonArray.length;

    for (let i = 0; i < parsedJsonArray.length; i++) {
      const rawQuestion = parsedJsonArray[i];
      // Validate each individual question object
      const parsedQuestion = GenerateTriviaQuestionOutputSchema.safeParse(rawQuestion);

      if (parsedQuestion.success) {
        validQuestions.push(parsedQuestion.data);
      } else {
        console.warn(`[generateTriviaQuestionsFlow] Discarding malformed question object at index ${i} from LLM batch. Errors:`, parsedQuestion.error.flatten().fieldErrors);
        console.warn(`[generateTriviaQuestionsFlow] Malformed question data:`, JSON.stringify(rawQuestion));
      }
    }

    if (validQuestions.length !== effectiveInput.count && llmReturnedCount >= effectiveInput.count) {
      console.warn(`[generateTriviaQuestionsFlow] LLM was asked for ${effectiveInput.count} questions, JSON string contained ${llmReturnedCount} raw items, and ${validQuestions.length} were valid. This means ${llmReturnedCount - validQuestions.length} items failed individual validation. For topic: ${effectiveInput.topic}`);
    } else if (llmReturnedCount < effectiveInput.count) {
      console.warn(`[generateTriviaQuestionsFlow] LLM was asked for ${effectiveInput.count} questions, JSON string contained ${llmReturnedCount} raw items, of which ${validQuestions.length} were valid. For topic: ${effectiveInput.topic}`);
    }
    
    return validQuestions;
  }
);

