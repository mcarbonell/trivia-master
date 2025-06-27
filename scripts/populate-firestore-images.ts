
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import admin from 'firebase-admin';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { generateImage } from '../src/ai/flows/generate-image';
import type { PredefinedQuestion } from '../src/services/triviaService';

// Initialize Firebase Admin SDK
try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
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
  .option('force', {
    alias: 'f',
    type: 'boolean',
    default: false,
    description: 'Force regeneration of images even if they already exist.',
  })
  .help()
  .alias('help', 'h')
  .parseSync();


async function fetchImageFromWikimedia(question: PredefinedQuestion): Promise<string | null> {
  if (!question.artworkTitle || !question.artworkAuthor) {
    console.warn(`  [Wikimedia] Skipping question ID ${question.id}: Missing artworkTitle or artworkAuthor.`);
    return null;
  }
  
  // Construct a more precise search term with quotes for better accuracy
  const searchTerm = `"${question.artworkTitle}" "${question.artworkAuthor}"`;
  console.log(`  [Wikimedia] Searching for: ${searchTerm}`);

  // 1. Find the file page using the more powerful 'query' action with 'list=search'
  const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTerm)}&srnamespace=6&format=json&srlimit=1&origin=*`;
  
  const searchResponse = await fetch(searchUrl);
  if (!searchResponse.ok) {
    console.warn(`  [Wikimedia] Search request failed with status: ${searchResponse.status}`);
    return null;
  }
  const searchResult = await searchResponse.json();
  const pageTitle = searchResult?.query?.search?.[0]?.title;


  if (!pageTitle) {
    console.warn(`  [Wikimedia] No file page found for search term "${searchTerm}".`);
    return null;
  }
  console.log(`  [Wikimedia] Found page: "${pageTitle}"`);

  // 2. Get image info and license from the page title
  const infoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&format=json&origin=*`;
  const infoResponse = await fetch(infoUrl);
  if (!infoResponse.ok) {
    console.warn(`  [Wikimedia] Image info request failed with status: ${infoResponse.status}`);
    return null;
  }
  const infoResult = await infoResponse.json();
  const pages = infoResult.query.pages;
  const pageId = Object.keys(pages)[0];
  const imageInfo = pages[pageId]?.imageinfo?.[0];
  const extMetadata = imageInfo?.extmetadata;

  if (!imageInfo || !extMetadata) {
    console.warn(`  [Wikimedia] Could not extract image info or metadata for page "${pageTitle}".`);
    return null;
  }

  // 3. Validate license - very basic check for "public domain"
  // const licenseText = JSON.stringify(extMetadata.License).toLowerCase();
  const licenseText = JSON.stringify(extMetadata.LicenseShortName?.value || 'Unknown').toLowerCase();
  if (!licenseText.includes('public domain')) {
    console.warn(`  [Wikimedia] License for "${pageTitle}" is not confirmed as Public Domain. Skipping. License: ${extMetadata.LicenseShortName?.value || 'Unknown'}`);
    return null;
  }
  console.log(`  [Wikimedia] License confirmed as Public Domain.`);
  
  // 4. Download image buffer
  const imageUrl = imageInfo.thumburl;
  if (!imageUrl) {
    console.warn(`  [Wikimedia] No thumbnail URL found for "${pageTitle}".`);
    return null;
  }
  console.log(`  [Wikimedia] Downloading image from: ${imageUrl}`);
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    console.warn(`  [Wikimedia] Failed to download image. Status: ${imageResponse.status}`);
    return null;
  }
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  
  // 5. Upload buffer to Firebase Storage
  const fileExtension = imageUrl.split('.').pop()?.split('?')[0] || 'jpg';
  const filePath = `trivia_images/${question.id}.${fileExtension}`;
  const file = bucket.file(filePath);
  await file.save(imageBuffer, {
    metadata: { contentType: imageResponse.headers.get('content-type') || 'image/jpeg' },
    public: true,
  });

  // 6. Return public URL
  return file.publicUrl();
}

async function generateImageFromAI(prompt: string, questionId: string): Promise<string | null> {
  const imageDataUri = await generateImage(prompt);
  if (!imageDataUri) return null;

  const mimeType = imageDataUri.substring(imageDataUri.indexOf(':') + 1, imageDataUri.indexOf(';'));
  const base64Data = imageDataUri.substring(imageDataUri.indexOf(',') + 1);
  const imageBuffer = Buffer.from(base64Data, 'base64');
  const fileExtension = mimeType.split('/')[1] || 'png';
  
  const filePath = `trivia_images/${questionId}.${fileExtension}`;
  const file = bucket.file(filePath);

  await file.save(imageBuffer, {
    metadata: { contentType: mimeType },
    public: true,
  });
  
  return file.publicUrl();
}


async function populateImages() {
  const { category, limit, delay, force } = argv;

  console.log(`Starting image population script...`);
  console.log(`--- Configuration ---`);
  console.log(`Target Category: ${category || 'All Categories'}`);
  console.log(`Max Images to Process: ${limit}`);
  console.log(`Delay between calls: ${delay}ms`);
  console.log(`Force Regeneration: ${force}`);
  console.log(`---------------------`);

  try {
    let query: admin.firestore.Query = db.collection(PREDEFINED_QUESTIONS_COLLECTION);
    
    if (category) {
      query = query.where('topicValue', '==', category);
    }
    
    const snapshot = await query.get();
    
    const allQuestionsWithData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PredefinedQuestion));

    const questionsToProcess = force
      ? allQuestionsWithData.filter(q => q.imagePrompt || (q.artworkTitle && q.artworkAuthor))
      : allQuestionsWithData.filter(q => !q.imageUrl && (q.imagePrompt || (q.artworkTitle && q.artworkAuthor)));

    if (questionsToProcess.length === 0) {
      console.log("No questions found needing image generation for the selected criteria.");
      return;
    }

    console.log(`Found ${questionsToProcess.length} questions to potentially process.`);
    const limitedQuestions = questionsToProcess.slice(0, limit);
    console.log(`Processing up to ${limitedQuestions.length} questions in this run.`);

    let successCount = 0;
    let errorCount = 0;

    for (const question of limitedQuestions) {
      console.log(`\n[${successCount + errorCount + 1}/${limitedQuestions.length}] Processing question ID: ${question.id}`);
      
      let publicUrl: string | null = null;
      try {
        if (question.artworkTitle && question.artworkAuthor) {
          publicUrl = await fetchImageFromWikimedia(question);
        } else if (question.imagePrompt) {
          publicUrl = await generateImageFromAI(question.imagePrompt, question.id);
        } else {
          console.log(`  -> Skipping question ID ${question.id}: No imagePrompt or artworkTitle/Author provided.`);
          continue;
        }

        if (publicUrl) {
          await db.collection(PREDEFINED_QUESTIONS_COLLECTION).doc(question.id).update({ imageUrl: publicUrl });
          console.log(`  -> Firestore updated for question ${question.id}. URL: ${publicUrl}`);
          successCount++;
        } else {
          console.warn(`  -> Could not obtain an image URL for question ${question.id}.`);
          errorCount++;
        }

      } catch (genError) {
        console.error(`  -> ERROR processing question ${question.id}:`, genError);
        errorCount++;
      }
      
      if (limitedQuestions.indexOf(question) < limitedQuestions.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    console.log(`\n--- Script Finished ---`);
    console.log(`Successfully processed ${successCount} images.`);
    console.log(`Failed to process ${errorCount} images.`);
    
  } catch (error) {
    console.error("An unexpected error occurred during the script execution:", error);
  }
}

populateImages().catch(error => {
  console.error("Unhandled fatal error in populateImages script:", error);
  process.exit(1);
});
