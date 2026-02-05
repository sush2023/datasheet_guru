import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import * as pdf from 'pdf-parse';

function chunkText(text: string, chunksize: number = 500, overlap: number = 50): string[] {
  const chunks: string[] = [];
  if (!text) return chunks;
  const sentences = text.split(/(?<=[.?!])\s+/); // Split by sentence endings

  let currentChunk = '';
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= chunksize) {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      currentChunk = sentence;
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk)
  }

  // Fallback if chunks not populated or any chunks larger than designated size
  if (chunks.length == 0 || chunks.some(c => c.length > chunksize)) {
    chunks.length = 0;
    let i = 0;
    while (i < text.length) {
      const end = Math.min(i + chunksize, text.length);
      let chunk = text.slice(i, end);

      // attempt to end chunk at natural break
      const lastSpace = chunk.lastIndexOf(' ');
      if (lastSpace > -1 && (end - (i + lastSpace) < overlap) && end < text.length) {
        chunk = chunk.substring(0, lastSpace);
      }
      chunks.push(chunk.trim());
      i = end - overlap;
      if (i < 0) i = 0;
      if (i > text.length) break;
      i += Math.max(chunk.length - overlap, i);
    }
  }
  return chunks;
}


const setCorsHeaders = (res: VercelResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type, x-process-secret');
};

export default async function(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  // CORS request can respond with 200 outright
  if (req.method === 'OPTIONS') {
    return res.status(200).send('ok');
  }

  // Security Check by checking for env vars that have the necessary secrets
  const processSecret = process.env.PROCESS_DATASHEET_SECRET;
  const providedSecret = req.headers['x-process-secret'];

  if (!processSecret) {
    console.error('PROCESS_DATAHSHEET_SECRET not set/ defined');
    return res.status(500).json({ error: 'Server secret not set' });
  }

  if (!providedSecret || providedSecret !== processSecret) {
    console.error('Unauthorized attempt to call process-datasheet func');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // parse incoming request to derive the filePath/ file that needs processed
  const { record } = req.body;
  const filePath = record?.name;
  if (!filePath) {
    console.error("File path not found in webhook payload");
    return res.status(400).json({ error: 'Missing filepath in webhook payload' });
  }
  const userID = record?.owner;
  if (!userID) {
    console.error("Owner field is null");
    return res.status(400).json({ error: 'Missing owner field in webhook payload' })
  }

  try {
    // supabase client init
    const supabaseClient = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string
    )
    // download file from supabase datasheets storage
    const { data: fileData, error: downloadError } = await supabaseClient.storage.from("datasheets").download(filePath);
    if (downloadError) {
      throw downloadError;
    }

    // gemini embeddings URL
    const googleApiKey = process.env.GOOGLE_API_KEY;
    if (!googleApiKey) {
      return res.status(400).json({ error: "GOOGLE_API_KEY is empty" });
    }
    const embeddingUrl = `https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${googleApiKey}`;

    // grab text from pdf and make chunks of the text
    const buffer = Buffer.from(await fileData.arrayBuffer());
    const pdfData = await (pdf as any).default(buffer);
    const text = pdfData.text
    if (!text) {
      return res.status(400).json({ error: "pdf has no text" });
    }
    const textChunks = chunkText(text);
    // generate embeddings
    const embeddings = Promise.all(
      textChunks.map(async (chunk) => {
        const response = await fetch(embeddingUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "models/embedding-001",
            content: { parts: [{ text: chunk }] }
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to get embedding: ${errorText}`);
        }

        const json = await response.json();
        return json.embedding.values;
      })
    );
    // prepare insertion data for database
    const documentsToInsert = textChunks.map((chunk, index) => ({
      content: chunk,
      embedding: embeddings[index],
      metadata: { fileName: filePath },
      user: userID,
    }));
    // insert data into database
    const { error: insertError } = await supabaseClient.from("documents").insert(documentsToInsert);
    if (insertError) {
      throw insertError;
    }
    return res.status(200).json({ message: `Successfully processed and embedded ${filePath}` });
  }
  catch (error: any) {
    // error out/ return error
    console.error("Error in process-datasheet pipeline:", error);
    return res.status(500).json({ error: error.message });
  }
}
