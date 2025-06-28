
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import {vertexAI} from '@genkit-ai/vertexai';

export const ai = genkit({
  plugins: [googleAI(), vertexAI()],
  // The 'defaultModel' option is not valid for genkit(). It's an option for configureGenkit().
  // Removing it should allow the 'ai' object to be correctly initialized with all its methods.
});
