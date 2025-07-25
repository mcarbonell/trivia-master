import { config } from 'dotenv';
config();

import '@/ai/flows/generate-trivia-question.ts';
import '@/ai/flows/validate-custom-topic.ts';
import '@/ai/flows/detect-duplicate-questions.ts';
import '@/ai/flows/validate-single-trivia-question.ts';
import '@/ai/flows/generate-image.ts';
import '@/ai/flows/find-wikimedia-images.ts';
import '@/ai/flows/process-wikimedia-image.ts';
import '@/ai/flows/generate-and-store-image.ts';
import '@/ai/flows/upload-and-store-image.ts';
