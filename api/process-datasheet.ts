import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Helper to chunk markdown into Parents and Children
// A Parent is a major section (defined by H1/H2).
// Children are smaller chunks (paragraphs, lists, tables) within that Parent.
interface ChildChunk {
  content: string;
}

interface ParentChunk {
  content: string;
  children: ChildChunk[];
}

function chunkMarkdown(markdown: string, maxChildSize: number = 500, overlap: number = 50): ParentChunk[] {
  const parents: ParentChunk[] = [];
  
  // 1. Split into major sections (Parents) using H1 or H2
  const sectionRegex = /(^#\s+.+$|^##\s+.+$)/m;
  const parts = markdown.split(sectionRegex);
  
  let currentHeader = '';
  let currentBody = '';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (sectionRegex.test(part)) {
      // If we already have a body, save it as a parent chunk
      if (currentBody.trim()) {
        parents.push(processSection(currentHeader, currentBody, maxChildSize, overlap));
      }
      currentHeader = part;
      currentBody = '';
    } else {
      currentBody += part;
    }
  }
  
  // Add the last section
  if (currentBody.trim() || currentHeader.trim()) {
    parents.push(processSection(currentHeader, currentBody, maxChildSize, overlap));
  }

  return parents;
}

function processSection(header: string, body: string, chunksize: number, overlap: number): ParentChunk {
  const fullContent = (header + "\n" + body).trim();
  const children: ChildChunk[] = [];
  
  // Simple child chunking: split by double newline (paragraphs/tables)
  const paragraphs = body.split(/\n\s*\n/);
  
  let currentChild = '';
  for (const p of paragraphs) {
    if ((currentChild + "\n\n" + p).length <= chunksize) {
      currentChild += (currentChild ? "\n\n" : "") + p;
    } else {
      if (currentChild) {
        // Prepend header to give child context even on its own
        children.push({ content: (header ? header.trim() + "\n" : "") + currentChild.trim() });
      }
      currentChild = sentenceCorrection(p);
    }
  }
  if (currentChild) {
    children.push({ content: (header ? header.trim() + "\n" : "") + currentChild.trim() });
  }

  // Fallback if chunks are empty or too big (e.g., massive tables without newlines)
  if (children.length === 0 || children.some(c => c.content.length > chunksize * 1.5)) {
    children.length = 0;
    let i = 0;
    while (i < body.length) {
      const end = Math.min(i + chunksize, body.length);
      let chunk = body.slice(i, end);
      const lastSpace = chunk.lastIndexOf(' ');
      if (lastSpace > -1 && (end - (i + lastSpace) < overlap) && end < body.length) {
        chunk = chunk.substring(0, lastSpace);
      }
      children.push({ content: (header ? header.trim() + "\n" : "") + chunk.trim() });
      i = end - overlap;
      if (i < 0) i = 0;
      if (i > body.length) break;
      i += Math.max(chunk.length - overlap, i);
    }
  }

  return {
    content: fullContent,
    children: children
  };
}

// Minimal helper to handle string assignment in loop
function sentenceCorrection(p: string): string {
  return p;
}

const setCorsHeaders = (res: VercelResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type, x-process-secret');
};

export default async function(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    return res.status(200).send('ok');
  }

  const processSecret = process.env.PROCESS_DATASHEET_SECRET;
  const providedSecret = req.headers['x-process-secret'];

  if (!processSecret || providedSecret !== processSecret) {
    console.error('Unauthorized attempt to call process-datasheet function.');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { record } = req.body;
  const filePath = record?.name;
  const userID = record?.owner;

  if (!filePath || !userID) {
    return res.status(400).json({ error: 'Missing filepath or owner in webhook payload.' });
  }

  console.log(`Processing datasheet: ${filePath}`);

  try {
    const supabaseClient = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string
    );

    const { data: fileData, error: downloadError } = await supabaseClient.storage.from("datasheets").download(filePath);
    if (downloadError) throw downloadError;

    const googleApiKey = process.env.GOOGLE_API_KEY;
    if (!googleApiKey) throw new Error("GOOGLE_API_KEY is missing.");

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const base64Pdf = buffer.toString('base64');

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${googleApiKey}`;
    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Extract the contents of this PDF into structured Markdown. Preserve all headers, lists, and convert all data tables into perfectly formatted Markdown tables. Do not include any conversational filler." },
            { inlineData: { mimeType: "application/pdf", data: base64Pdf } }
          ]
        }]
      })
    });

    if (!geminiResponse.ok) throw new Error(`Gemini PDF parsing failed: ${await geminiResponse.text()}`);

    const geminiJson = await geminiResponse.json();
    const markdownText = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!markdownText) throw new Error("Gemini failed to extract text from PDF.");

    const parentChunks = chunkMarkdown(markdownText);
    const embeddingUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${googleApiKey}`;

    let totalChildrenInserted = 0;
    for (const parent of parentChunks) {
      if (!parent.content.trim()) continue;

      const { data: parentData, error: parentError } = await supabaseClient
        .from("documents")
        .insert({
          content: parent.content,
          metadata: { fileName: filePath, type: 'parent' },
          user_id: userID,
        })
        .select('id')
        .single();

      if (parentError) throw parentError;
      const parentId = parentData.id;

      const validChildren = parent.children.filter(c => c.content.trim());
      if (validChildren.length === 0) continue;

      const embeddings = await Promise.all(
        validChildren.map(async (child) => {
          const response = await fetch(embeddingUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "models/gemini-embedding-001",
              content: { parts: [{ text: child.content }] }
            }),
          });
          if (!response.ok) throw new Error(`Failed to get embedding: ${await response.text()}`);
          const json = await response.json();
          return json.embedding.values;
        })
      );

      const childrenToInsert = validChildren.map((child, index) => ({
        content: child.content,
        embedding: embeddings[index],
        metadata: { fileName: filePath, type: 'child' },
        parent_id: parentId,
        user_id: userID,
      }));

      const { error: childError } = await supabaseClient.from("documents").insert(childrenToInsert);
      if (childError) throw childError;
      totalChildrenInserted += childrenToInsert.length;
    }

    console.log(`Successfully processed ${filePath}. Parents: ${parentChunks.length}, Children: ${totalChildrenInserted}`);
    return res.status(200).json({ message: "Processing complete." });
  } catch (error: any) {
    console.error(`Error processing datasheet ${filePath}:`, error.message);
    return res.status(500).json({ error: error.message });
  }
}
