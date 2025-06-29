// src/ai/flows/upload-and-store-image.ts
'use server';
/**
 * @fileOverview A Genkit flow to handle uploading an image from a data URI,
 * optionally watermarking it, uploading it to Firebase Storage, and updating a
 * Firestore document with the new URL.
 */

import { ai } from '@/ai/genkit';
import { adminDb, adminStorage } from '@/lib/firebase-admin';
import { 
  UploadAndStoreImageInputSchema,
  UploadAndStoreImageOutputSchema,
  type UploadAndStoreImageInput,
  type UploadAndStoreImageOutput
} from '@/types';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

// Exported wrapper function for client-side usage
export async function uploadAndStoreImage(input: UploadAndStoreImageInput): Promise<UploadAndStoreImageOutput> {
  return uploadAndStoreImageFlow(input);
}

// The Genkit flow definition
const uploadAndStoreImageFlow = ai.defineFlow(
  {
    name: 'uploadAndStoreImageFlow',
    inputSchema: UploadAndStoreImageInputSchema,
    outputSchema: UploadAndStoreImageOutputSchema,
  },
  async ({ questionId, imageDataUri, addWatermark = false }) => {
    console.log(`[uploadAndStoreImageFlow] Starting upload for question ${questionId}`);

    const mimeTypeMatch = imageDataUri.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
    if (!mimeTypeMatch) {
      throw new Error('Invalid data URI format.');
    }

    const mimeType = mimeTypeMatch[1]!;
    const base64Data = imageDataUri.substring(imageDataUri.indexOf(',') + 1);
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const fileExtension = mimeType.split('/')[1] || 'png';

    let imageToUpload = imageBuffer;

    if (addWatermark) {
      try {
        const watermarkPath = path.join(process.cwd(), 'src', 'data', 'watermark.svg');
        const watermarkBuffer = await fs.readFile(watermarkPath);
        console.log(`  -> Applying watermark...`);
        imageToUpload = await sharp(imageToUpload)
            .composite([{
                input: watermarkBuffer,
                gravity: 'southeast',
            }])
            .toBuffer();
      } catch (error) {
        console.error('Could not read or apply watermark file. Proceeding without watermark.', error);
      }
    }

    console.log(`  -> Uploading image to Firebase Storage...`);
    const timestamp = Date.now();
    const filePath = `trivia_images/${questionId}_upload_${timestamp}.${fileExtension}`;
    const file = adminStorage.bucket().file(filePath);
    
    await file.save(imageToUpload, {
        metadata: { contentType: mimeType },
        public: true,
    });
    
    const publicUrl = file.publicUrl();

    await adminDb.collection('predefinedTriviaQuestions').doc(questionId).update({ imageUrl: publicUrl });
    console.log(`  -> Firestore updated for question ${questionId}. URL: ${publicUrl}`);

    return { publicUrl };
  }
);
