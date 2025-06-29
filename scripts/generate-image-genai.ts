// Generates an image with genai and Imagen
// This is a working sample script based on the official documentation

import { config } from 'dotenv';
config(); // Load environment variables from .env file

import { GoogleGenAI, Modality } from "@google/genai";
import * as fs from 'fs';

const DEFAULT_OUTPUT_FILENAME = 'generated_image.png';

async function generateImage(modelName: string, prompt: string, outputPath?: string) {
    if (!process.env.GOOGLE_API_KEY) {
        console.error('GOOGLE_API_KEY environment variable not set.');
        process.exit(1);
    }

    const ai = new GoogleGenAI({});

    try {
        // Imagen model
        if (modelName.includes('imagen-')) {
            const response = await ai.models.generateImages({
                model: modelName,
                prompt: prompt,
                config: {
                    numberOfImages: 1,
                    aspectRatio: "16:9",
                },
            });

            if (response.generatedImages) { // Check if media exists
                const generatedImage = response.generatedImages[0]; // Assuming only one image is requested
                if (!generatedImage || !generatedImage.image || !generatedImage.image.imageBytes) {
                    console.error('Generated image data is incomplete or missing.');
                    return;
                }
                const imgBytes = generatedImage.image.imageBytes;
                const buffer = Buffer.from(imgBytes, "base64");
                const outputFilePath = outputPath || DEFAULT_OUTPUT_FILENAME;
                fs.writeFileSync(outputFilePath, buffer);
                console.log(`Image from ${modelName} successfully generated and saved to ${outputFilePath}`);
            } else {
                console.error('No images were generated.');
            }
        } else {
            // Gemini model
            const engineeredPrompt = `A widescreen, 16:9 aspect ratio, landscape-orientation image of: ${prompt}`;
            const response = await ai.models.generateContent({
                model: 'gemini-2.0-flash-preview-image-generation',
                contents: engineeredPrompt,
                config: {
                    responseModalities: [Modality.TEXT, Modality.IMAGE],
                },
            });

            if (!response.candidates || response.candidates.length === 0 || !response.candidates[0].content || !response.candidates[0].content.parts) {
                console.error('Invalid response structure or missing candidates/content parts.');
                return;
            }

            const parts = response.candidates[0].content.parts;

            for (const part of parts) {
                if (part.inlineData && part.inlineData.data) {
                    const imageData = part.inlineData.data;
                    const buffer = Buffer.from(imageData, 'base64');
                    const outputFilePath = outputPath || DEFAULT_OUTPUT_FILENAME;
                    fs.writeFileSync(outputFilePath, buffer); // Save the image
                    console.log(`Image from ${modelName} successfully generated and saved to ${outputFilePath}`);
                } else if (part.text) {
                    console.log(part.text); // Log any text parts
                }
            }
        }
    } catch (error) {
        console.error('Error generating image:', error);
    }
}

const args = process.argv.slice(2);

if (args.length < 1) {
    console.log('Usage: tsx your_script_name.ts <prompt> [output_path]');
    process.exit(1);
}

const modelNames = [
    "imagen-4.0-ultra-generate-preview-06-06",
    "imagen-4.0-generate-preview-06-06",
    "imagen-3.0-generate-002",
    "gemini-2.0-flash-preview-image-generation"
];

const modelName = args[0];

if (!modelNames.includes(modelName)) {
    console.log(`Invalid model name. Must be one of: ${modelNames.join(', ')}`);
    process.exit(1);
}

const prompt = args[1]; // Assuming prompt is the second argument
const outputPath = args[2];

generateImage(modelName, prompt, outputPath);