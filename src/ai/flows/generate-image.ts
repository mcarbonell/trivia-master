'use server';
/**
 * @fileOverview A Genkit flow to generate an image from a text prompt.
 * 
 * - generateImage - A function that takes a text prompt and returns image data.
 * - GenerateImageInput - The input type for the generateImage function.
 * - GenerateImageOutput - The return type for the generateImage function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const GenerateImageInputSchema = z.string().describe('A detailed prompt for a text-to-image model.');
export type GenerateImageInput = z.infer<typeof GenerateImageInputSchema>;

// The output is the full data URI from the model
const GenerateImageOutputSchema = z.string().describe("A data URI representing the generated image, e.g., 'data:image/png;base64,...'");
export type GenerateImageOutput = z.infer<typeof GenerateImageOutputSchema>;

export async function generateImage(prompt: GenerateImageInput): Promise<GenerateImageOutput> {
  return generateImageFlow(prompt);
}

const generateImageFlow = ai.defineFlow(
  {
    name: 'generateImageFlow',
    inputSchema: GenerateImageInputSchema,
    outputSchema: GenerateImageOutputSchema,
  },
  async (prompt) => {
    // Prompt Engineering: Prepend a hint about the desired aspect ratio.
    const engineeredPrompt = `A widescreen, 16:9 aspect ratio, landscape-orientation image of: ${prompt}`;
    console.log(`[generateImageFlow] Generating image with engineered prompt: "${engineeredPrompt}"`);

    const { media, text } = await ai.generate({
      model: 'googleai/gemini-2.0-flash-preview-image-generation',
      prompt: engineeredPrompt,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });
    
    if (!media || !media.url) {
      console.error('[generateImageFlow] AI did not return image media. Text response:', text);
      throw new Error('Image generation failed: No media returned from AI.');
    }

    // The URL is the data URI string
    return media.url;
  }
);
