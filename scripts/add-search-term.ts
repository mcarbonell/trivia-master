import { readFile, writeFile } from 'fs/promises';
import path from 'path';

interface BilingualText {
  en: string;
  es: string;
}

interface Question {
  question: BilingualText;
  correctAnswer: BilingualText;
  answers: BilingualText[];
  topic: BilingualText;
  topicValue: string;
  difficulty: 'easy' | 'medium' | 'hard';
  imageUrl?: string;
  createdAt: {
    _seconds: number;
    _nanoseconds: number;
  };
  artworkTitle?: string; // Optional fields
  artworkAuthor?: string; // Optional fields
  searchTerm?: string; // New optional field
}

async function addSearchTermToAnimalQuestions() {
  const filePath = path.join(__dirname, '../src/data/WorldLandmarks-questions.json');

  try {
    const data = await readFile(filePath, 'utf-8');
    const questions: Question[] = JSON.parse(data);

    const modifiedQuestions = questions.map(question => {
      // Add the searchTerm field based on the correctAnswer.en
      return {
        ...question,
        searchTerm: question.correctAnswer.en
      };
    });

    await writeFile(filePath, JSON.stringify(modifiedQuestions, null, 2), 'utf-8');

    console.log(`Successfully added 'searchTerm' field to all questions in ${filePath}`);

  } catch (error) {
    console.error('Error processing AnimalIdentification-questions.json:', error);
  }
}

addSearchTermToAnimalQuestions();