import { config } from 'dotenv';
config();

import '@/ai/flows/generate-trivia-question.ts';
import '@/ai/flows/validate-custom-topic.ts';
import '@/ai/flows/detect-duplicate-questions.ts';
import '@/ai/flows/validate-single-trivia-question.ts';
