import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import pdf from 'pdf-parse-fork';

// Helper to chunk markdown into Parents and Children
interface ChildChunk {
  content: string;
  page?: number;
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
      if (currentBody.trim()) {
        parents.push(processSection(currentHeader, currentBody, maxChildSize, overlap));
      }
      currentHeader = part;
      currentBody = '';
    } else {
      currentBody += part;
    }
  }
  
  if (currentBody.trim() || currentHeader.trim()) {
    parents.push(processSection(currentHeader, currentBody, maxChildSize, overlap));
  }

  return parents;
}

function processSection(header: string, body: string, chunksize: number, overlap: number): ParentChunk {
  const fullContent = (header + "\n" + body).trim();
  const children: ChildChunk[] = [];
  
  // Track the current page as we move through the body
  let currentPage = extractPageNumber(header) || 1;

  // Split by double newline to identify potential chunks (paragraphs/tables)
  const paragraphs = body.split(/\n\s*\n/);
  
  let currentChild = '';
  let currentChildPage = currentPage;

  for (const p of paragraphs) {
    // If this paragraph contains a page marker, update the current page
    const foundPage = extractPageNumber(p);
    if (foundPage !== undefined) {
      currentPage = foundPage;
    }

    if ((currentChild + "\n\n" + p).length <= chunksize) {
      if (!currentChild) currentChildPage = currentPage; // Set page for the start of the chunk
      currentChild += (currentChild ? "\n\n" : "") + p;
    } else {
      if (currentChild) {
        children.push({ 
          content: (header ? header.trim() + "\n" : "") + currentChild.trim(),
          page: currentChildPage
        });
      }
      currentChild = p;
      currentChildPage = currentPage;
    }
  }

  if (currentChild) {
    children.push({ 
      content: (header ? header.trim() + "\n" : "") + currentChild.trim(),
      page: currentChildPage
    });
  }

  return {
    content: fullContent,
    children: children
  };
}

// Helper to extract [Page X] from a string
function extractPageNumber(text: string): number | undefined {
  const match = text.match(/\[Page\s+(\d+)\]/i);
  return match ? parseInt(match[1], 10) : undefined;
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

    // 1. Get total page count using pdf-parse-fork
    let parser = pdf;
    if ((pdf as any).default) {
      parser = (pdf as any).default;
    }
    const pdfMetadata = await parser(buffer);
    const totalPages = pdfMetadata.numpages;
    console.log(`[PDF] metadata: totalPages=${totalPages}`);

    const base64Pdf = buffer.toString('base64');
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${googleApiKey}`;
    const embeddingUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${googleApiKey}`;

    // 2. Define page batches
    const batchSize = 8;
    const batches: { start: number; end: number }[] = [];
    for (let i = 1; i <= totalPages; i += batchSize) {
      batches.push({ start: i, end: Math.min(i + batchSize - 1, totalPages) });
    }

    // 3. Fire parallel Gemini requests
    const markdownResults = await Promise.all(
      batches.map(async (batch) => {
        console.log(`[Gemini] Requesting extraction for pages ${batch.start}-${batch.end}...`);
        const response = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: `Extract pages ${batch.start} through ${batch.end} of this PDF into structured Markdown. 
                
CRITICAL INSTRUCTIONS:
1. For EVERY paragraph, header, list item, and table, you MUST prepend it with a [Page Z] marker, where Z is the actual page number from the PDF.
   Example: "[Page 2] ## Absolute Maximum Ratings"
2. Preserve all technical values exactly.
3. Convert all data tables into perfectly formatted Markdown tables.
4. Focus ONLY on content between pages ${batch.start} and ${batch.end}.
5. Do not include any conversational filler.` },
                { inlineData: { mimeType: "application/pdf", data: base64Pdf } }
              ]
            }]
          })
        });

        if (!response.ok) throw new Error(`Gemini batch ${batch.start}-${batch.end} failed: ${await response.text()}`);
        const json = await response.json();
        const markdown = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
        console.log(`[Gemini] Pages ${batch.start}-${batch.end}: Received ${markdown.length} chars.`);
        return markdown;
      })
    );

    // 4. Process each batch's markdown and insert into Supabase
    let totalChildrenInserted = 0;
    
    for (const markdownText of markdownResults) {
      if (!markdownText) continue;

      const parentChunks = chunkMarkdown(markdownText);

      for (const parent of parentChunks) {
        if (!parent.content.trim()) continue;

        // Insert Parent
        const { data: parentData, error: parentError } = await supabaseClient
          .from("documents")
          .insert({
            content: parent.content,
            metadata: { 
              fileName: filePath, 
              type: 'parent',
              page: extractPageNumber(parent.content) || 1
            },
            user_id: userID,
          })
          .select('id')
          .single();

        if (parentError) throw parentError;
        const parentId = parentData.id;

        const validChildren = parent.children.filter(c => c.content.trim());
        if (validChildren.length === 0) continue;

        // Generate Embeddings for Children
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

        // Insert Children
        const childrenToInsert = validChildren.map((child, index) => ({
          content: child.content,
          embedding: embeddings[index],
          metadata: { 
            fileName: filePath, 
            type: 'child',
            page: child.page || 1 
          },
          parent_id: parentId,
          user_id: userID,
        }));

        const { error: childError } = await supabaseClient.from("documents").insert(childrenToInsert);
        if (childError) throw childError;
        totalChildrenInserted += childrenToInsert.length;
      }
    }

    console.log(`Successfully processed ${filePath}. Total children: ${totalChildrenInserted}`);
    return res.status(200).json({ message: "Processing complete." });
  } catch (error: any) {
    console.error(`Error processing datasheet ${filePath}:`, error.message);
    return res.status(500).json({ error: error.message });
  }
}
