import { config } from 'dotenv';
config();

import '@/ai/flows/generate-trivia-question.ts'; // Keep the filename as is, but
import '@/ai/flows/validate-custom-topic.ts';
import '@/ai/flows/detect-duplicate-questions.ts';
