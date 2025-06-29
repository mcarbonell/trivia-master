
import { config } from 'dotenv';
config(); // Load environment variables from .env file

import { adminDb } from '../src/lib/firebase-admin';
import * as yargs from 'yargs';
import * as fs from 'fs';
import * as path from 'path';

const argv = yargs
  .option('topicValue', {
    alias: 't',
    description: 'The topicValue to filter questions by',
    type: 'string',
    demandOption: true,
  })
  .help()
  .alias('h', 'help').argv;

async function exportQuestions(topicValue: string) {
  try {
    const questionsRef = adminDb.collection('predefinedTriviaQuestions');
    const snapshot = await questionsRef.where('topicValue', '==', topicValue).get();

    const questions: any[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      // Format the createdAt timestamp to a standard ISO string
      if (data.createdAt && typeof data.createdAt.toDate === 'function') {
        data.createdAt = data.createdAt.toDate().toISOString();
      }
      // Include the document ID in the exported object
      questions.push({ id: doc.id, ...data });
    });

    const fileName = `${topicValue}-questions.json`;
    const filePath = path.join(process.cwd(), 'src', 'data', fileName);

    fs.writeFileSync(filePath, JSON.stringify(questions, null, 2));

    console.log(`Successfully exported ${questions.length} questions to ${filePath}`);
  } catch (error) {
    console.error('Error exporting questions:', error);
  }
}

// Assert topicValue is a string before passing it
const topicValue = argv.topicValue as string;
exportQuestions(topicValue);
