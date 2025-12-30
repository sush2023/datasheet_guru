import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.2"
import * as pdfjs from "https://esm.sh/pdfjs-dist@3.4.120"

// Helper function to split text into chunks
function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + chunkSize, text.length);
    chunks.push(text.slice(i, end));
    i += chunkSize - overlap;
  }
  return chunks;
}

// Main function logic
serve(async (req) => {
  try {
    // 1. Create a Supabase client with the "service_role" key
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 2. Get the file path from the POST request body
    const { record } = await req.json();
    const filePath = record.name;

    // 3. Download the PDF from Supabase Storage
    const { data: fileData, error: downloadError } = await supabaseClient.storage
      .from("datasheets")
      .download(filePath);

    if (downloadError) {
      throw downloadError;
    }

    // 4. Parse the PDF to extract text using pdfjs-dist
    const pdfData = await fileData.arrayBuffer();
    const pdf = await pdfjs.getDocument(pdfData).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(" ");
      fullText += pageText + "\\n";
    }

    if (!fullText) {
      return new Response("PDF has no text content.", { status: 400 });
    }

    // 5. Chunk the text
    const textChunks = chunkText(fullText);

    // 6. Generate embeddings for each chunk using Google's API
    const googleApiKey = Deno.env.get("GOOGLE_API_KEY");
    const embeddingUrl = `https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${googleApiKey}`;
    
    const embeddings = await Promise.all(
      textChunks.map(async (chunk) => {
        const response = await fetch(embeddingUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "models/embedding-001", content: { parts: [{ text: chunk }] } })
        });

        if (!response.ok) {
          throw new Error(`Failed to get embedding: ${await response.text()}`);
        }
        const { embedding } = await response.json();
        return embedding.values;
      })
    );

    // 7. Prepare data for insertion into the database
    const documentsToInsert = textChunks.map((chunk, index) => ({
      content: chunk,
      embedding: embeddings[index],
      metadata: { filename: filePath },
    }));

    // 8. Insert the data into the 'documents' table
    const { error: insertError } = await supabaseClient
      .from("documents")
      .insert(documentsToInsert);

    if (insertError) {
      throw insertError;
    }

    // 9. Return a success response
    return new Response(JSON.stringify({ message: `Successfully processed ${filePath}` }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    // Generic error handling
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
