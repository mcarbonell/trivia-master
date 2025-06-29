
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { adminDb, adminStorage } from '../lib/firebase-admin';
import type { PredefinedQuestion } from '../services/triviaService';
import { getScriptSettings } from '@/services/settingsService';
import { ai } from '@/ai/genkit';
import type { firestore } from 'firebase-admin';

const bucket = adminStorage.bucket();
const db = adminDb;
const PREDEFINED_QUESTIONS_COLLECTION = 'predefinedTriviaQuestions';

interface ImageResult {
  buffer: Buffer;
  contentType: string;
  extension: string;
}

async function main() {
  const settings = await getScriptSettings();

  const argv = yargs(hideBin(process.argv))
    .option('category', {
      alias: 'c',
      type: 'string',
      description: 'TopicValue of the specific category to process.',
    })
    .option('limit', {
      alias: 'l',
      type: 'number',
      default: settings.populateImages.limit,
      description: 'Maximum number of images to generate in this run.',
    })
    .option('delay', {
      alias: 'd',
      type: 'number',
      default: settings.populateImages.delay,
      description: 'Delay in milliseconds between API calls.',
    })
    .option('force', {
      alias: 'f',
      type: 'boolean',
      default: false,
      description: 'Force regeneration of images even if they already exist.',
    })
    .option('model', {
      alias: 'mod',
      type: 'string',
      description: 'Genkit image generation model to use.',
      default: settings.populateImages.defaultImageModel,
    })
    .option('mode', {
      alias: 'mo',
      type: 'string',
      choices: ['ai', 'search'],
      demandOption: true,
      description: "Image population mode: 'ai' to generate from imagePrompt, 'search' to find from searchTerm.",
    })
    .option('addWatermark', {
      alias: 'w',
      type: 'boolean',
      default: false,
      description: 'Adds a watermark to the generated images.',
    })
    .help()
    .alias('help', 'h')
    .parseSync();
  
  await populateImages(argv);
}


async function fetchImageFromWikimedia(searchTerm: string): Promise<ImageResult | null> {
  if (!searchTerm) {
    console.warn(`  [Wikimedia] Skipping: Missing searchTerm.`);
    return null;
  }
  
  console.log(`  [Wikimedia] Searching for: ${searchTerm}`);

  const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTerm)}&srnamespace=6&format=json&srlimit=1&origin=*`;
  
  const searchResponse = await fetch(searchUrl);
  if (!searchResponse.ok) {
    console.warn(`  [Wikimedia] Search request failed with status: ${searchResponse.status}`);
    return null;
  }
  const searchResult = await searchResponse.json();
  const pageTitle = searchResult?.query?.search?.[0]?.title;

  if (!pageTitle) {
    console.warn(`  [Wikimedia] No file page found for search term ${searchTerm}.`);
    return null;
  }
  console.log(`  [Wikimedia] Found page: "${pageTitle}"`);

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

  // --- Robust License Validation ---
  const licenseShortName = (extMetadata.LicenseShortName?.value || '').toLowerCase();
  const isPermissiveLicense = ['public domain', 'pd-', 'cc0', 'cc by'].some(p => licenseShortName.includes(p));

  if (!isPermissiveLicense) {
    console.warn(`  [Wikimedia] License for "${pageTitle}" is not permissive enough. Skipping. License: ${extMetadata.LicenseShortName?.value || 'Unknown'}`);
    return null;
  }
  console.log(`  [Wikimedia] License confirmed as permissive: ${extMetadata.LicenseShortName?.value || 'OK'}`);
  
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
  const fileExtension = imageUrl.split('.').pop()?.split('?')[0] || 'jpg';

  return {
    buffer: imageBuffer,
    contentType: imageResponse.headers.get('content-type') || 'image/jpeg',
    extension: fileExtension,
  };
}

async function generateImageFromAI(prompt: string, modelName: string): Promise<ImageResult | null> {
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


async function populateImages(argv: any) {
  const { category, limit, delay, force, model: modelToUse, mode, addWatermark } = argv;

  console.log(`Starting image population script...`);
  console.log(`--- Configuration ---`);
  console.log(`Target Category: ${category || 'All Categories'}`);
  console.log(`Mode: ${mode.toUpperCase()}`);
  console.log(`Max Images to Process: ${limit}`);
  console.log(`Delay between calls: ${delay}ms`);
  console.log(`Force Regeneration: ${force}`);
  console.log(`Image Generation Model: ${modelToUse}`);
  console.log(`Add Watermark: ${addWatermark}`);
  console.log(`---------------------`);

  let watermarkBuffer: Buffer | null = null;
  if (addWatermark) {
    try {
      const watermarkPath = path.join(__dirname, '../data/watermark.svg');
      watermarkBuffer = await fs.readFile(watermarkPath);
      console.log('Watermark enabled for this run.');
    } catch (error) {
      console.error('Could not read watermark file. Proceeding without watermark.', error);
      watermarkBuffer = null;
    }
  }

  try {
    let query: firestore.Query = db.collection(PREDEFINED_QUESTIONS_COLLECTION);
    
    if (category) {
      query = query.where('topicValue', '==', category);
    }
    
    const snapshot = await query.get();
    const allQuestionsWithData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PredefinedQuestion));
    
    const questionsToProcess = allQuestionsWithData.filter(q => {
      // If forcing, we process any question that has a valid field for the current mode.
      if (force) {
        return (mode === 'ai' && q.imagePrompt) || (mode === 'search' && q.searchTerm);
      }
      // If not forcing, we only process questions that are missing an imageUrl and have a valid field for the current mode.
      return !q.imageUrl && ((mode === 'ai' && q.imagePrompt) || (mode === 'search' && q.searchTerm));
    });

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
      
      let imageResult: ImageResult | null = null;
      try {
        if (mode === 'search') {
          if (question.searchTerm) {
            imageResult = await fetchImageFromWikimedia(question.searchTerm);
          } else {
            console.log(`  -> Skipping question ID ${question.id}: Mode is 'search' but no searchTerm provided.`);
            continue;
          }
        } else if (mode === 'ai') {
          if (question.imagePrompt) {
            imageResult = await generateImageFromAI(question.imagePrompt, modelToUse);
          } else {
            console.log(`  -> Skipping question ID ${question.id}: Mode is 'ai' but no imagePrompt provided.`);
            continue;
          }
        } else {
          console.log(`  -> Skipping question ID ${question.id}: Invalid mode specified.`);
          continue;
        }

        if (imageResult) {
          let imageToUpload = imageResult.buffer;
          
          if (watermarkBuffer) {
            console.log(`  -> Applying watermark...`);
            imageToUpload = await sharp(imageToUpload)
                .composite([{
                    input: watermarkBuffer,
                    gravity: 'southeast',
                }])
                .toBuffer();
          }

          console.log(`  -> Uploading image to Firebase Storage...`);
          const filePath = `trivia_images/${question.id}.${imageResult.extension}`;
          const file = bucket.file(filePath);
          await file.save(imageToUpload, {
              metadata: { contentType: imageResult.contentType },
              public: true,
          });
          
          const publicUrl = file.publicUrl();

          await db.collection(PREDEFINED_QUESTIONS_COLLECTION).doc(question.id).update({ imageUrl: publicUrl });
          console.log(`  -> Firestore updated for question ${question.id}. URL: ${publicUrl}`);
          successCount++;
        } else {
          console.warn(`  -> Could not obtain an image for question ${question.id}.`);
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

main().catch(error => {
  console.error("Unhandled fatal error in script:", error);
  process.exit(1);
});
