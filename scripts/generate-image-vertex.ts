// Generates an image with vertexai and Imagen

import { config } from 'dotenv';
config(); // Load environment variables from .env file

import { genkit } from 'genkit';
import * as fs from 'fs';
import { vertexAI } from '@genkit-ai/vertexai';

const DEFAULT_OUTPUT_FILENAME = 'generated_image.png';

async function generateImage(prompt: string, outputPath?: string) {
  if (!process.env.GOOGLE_API_KEY) {
    console.error('GOOGLE_API_KEY environment variable not set.');
    process.exit(1);
  }

  const ai = genkit({ plugins: [vertexAI()] });

  try {
    const response = await ai.generate({
      model: vertexAI.model('imagen-3.0-generate-002'),
      output: { format: 'media' },
      prompt: prompt,
      config: {
        numberOfImages: 1,
        aspectRatio: "16:9",
      },
    });

    if (response.media) { // Check if media exists
      const mediaUrl = response.media.url; // Get the data URL
      const base64Data = mediaUrl.split(',')[1]; // Extract base64 data after the comma
      const imageBuffer = Buffer.from(base64Data, 'base64'); // Create a Buffer from base64 data
      const outputFilePath = outputPath || DEFAULT_OUTPUT_FILENAME;
      fs.writeFileSync(outputFilePath, imageBuffer); // Write the buffer to the file
      console.log(`Image successfully generated and saved to ${outputFilePath}`);
    } else {
      console.error('No images were generated.');
    }
  } catch (error) {
    console.error('Error generating image:', error);
  }
}

const args = process.argv.slice(2);

if (args.length < 1) {
  console.log('Usage: ts-node your_script_name.ts <prompt> [output_path]');
  process.exit(1);
}

const prompt = args[0];
const outputPath = args[1];

generateImage(prompt, outputPath);