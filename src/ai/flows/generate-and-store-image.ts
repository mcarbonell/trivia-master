// src/ai/flows/generate-and-store-image.ts
'use server';
/**
 * @fileOverview A Genkit flow to generate an image from a prompt, watermark it,
 * upload it to storage, and save the URL to a Firestore document.
 *
 * - generateAndStoreImage - A function that orchestrates the image generation and storage process.
 */

import { ai } from '@/ai/genkit';
import { adminDb, adminStorage } from '@/lib/firebase-admin';
import { 
  GenerateAndStoreImageInputSchema, 
  GenerateAndStoreImageOutputSchema, 
  type GenerateAndStoreImageInput,
  type GenerateAndStoreImageOutput
} from '@/types';
import { getScriptSettings } from '@/services/settingsService';
import sharp from 'sharp';

// Watermark SVG from populate-firestore-images.ts
const watermarkSvg = `
<svg width="400" height="60" xmlns="http://www.w3.org/2000/svg">
    <style>
        .title { 
            fill: rgba(255, 255, 255, 0.6); 
            font-size: 22px; 
            font-weight: bold; 
            font-family: sans-serif;
            paint-order: stroke;
            stroke: rgba(0, 0, 0, 0.4);
            stroke-width: 1px;
        }
    </style>
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" class="title">AI Trivia Master</text>
</svg>
`;
const watermarkBuffer = Buffer.from(watermarkSvg);

// Image generation helper function adapted from populate-firestore-images.ts
async function generateImageFromAI(prompt: string, modelName: string): Promise<{ buffer: Buffer; contentType: string; extension: string; } | null> {
  console.log(`[generateImageFromAI] Generating image with prompt: "${prompt}" using model: "${modelName}"`);

  let mediaUrl: string | undefined;
  let textResponse: string | undefined;

  if (modelName.includes('imagen')) {
    const response = await ai.generate({
      model: modelName,
      output: { format: 'media' },
      prompt: prompt,
      config: { numberOfImages: 1, aspectRatio: '16:9' },
    });
    mediaUrl = response.media?.url;
    textResponse = response.text;
  } else {
    const engineeredPrompt = `A widescreen, 16:9 aspect ratio, landscape-orientation image of: ${prompt}`;
    const { media, text } = await ai.generate({
      model: modelName,
      prompt: engineeredPrompt,
      config: { responseModalities: ['TEXT', 'IMAGE'] },
    });
    mediaUrl = media?.url;
    textResponse = text;
  }
    
  if (!mediaUrl) {
    console.error(`[generateImageFromAI] AI did not return image media. Text response:`, textResponse);
    return null;
  }

  const imageDataUri = mediaUrl;
  const mimeType = imageDataUri.substring(imageDataUri.indexOf(':') + 1, imageDataUri.indexOf(';'));
  const base64Data = imageDataUri.substring(imageDataUri.indexOf(',') + 1);
  const imageBuffer = Buffer.from(base64Data, 'base64');
  const fileExtension = mimeType.split('/')[1] || 'png';
  
  return {
    buffer: imageBuffer,
    contentType: mimeType,
    extension: fileExtension,
  };
}


// Exported wrapper function for client-side usage
export async function generateAndStoreImage(input: GenerateAndStoreImageInput): Promise<GenerateAndStoreImageOutput> {
  return generateAndStoreImageFlow(input);
}


// The Genkit flow definition
const generateAndStoreImageFlow = ai.defineFlow(
  {
    name: 'generateAndStoreImageFlow',
    inputSchema: GenerateAndStoreImageInputSchema,
    outputSchema: GenerateAndStoreImageOutputSchema,
  },
  async ({ questionId, prompt, model }) => {
    console.log(`[generateAndStoreImageFlow] Starting generation for question ${questionId}`);
    
    const settings = await getScriptSettings();
    const modelToUse = model || settings.populateImages.defaultImageModel;

    const imageResult = await generateImageFromAI(prompt, modelToUse);

    if (!imageResult) {
      throw new Error('Failed to generate image from AI.');
    }

    console.log(`  -> Applying watermark...`);
    const watermarkedBuffer = await sharp(imageResult.buffer)
        .composite([{
            input: watermarkBuffer,
            gravity: 'southeast',
        }])
        .toBuffer();

    console.log(`  -> Uploading watermarked image to Firebase Storage...`);
    const timestamp = Date.now();
    const filePath = `trivia_images/${questionId}_${timestamp}.${imageResult.extension}`;
    const file = adminStorage.bucket().file(filePath);
    
    await file.save(watermarkedBuffer, {
        metadata: { contentType: imageResult.contentType },
        public: true,
    });
    
    const publicUrl = file.publicUrl();

    await adminDb.collection('predefinedTriviaQuestions').doc(questionId).update({ imageUrl: publicUrl });
    console.log(`  -> Firestore updated for question ${questionId}. URL: ${publicUrl}`);

    return { publicUrl };
  }
);
