
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import admin from 'firebase-admin';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { generateImage } from '../src/ai/flows/generate-image';

// Initialize Firebase Admin SDK
try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      // Add your storageBucket URL here if it's not automatically detected
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  }
} catch (error) {
  console.error('Firebase Admin initialization error. Make sure GOOGLE_APPLICATION_CREDENTIALS is set and the storage bucket is correct.', error);
  process.exit(1);
}

const db = admin.firestore();
const bucket = admin.storage().bucket();
const PREDEFINED_QUESTIONS_COLLECTION = 'predefinedTriviaQuestions';

// --- Argument Parsing with yargs ---
const argv = yargs(hideBin(process.argv))
  .option('category', {
    alias: 'c',
    type: 'string',
    description: 'TopicValue of the specific category to process.',
  })
  .option('limit', {
    alias: 'l',
    type: 'number',
    default: 10,
    description: 'Maximum number of images to generate in this run.',
  })
  .option('delay', {
    alias: 'd',
    type: 'number',
    default: 2000,
    description: 'Delay in milliseconds between API calls.',
  })
  .help()
  .alias('help', 'h')
  .parseSync();


async function populateImages() {
  const { category, limit, delay } = argv;

  console.log(`Starting image population script...`);
  console.log(`--- Configuration ---`);
  console.log(`Target Category: ${category || 'All Categories'}`);
  console.log(`Max Images to Generate: ${limit}`);
  console.log(`Delay between calls: ${delay}ms`);
  console.log(`---------------------`);

  try {
    let query: admin.firestore.Query = db.collection(PREDEFINED_QUESTIONS_COLLECTION)
      .where('imagePrompt', '>', ''); // Query for docs where imagePrompt exists and is not empty

    if (category) {
      query = query.where('topicValue', '==', category);
    }
    
    const snapshot = await query.get();
    
    // Filter in code for documents that do not have an imageUrl
    const questionsToProcess = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as any))
      .filter(q => q.imagePrompt && !q.imageUrl);

    if (questionsToProcess.length === 0) {
      console.log("No questions found needing image generation for the selected criteria.");
      return;
    }

    console.log(`Found ${questionsToProcess.length} questions with prompts but no images.`);
    const limitedQuestions = questionsToProcess.slice(0, limit);
    console.log(`Processing up to ${limitedQuestions.length} questions in this run.`);

    let successCount = 0;
    let errorCount = 0;

    for (const question of limitedQuestions) {
      console.log(`\n[${successCount + errorCount + 1}/${limitedQuestions.length}] Processing question ID: ${question.id}`);
      console.log(`  Prompt: "${question.imagePrompt}"`);

      try {
        // 1. Generate image data URI using the Genkit flow
        const imageDataUri = await generateImage(question.imagePrompt);

        // 2. Parse data URI and create a buffer
        const mimeType = imageDataUri.substring(imageDataUri.indexOf(':') + 1, imageDataUri.indexOf(';'));
        const base64Data = imageDataUri.substring(imageDataUri.indexOf(',') + 1);
        const imageBuffer = Buffer.from(base64Data, 'base64');
        const fileExtension = mimeType.split('/')[1] || 'png';
        
        // 3. Upload to Firebase Storage
        const filePath = `trivia_images/${question.id}.${fileExtension}`;
        const file = bucket.file(filePath);

        await file.save(imageBuffer, {
          metadata: { contentType: mimeType },
          public: true, // Make the file publicly accessible
        });

        // 4. Get the public URL
        const publicUrl = file.publicUrl();
        console.log(`  -> Image uploaded to: ${publicUrl}`);

        // 5. Update Firestore document with the new URL using the admin SDK
        await db.collection(PREDEFINED_QUESTIONS_COLLECTION).doc(question.id).update({ imageUrl: publicUrl });
        console.log(`  -> Firestore updated for question ${question.id}.`);
        successCount++;

      } catch (genError) {
        console.error(`  -> ERROR processing question ${question.id}:`, genError);
        errorCount++;
      }
      
      // Wait before the next call to avoid hitting rate limits
      if (limitedQuestions.indexOf(question) < limitedQuestions.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    console.log(`\n--- Script Finished ---`);
    console.log(`Successfully generated and uploaded ${successCount} images.`);
    console.log(`Failed to process ${errorCount} images.`);
    
  } catch (error) {
    console.error("An unexpected error occurred during the script execution:", error);
  }
}

populateImages().catch(error => {
  console.error("Unhandled fatal error in populateImages script:", error);
  process.exit(1);
});
