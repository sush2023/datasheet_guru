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
    const { query, history, conversationSummary, selectedFiles } = req.body;

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
    const generativeUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:streamGenerateContent?alt=sse&key=${googleApiKey}`;
    const nonStreamingUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${googleApiKey}`;

    // 1. CONTEXT SYNTHESIS (Generate/Update Summary)
    // We do this in parallel or before the main logic to keep context fresh.
    const summarizePrompt = `
      Current Summary: "${conversationSummary || 'None'}"
      Last 2 messages: ${JSON.stringify(history?.slice(-2) || [])}
      New Query: "${query}"

      Task: Update the summary of the conversation. Keep it under 50 words. Focus on technical topics and components mentioned.
      Return ONLY the updated summary text.
    `;

    const summaryPromise = fetch(nonStreamingUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: summarizePrompt }] }] })
    }).then(r => r.json());

    // 2. AMBIGUITY CHECK & QUERY REWRITING
    const rewritePrompt = `
      You are a technical query pre-processor.
      
      Conversation Summary: "${conversationSummary || 'None'}"
      Recent History: ${JSON.stringify(history || [])}
      User Query: "${query}"

      Task: 
      1. Determine if the User Query is ambiguous (e.g., uses "it", "that", "the previous one" without a clear referent).
      2. If ambiguous and cannot be resolved by history/summary, output: AMBIGUOUS: [Ask a brief clarification question]
      3. If clear or resolvable, rewrite the User Query into a standalone, specific search term for a datasheet.
         Output: SEARCH: [Your specific search term]

      Rules:
      - Be concise.
      - If it's a general greeting, use SEARCH: [original query].
      - Output ONLY the prefix (AMBIGUOUS: or SEARCH:) followed by your text.
    `;

    const rewriteResponse = await fetch(nonStreamingUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: rewritePrompt }] }] })
    });

    const rewriteData = await rewriteResponse.json();
    const rewriteResult = rewriteData.candidates?.[0]?.content?.parts?.[0]?.text || `SEARCH: ${query}`;

    // Set headers for SSE early
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send the updated summary as soon as it's ready
    summaryPromise.then(data => {
      const newSummary = data.candidates?.[0]?.content?.parts?.[0]?.text || conversationSummary;
      res.write(`data: ${JSON.stringify({ summary: newSummary })}\n\n`);
    }).catch(e => console.error("Summary update failed", e));

    if (rewriteResult.startsWith('AMBIGUOUS:')) {
      const clarification = rewriteResult.replace('AMBIGUOUS:', '').trim();
      res.write(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: clarification }] } }] })}\n\n`);
      return res.end();
    }

    const searchTerminal = rewriteResult.replace('SEARCH:', '').trim();

    // 3. GENERATE EMBEDDING for the rewritten query
    const embedResponse = await fetch(embeddingUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        model: "models/gemini-embedding-001", 
        content: { parts: [{ text: searchTerminal }] }
      }),
    });

    if (!embedResponse.ok) {
      const errorText = await embedResponse.text();
      throw new Error(`Failed to embed query: ${errorText}`);
    }
    const { embedding: queryEmbeddingData } = await embedResponse.json();
    const queryEmbedding = queryEmbeddingData.values;

    // 4. VECTOR SEARCH
    const { data: documents, error: matchError } = await supabaseClient.rpc(
      "match_documents",
      {
        query_embedding: queryEmbedding,
        match_threshold: 0.3, // Lowered slightly to be more inclusive of rewritten terms
        match_count: 5,
        file_paths: selectedFiles,
      },
    );

    if (matchError) throw matchError;

    // 5. FINAL GENERATION
    const context = documents
      .map((doc: { content: string }) => doc.content)
      .join("\n\n");

    const finalPrompt = `
      You are an expert technical assistant for embedded systems engineers.
      
      Conversation Context: ${conversationSummary}
      Recent History: ${JSON.stringify(history?.slice(-4) || [])}

      Context from Datasheets:
      ${context}

      User Question: ${query}

      Instructions:
      1. Answer based primarily on the Datasheet Context. 
      2. Use the Conversation Context/History only to ensure flow and address follow-ups.
      3. Be concise and direct. No preambles.
      4. If the information isn't in the context, say so.

      Answer:
    `;

    const generateResponse = await fetch(generativeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: finalPrompt }] }],
      }),
    });

    if (!generateResponse.ok) {
      const errorText = await generateResponse.text();
      console.error('Gemini API Error:', errorText);
      res.write(`data: ${JSON.stringify({ error: errorText })}\n\n`);
      return res.end();
    }

    if (!generateResponse.body) {
      throw new Error('No response body from Gemini');
    }

    // Pipe the stream from Gemini directly to the client
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

    return;

  } catch (error: any) {
    console.error("Error in RAG pipeline:", error);
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message });
    }
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
}

    

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
