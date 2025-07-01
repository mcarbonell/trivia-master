// scripts/delete-orphan-images.ts
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { adminDb, adminStorage } from '../lib/firebase-admin';

const bucket = adminStorage.bucket();
const db = adminDb;
const PREDEFINED_QUESTIONS_COLLECTION = 'predefinedTriviaQuestions';

// Helper to extract file path from a Google Cloud Storage URL
function getPathFromUrl(url: string): string | null {
    if (!url.startsWith('https://storage.googleapis.com/')) {
        return null;
    }
    try {
        const urlObj = new URL(url);
        const bucketName = bucket.name;
        const encodedPath = urlObj.pathname.substring(1); 
        if (!encodedPath.startsWith(bucketName + '/')) {
            console.warn(`[Warning] URL does not seem to belong to the configured bucket '${bucketName}'. URL: ${url}`);
            const pathSegments = encodedPath.split('/');
            pathSegments.shift();
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
    .option('limit', {
      alias: 'l',
      type: 'number',
      default: 1000,
      description: 'Maximum number of files to scan from Storage in one run.',
    })
    .option('dryRun', {
      alias: 'd',
      type: 'boolean',
      default: false,
      description: 'Run the script without actually deleting files. Highly recommended for first run.',
    })
    .help()
    .alias('help', 'h')
    .parseSync();
  
  await deleteOrphanImages(argv);
}

async function deleteOrphanImages(argv: any) {
  const { limit, dryRun } = argv;

  console.log(`Starting orphan image cleanup script...`);
  console.log(`--- Configuration ---`);
  console.log(`Storage File Scan Limit: ${limit}`);
  console.log(`Dry Run (no actual deletion): ${dryRun}`);
  console.log(`---------------------`);

  try {
    // 1. Get all active image URLs from Firestore
    console.log("Fetching all active image URLs from Firestore...");
    const activeImagePaths = new Set<string>();
    const questionsSnapshot = await db.collection(PREDEFINED_QUESTIONS_COLLECTION).where('imageUrl', '>', '').get();
    
    questionsSnapshot.forEach(doc => {
      const imageUrl = doc.data().imageUrl as string;
      const imagePath = getPathFromUrl(imageUrl);
      if (imagePath) {
        activeImagePaths.add(imagePath);
      }
    });
    console.log(`Found ${activeImagePaths.size} unique active image references in Firestore.`);

    // 2. Get all files from Firebase Storage
    console.log(`Fetching up to ${limit} files from Firebase Storage under 'trivia_images/'...`);
    const [allFiles] = await bucket.getFiles({ prefix: 'trivia_images/', maxResults: limit });
    console.log(`Found ${allFiles.length} total files in Storage to check.`);

    // 3. Compare and find orphans
    const orphanFiles = allFiles.filter(file => !activeImagePaths.has(file.name));
    console.log(`Identified ${orphanFiles.length} potential orphan files.`);

    if (orphanFiles.length === 0) {
      console.log("No orphan files found. Your storage is clean!");
      return;
    }

    if (dryRun) {
      console.log("\n--- [Dry Run] Orphan files that would be deleted: ---");
      orphanFiles.forEach(file => console.log(`  - ${file.name}`));
    } else {
      console.log("\n--- Deleting orphan files... ---");
      let deleteCount = 0;
      let errorCount = 0;
      for (const file of orphanFiles) {
        try {
          await file.delete();
          console.log(`  - Deleted: ${file.name}`);
          deleteCount++;
        } catch (error) {
          console.error(`  - FAILED to delete ${file.name}:`, error);
          errorCount++;
        }
      }
      console.log(`\nSuccessfully deleted ${deleteCount} orphan files. Failed to delete ${errorCount} files.`);
    }

    console.log(`\n--- Script Finished ---`);
    
  } catch (error) {
    console.error("An unexpected error occurred during the script execution:", error);
  }
}

main().catch(error => {
  console.error("Unhandled fatal error in script:", error);
  process.exit(1);
});
