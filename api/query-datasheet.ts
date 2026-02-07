import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Helper for CORS headers
const setCorsHeaders = (res: VercelResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // Adjust this for production
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
};

export default async function(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).send('ok');
  }

  try {
    const { query } = req.body; // Get the user's question from the request body

    // auth jwt
    const authHeader = req.headers["authorization"];
    const supabaseClient = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_ANON_KEY as string,
      {
        global: {
          headers: {
            Authorization: authHeader as string
          }
        }
      }
    );

    const googleApiKey = process.env.GOOGLE_API_KEY;
    if (!googleApiKey) {
      throw new Error('GOOGLE_API_KEY is not set.');
    }
    const embeddingUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${googleApiKey}`;
    const generativeUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-latest:generateContent?key=${googleApiKey}`;

    // 1. Generate embedding for the user's query
    const embedResponse = await fetch(embeddingUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "models/gemini-embedding-001", content: { parts: [{ text: query }] } }),
    });

    if (!embedResponse.ok) {
      const errorText = await embedResponse.text();
      throw new Error(`Failed to embed query: ${errorText}`);
    }
    const { embedding: queryEmbeddingData } = await embedResponse.json();
    const queryEmbedding = queryEmbeddingData.values;

    // 2. Perform vector similarity search in Supabase
    const { data: documents, error: matchError } = await supabaseClient.rpc(
      "match_documents",
      {
        query_embedding: queryEmbedding,
        match_threshold: 5, // Adjust as needed
        match_count: 5,
      },
    );

    if (matchError) {
      throw matchError;
    }

    // 3. Construct prompt for the Generative LLM
    const context = documents
      .map((doc: { content: string }) => doc.content)
      .join("\n\n");

    const prompt = `
      You are an expert in embedded systems datasheets.
      Answer the following question based ONLY on the provided context.
      Answer the question based on the provided context. If the exact answer isn't explicitly stated, use your
         general knowledge to fill in gaps, but prioritize the datasheets.
      However, Make sure to question yourself and evaluate the response to the provided context before the final output is given to the user 
      Context:
      ${context}

      Question:
      ${query}

      Answer:
    `;

    // 4. Generate answer using Google's Gemini Pro
    const generateResponse = await fetch(generativeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!generateResponse.ok) {
      const errorText = await generateResponse.text();
      throw new Error(
        `Failed to generate content: ${errorText}`,
      );
    }
    const { candidates } = await generateResponse.json();
    const aiResponse = candidates[0].content.parts[0].text;

    // 5. Return the AI's answer
    return res.status(200).json({ answer: aiResponse });
  } catch (error: any) {
    console.error("Error in RAG pipeline:", error);
    return res.status(500).json({ error: error.message });
  }
}
