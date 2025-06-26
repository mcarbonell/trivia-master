
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
  isVisual: z.boolean().optional().describe('Whether the questions should be visual, requiring an image prompt.'),
  modelName: z.string().optional().describe('Optional Genkit model name to use for generation (e.g., googleai/gemini-1.5-pro).')
});
export type GenerateTriviaQuestionsInput = z.infer<typeof GenerateTriviaQuestionsInputSchema>;

// This remains the schema for a SINGLE question.
const GenerateTriviaQuestionOutputSchema = z.object({
  question: BilingualTextSchema.describe('The trivia question in English and Spanish.'),
  correctAnswer: BilingualAnswerSchema.describe('The single correct answer to the question, in English and Spanish.'),
  distractors: z.array(BilingualAnswerSchema).length(3).describe('Three plausible but incorrect answers (distractors), each in English and Spanish.'),
  explanation: BilingualTextSchema.describe('A brief explanation (1-2 sentences) of why the correct answer is correct, in English and Spanish.'),
  hint: BilingualTextSchema.describe('A concise hint (1 short sentence) to help the user deduce the answer without revealing it directly, in English and Spanish.'),
  difficulty: DifficultyLevelSchema,
  imagePrompt: z.string().optional().describe('A detailed, English-only prompt for a text-to-image model to generate a relevant image.'),
  imageUrl: z.string().optional().describe('The URL of the generated image. Should be left empty by this flow.'),
});
export type GenerateTriviaQuestionOutput = z.infer<typeof GenerateTriviaQuestionOutputSchema>;

// The prompt output schema is now an array of the single question output schema.
const ValidatedQuestionsArraySchema = z.array(GenerateTriviaQuestionOutputSchema);


export async function generateTriviaQuestions(input: GenerateTriviaQuestionsInput): Promise<GenerateTriviaQuestionOutput[]> {
  return generateTriviaQuestionsFlow(input);
}

const promptTemplateString = `You are an expert trivia question generator. Given a topic, you will generate a trivia question, ONE correct answer, THREE plausible but incorrect "distractor" answers, an explanation, a hint, and difficulty.

IMPORTANT: You MUST generate all textual content (question, the correct answer, each of the three distractors, the explanation, and the hint) in BOTH English (en) and Spanish (es).

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

{{#if isVisual}}
This is a VISUAL category. For each question, you MUST also generate an 'imagePrompt'.
IMAGE PROMPT GUIDELINES:
- The 'imagePrompt' MUST be a detailed, descriptive, and unambiguous prompt in ENGLISH for a text-to-image AI model (like DALL-E or Midjourney). It should imply a **widescreen, landscape orientation**.
- It should describe a photorealistic or artistic image that visually represents the subject of the question without giving away the answer in the image itself.
- For accuracy, the prompt can and should contain the name of the subject. Example for 'Lion': 'A photorealistic, close-up shot of an African Lion, resting on a rock under the African sun, landscape orientation.'
- The image itself should not contain text.
- The 'imageUrl' field should be left empty.
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
  "correctAnswer": { "en": "Correct Answer en", "es": "Respuesta Correcta es" },
  "distractors": [
    { "en": "Distractor A en", "es": "Distractor A es" },
    { "en": "Distractor B en", "es": "Distractor B es" },
    { "en": "Distractor C en", "es": "Distractor C es" }
  ],
  "explanation": { "en": "English Explanation", "es": "Spanish Explanation" },
  "hint": { "en": "English Hint", "es": "Spanish Hint" },
  "difficulty": "easy",
  "imagePrompt": "A detailed English prompt for an image AI. (Omit if not a visual category)"
}
Ensure the entire response is a single JSON string like: "[ {question1_object}, {question2_object}, ... ]"

Example for the 'question' object: { "en": "What is the capital of France?", "es": "¿Cuál es la capital de Francia?" }
Example for 'correctAnswer': { "en": "Paris", "es": "París" }
Example for 'distractors': [ { "en": "London", "es": "Londres" }, { "en": "Berlin", "es": "Berlín" }, { "en": "Rome", "es": "Roma" } ]
The number of question objects in the JSON array string SHOULD ideally match the requested "{{count}}", but it is more important that each object is valid.
`;

const generateTriviaQuestionsPrompt = ai.definePrompt({
  name: 'generateTriviaQuestionsPrompt',
  input: {schema: GenerateTriviaQuestionsInputSchema},
  output: {schema: ValidatedQuestionsArraySchema}, // Output schema is an array of valid question objects
  config: {
    temperature: 1,
  },
  prompt: promptTemplateString,
});

const generateTriviaQuestionsFlow = ai.defineFlow(
  {
    name: 'generateTriviaQuestionsFlow',
    inputSchema: GenerateTriviaQuestionsInputSchema,
    // No outputSchema here, allowing us to do granular validation
  },
  async (input) => {
    const effectiveInput = { ...input, count: input.count || 1 };

    let llmOutputArray: any[] | null = null;

    try {
      // The prompt's output is strictly validated by Genkit against ValidatedQuestionsArraySchema
      const { output } = await generateTriviaQuestionsPrompt(
        effectiveInput,
        effectiveInput.modelName ? { model: effectiveInput.modelName } : undefined // Pass modelName string directly
      );
      llmOutputArray = output; // If successful, 'output' is the validated array
      console.log(`[generateTriviaQuestionsFlow] Prompt call successful, Genkit validated ${llmOutputArray?.length || 0} items against schema.`);

    } catch (error: any) {
      console.warn(`[generateTriviaQuestionsFlow] Genkit prompt validation failed for the batch. Attempting to parse raw data from error. Error: ${error.name} - ${error.message}`);
      if (error.name === 'GenkitError' && error.status === 'INVALID_ARGUMENT') {
        // Attempt to get raw data from error.detail.data or error.detail.input
        const rawDataFromErrorDetail = error.detail?.data ?? error.detail?.input;

        if (Array.isArray(rawDataFromErrorDetail)) {
          console.log(`[generateTriviaQuestionsFlow] Successfully extracted raw array of ${rawDataFromErrorDetail.length} items from GenkitError details.`);
          llmOutputArray = rawDataFromErrorDetail;
        } else {
          // Fallback: attempt to parse from error.message
          const message = error.message || '';
          const providedDataMatch = message.match(/Provided data:\s*(\[[\s\S]*?\](?=\s*Required JSON schema:|$))/s);
          if (providedDataMatch && providedDataMatch[1]) {
            try {
              llmOutputArray = JSON.parse(providedDataMatch[1]);
              console.log(`[generateTriviaQuestionsFlow] Successfully parsed raw array of ${llmOutputArray?.length || 0} items from error message string.`);
            } catch (parseError: any) {
              console.error(`[generateTriviaQuestionsFlow] Failed to parse JSON from error message. ParseError: ${parseError.message}`);
            }
          } else {
            console.warn(`[generateTriviaQuestionsFlow] Could not extract raw data array from GenkitError details or message.`);
          }
        }
      } else {
        console.error(`[generateTriviaQuestionsFlow] Non-validation error during prompt execution:`, error);
        return [];
      }
    }

    if (llmOutputArray === null) {
      console.warn('[generateTriviaQuestionsFlow] LLM returned or resulted in null/unparseable output for the batch. Topic:', effectiveInput.topic);
      return [];
    }
    
    if (!Array.isArray(llmOutputArray)) {
      console.error('[generateTriviaQuestionsFlow] Processed LLM output is not an array. Output data:', llmOutputArray);
      return []; 
    }
    
    const validQuestions: GenerateTriviaQuestionOutput[] = [];
    const llmReturnedCount = llmOutputArray.length;

    for (let i = 0; i < llmOutputArray.length; i++) {
      const rawQuestion = llmOutputArray[i];
      const parsedQuestion = GenerateTriviaQuestionOutputSchema.safeParse(rawQuestion);

      if (parsedQuestion.success) {
        validQuestions.push(parsedQuestion.data);
      } else {
        console.warn(`[generateTriviaQuestionsFlow] Discarding malformed question object at index ${i} from LLM batch. Errors:`, parsedQuestion.error.flatten().fieldErrors);
        // console.warn(`[generateTriviaQuestionsFlow] Malformed question data for index ${i}:`, JSON.stringify(rawQuestion)); // Can be very verbose
      }
    }

    const requestedCount = effectiveInput.count || 1;
    if (validQuestions.length !== requestedCount && llmReturnedCount >= requestedCount) {
      console.warn(`[generateTriviaQuestionsFlow] LLM was asked for ${requestedCount} questions, JSON string contained ${llmReturnedCount} raw items, and ${validQuestions.length} were valid. This means ${llmReturnedCount - validQuestions.length} items failed individual validation. For topic: ${effectiveInput.topic}`);
    } else if (llmReturnedCount < requestedCount) {
      console.warn(`[generateTriviaQuestionsFlow] LLM was asked for ${requestedCount} questions, JSON string contained ${llmReturnedCount} raw items, of which ${validQuestions.length} were valid. For topic: ${effectiveInput.topic}`);
    }
    
    return validQuestions;
  }
);
