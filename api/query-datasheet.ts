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
    const { query, selectedFiles } = req.body; // Get the user's question and selected files from the request body

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

        // USE STREAMING ENDPOINT with SSE

        const generativeUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:streamGenerateContent?alt=sse&key=${googleApiKey}`;

    

        // 1. Generate embedding for the user's query

        const embedResponse = await fetch(embeddingUrl, {

          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({ 

            model: "models/gemini-embedding-001", 

            content: { parts: [{ text: query }] }

          }),

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

            match_threshold: 0.5, // Adjust as needed

            match_count: 5,

            file_paths: selectedFiles,

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

          You are an expert technical assistant for embedded systems engineers.

          Your goal is to provide accurate, concise, and direct answers.

          

          Instructions:

          1. Answer based primarily on the provided context. If the context is insufficient, use general knowledge but keep it brief.

          2. Be concise. Avoid filler words, lengthy introductions, or "Based on..." preambles.

          3. Do NOT include a "Self-Evaluation" or "Verification" section.

          4. Formatting: Use Markdown for code blocks and tables.

    

          Context:

          ${context}

    

          Question:

          ${query}

    

          Answer:

        `;

    

        // 4. Generate & Stream Answer

        // Set headers for SSE

        res.setHeader('Content-Type', 'text/event-stream');

        res.setHeader('Cache-Control', 'no-cache');

        res.setHeader('Connection', 'keep-alive');

    

        const generateResponse = await fetch(generativeUrl, {

          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({

            contents: [{ parts: [{ text: prompt }] }],

          }),

        });

    

        if (!generateResponse.ok) {

          // If Gemini fails, send the error as an SSE event so the client knows

          const errorText = await generateResponse.text();

          console.error('Gemini API Error:', errorText);

          res.write(`data: ${JSON.stringify({ error: errorText })}\n\n`);

          return res.end();

        }

    

        if (!generateResponse.body) {

          throw new Error('No response body from Gemini');

        }

    

        // Pipe the stream from Gemini directly to the client

        // Since we requested alt=sse, Gemini sends "data: {...}" chunks which are valid SSE

        // We can just forward them.

        const reader = generateResponse.body.getReader();

        const decoder = new TextDecoder();

    

        try {

          while (true) {

            const { done, value } = await reader.read();

            if (done) break;

            const chunk = decoder.decode(value, { stream: true });

            res.write(chunk);

          }

        } catch (streamError) {

          console.error('Stream reading error:', streamError);

        } finally {

          res.end();

        }

    

        return; // Request handled via streaming

    

      } catch (error: any) {

        console.error("Error in RAG pipeline:", error);

        // If we haven't sent headers yet, send a normal 500 JSON

        if (!res.headersSent) {

          return res.status(500).json({ error: error.message });

        }

        // If headers were sent (e.g. streaming started), send an SSE error

        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);

        res.end();

      }

    }
