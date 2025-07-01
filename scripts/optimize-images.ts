
// scripts/optimize-images.ts
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import sharp from 'sharp';
import path from 'path';
import { adminDb, adminStorage } from '../lib/firebase-admin';
import type { PredefinedQuestion } from '../services/triviaService';
import type { firestore } from 'firebase-admin';

const bucket = adminStorage.bucket();
const db = adminDb;
const PREDEFINED_QUESTIONS_COLLECTION = 'predefinedTriviaQuestions';

// Helper to extract file path from a Google Cloud Storage URL
function getPathFromUrl(url: string): string | null {
    try {
        const urlObj = new URL(url);
        // Pathname is like /<bucket>/trivia_images%2Fimage.png
        // We need to decode the URI component and remove the leading slash and bucket name
        const bucketName = bucket.name;
        const encodedPath = urlObj.pathname.substring(1); // remove leading '/'
        if (!encodedPath.startsWith(bucketName + '/')) {
            console.warn(`[Warning] URL does not seem to belong to the configured bucket '${bucketName}'. URL: ${url}`);
            // Attempt to parse anyway, assuming the path after the first segment is correct
            const pathSegments = encodedPath.split('/');
            pathSegments.shift(); // remove the bucket name part
            return decodeURIComponent(pathSegments.join('/'));
        }
        const filePath = encodedPath.substring(bucketName.length + 1);
        return decodeURIComponent(filePath);
    } catch (e) {
        console.error(`[Error] Could not parse GCS URL: ${url}`, e);
        return null;
    }
}

async function main() {
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
      description: 'Maximum number of images to process in this run.',
    })
    .option('width', {
        alias: 'w',
        type: 'number',
        default: 800,
        description: 'Target width to resize images to (height will scale proportionally).',
    })
    .option('quality', {
        alias: 'q',
        type: 'number',
        default: 80,
        description: 'Quality for the optimized image (1-100 for JPG/WebP).',
    })
    .option('force', {
      alias: 'f',
      type: 'boolean',
      default: false,
      description: 'Force re-optimization of images even if they appear to be optimized.',
    })
    .option('dryRun', {
      alias: 'd',
      type: 'boolean',
      default: false,
      description: 'Run the script without uploading new files or updating the database.',
    })
    .help()
    .alias('help', 'h')
    .parseSync();
  
  await optimizeImages(argv);
}


async function optimizeImages(argv: any) {
  const { category, limit, width, quality, force, dryRun } = argv;

  console.log(`Starting image optimization script...`);
  console.log(`--- Configuration ---`);
  console.log(`Target Category: ${category || 'All Categories'}`);
  console.log(`Max Images to Process: ${limit}`);
  console.log(`Target Width: ${width}px`);
  console.log(`Quality: ${quality}`);
  console.log(`Force Re-optimization: ${force}`);
  console.log(`Dry Run: ${dryRun}`);
  console.log(`---------------------`);

  try {
    let query: firestore.Query = db.collection(PREDEFINED_QUESTIONS_COLLECTION)
        .where('imageUrl', '>', ''); // This correctly finds docs where imageUrl is a non-empty string.

    if (category) {
      query = query.where('topicValue', '==', category);
    }
    
    const snapshot = await query.get();
    const allQuestionsWithImages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PredefinedQuestion));

    const questionsToProcess = allQuestionsWithImages.filter(q => {
        // Skip if imageUrl is falsy or doesn't look like a GCS URL
        if (!q.imageUrl || !q.imageUrl.startsWith('https://storage.googleapis.com')) return false;
        // If not forcing, skip images that have already been optimized
        if (!force && q.imageUrl.includes('_optimized')) return false;
        return true;
    });

    if (questionsToProcess.length === 0) {
      console.log("No images found needing optimization for the selected criteria.");
      return;
    }

    console.log(`Found ${questionsToProcess.length} total images to potentially process.`);
    const limitedQuestions = questionsToProcess.slice(0, limit);
    console.log(`Processing up to ${limitedQuestions.length} images in this run.`);

    let successCount = 0;
    let errorCount = 0;
    let bytesSaved = 0;

    for (const question of limitedQuestions) {
      const index = limitedQuestions.indexOf(question);
      console.log(`\n[${index + 1}/${limitedQuestions.length}] Processing question ID: ${question.id}`);
      console.log(`  Original URL: ${question.imageUrl}`);
      
      const originalFilePath = getPathFromUrl(question.imageUrl!);
      if (!originalFilePath) {
        console.error(`  -> Skipping: Could not determine original file path.`);
        errorCount++;
        continue;
      }
      
      try {
        const response = await fetch(question.imageUrl!);
        if (!response.ok) throw new Error(`Failed to download image: ${response.statusText}`);
        const originalBuffer = Buffer.from(await response.arrayBuffer());
        const originalSize = originalBuffer.length;

        console.log(`  -> Downloaded original image (${(originalSize / 1024).toFixed(1)} KB).`);

        const optimizedBuffer = await sharp(originalBuffer)
          .resize({ width: width, withoutEnlargement: true })
          .webp({ quality: quality })
          .toBuffer();
        
        const optimizedSize = optimizedBuffer.length;
        const percentSaved = ((originalSize - optimizedSize) / originalSize) * 100;
        console.log(`  -> Optimized image (${(optimizedSize / 1024).toFixed(1)} KB). Savings: ${percentSaved.toFixed(1)}%`);

        if (dryRun) {
            console.log(`  -> [Dry Run] Would upload and update Firestore.`);
            successCount++;
            bytesSaved += (originalSize - optimizedSize);
            continue;
        }

        const originalExtension = path.extname(originalFilePath);
        const originalBaseName = path.basename(originalFilePath, originalExtension);
        const newFilePath = `trivia_images/${originalBaseName}_optimized.webp`;

        const file = bucket.file(newFilePath);
        await file.save(optimizedBuffer, {
          metadata: { contentType: 'image/webp' },
          public: true,
        });

        const newPublicUrl = file.publicUrl();
        await db.collection(PREDEFINED_QUESTIONS_COLLECTION).doc(question.id).update({ imageUrl: newPublicUrl });
        console.log(`  -> Firestore updated with new URL: ${newPublicUrl}`);
        
        // Delete the original file
        try {
            // Only delete if the original path is different from the new one
            if (originalFilePath !== newFilePath) {
              await bucket.file(originalFilePath).delete();
              console.log(`  -> Successfully deleted original file: ${originalFilePath}`);
            } else {
              console.log(`  -> Skipping deletion as new path is same as old (e.g. from a --force run)`)
            }
        } catch (deleteError) {
            console.warn(`  -> WARNING: Failed to delete original file: ${originalFilePath}`, deleteError);
        }

        successCount++;
        bytesSaved += (originalSize - optimizedSize);

      } catch (procError) {
        console.error(`  -> ERROR processing image for question ${question.id}:`, procError);
        errorCount++;
      }
    }

    console.log(`\n--- Script Finished ---`);
    console.log(`Successfully optimized ${successCount} images.`);
    console.log(`Failed to process ${errorCount} images.`);
    if (!dryRun) console.log(`Total storage space saved in this run: ${(bytesSaved / (1024 * 1024)).toFixed(2)} MB.`);
    
  } catch (error) {
    console.error("An unexpected error occurred during the script execution:", error);
  }
}

main().catch(error => {
  console.error("Unhandled fatal error in script:", error);
  process.exit(1);
});
