import { readFile, writeFile } from 'fs/promises';
import path from 'path';

async function processFamousPaintingsQuestions() {
  const filePath = path.join(__dirname, '../src/data/FamousPaintings-questions.json');

  try {
    // Read the file
    const fileContent = await readFile(filePath, { encoding: 'utf-8' });

    // Parse the JSON
    let questions: any[];
    try {
      questions = JSON.parse(fileContent);
    } catch (jsonError) {
      console.error('Error parsing JSON:', jsonError);
      return;
    }

    if (!Array.isArray(questions)) {
      console.error('JSON content is not an array.');
      return;
    }

    // Process the questions
    const modifiedQuestions = questions.map(question => {
      const { artworkTitle, artworkAuthor, ...rest } = question;
      const searchTerm = artworkTitle && artworkAuthor ? `${artworkTitle}, ${artworkAuthor}` : '';

      return {
        ...rest,
        searchTerm,
      };
    });

    // Stringify the modified array
    const updatedContent = JSON.stringify(modifiedQuestions, null, 2);

    // Write the modified content back to the file
    await writeFile(filePath, updatedContent, { encoding: 'utf-8' });

    console.log('Successfully processed and updated FamousPaintings-questions.json');

  } catch (error) {
    console.error('Error processing FamousPaintings-questions.json:', error);
  }
}

processFamousPaintingsQuestions();