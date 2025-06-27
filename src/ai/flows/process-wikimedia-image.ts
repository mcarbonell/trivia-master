'use server';
/**
 * @fileOverview A Genkit flow to process a selected Wikimedia image.
 *
 * - processWikimediaImage - A function that downloads, uploads, and updates Firestore.
 */
import admin from 'firebase-admin';
import { ai } from '@/ai/genkit';
import {
  ProcessWikimediaImageInputSchema,
  ProcessWikimediaImageOutputSchema,
  type ProcessWikimediaImageInput,
  type ProcessWikimediaImageOutput
} from '@/types';
import { updatePredefinedQuestion } from '@/services/triviaService';

// Initialize Firebase Admin SDK if not already done
try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  }
} catch (error) {
  console.error('Firebase Admin initialization error in process-wikimedia-image flow.', error);
}

const storageBucket = admin.storage().bucket();

export async function processWikimediaImage(input: ProcessWikimediaImageInput): Promise<ProcessWikimediaImageOutput> {
  return processWikimediaImageFlow(input);
}


const processWikimediaImageFlow = ai.defineFlow(
  {
    name: 'processWikimediaImageFlow',
    inputSchema: ProcessWikimediaImageInputSchema,
    outputSchema: ProcessWikimediaImageOutputSchema,
  },
  async ({ imageUrl, questionId }) => {
    console.log(`[processWikimediaImageFlow] Processing image for question ${questionId} from URL: ${imageUrl}`);
    
    // 1. Download the image from Wikimedia
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
        throw new Error(`Failed to download image. Status: ${imageResponse.status}`);
    }
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    const fileExtension = imageUrl.split('.').pop()?.split('?')[0] || 'jpg';

    // 2. Upload to Firebase Storage
    const filePath = `trivia_images/${questionId}.${fileExtension}`;
    const file = storageBucket.file(filePath);

    await file.save(imageBuffer, {
        metadata: { contentType },
        public: true,
    });

    const publicUrl = file.publicUrl();
    console.log(`[processWikimediaImageFlow] Image uploaded to: ${publicUrl}`);
    
    // 3. Update the Firestore document
    await updatePredefinedQuestion(questionId, { imageUrl: publicUrl });
    console.log(`[processWikimediaImageFlow] Firestore document ${questionId} updated with new imageUrl.`);

    return { publicUrl };
  }
);
