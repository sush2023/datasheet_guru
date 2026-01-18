import * as dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GOOGLE_API_KEY;
const listModelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

async function listModels() {
  try {
    const response = await fetch(listModelsUrl);
    const data = await response.json();

    if (data.error) { console.log(`Error getting response, error is:  ${JSON.stringify(data.error)}`); }
    if (!data.models) {
      console.log("no models found");
      return;
    }
    data.models.forEach(model => {
      console.log(`Name: ${model.name}`);
      console.log(`Methods: ${model.supportedGenerationMethods}`);
      console.log('---------\n\n');
    })
  } catch (error) {
    console.log(`Error trying to get models: ${error}`);
  }
}

listModels();
