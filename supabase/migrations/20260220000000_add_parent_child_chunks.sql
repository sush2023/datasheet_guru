-- Add parent_id to documents for Parent-Child chunking
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES documents(id) ON DELETE CASCADE;

-- Create an index on parent_id for faster lookups during join operations
CREATE INDEX IF NOT EXISTS idx_documents_parent_id ON documents(parent_id);

-- Update the match_documents function to handle parent-child retrieval
-- It will return the content of the parent if a child chunk is matched.
-- It ensures unique results (one parent per match set) by prioritizing the highest similarity child match per parent.
DROP FUNCTION IF EXISTS match_documents;

CREATE OR REPLACE FUNCTION match_documents (
  query_embedding vector(3072),
  match_threshold float,
  match_count int,
  file_paths text[] default null
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    sub.id,
    sub.content,
    sub.metadata,
    sub.similarity
  FROM (
    SELECT
      COALESCE(p.id, c.id) as id,
      COALESCE(p.content, c.content) as content,
      COALESCE(p.metadata, c.metadata) as metadata,
      1 - (c.embedding <=> query_embedding) AS similarity,
      ROW_NUMBER() OVER (
        PARTITION BY COALESCE(c.parent_id, c.id) 
        ORDER BY (1 - (c.embedding <=> query_embedding)) DESC
      ) as rn
    FROM documents c
    LEFT JOIN documents p ON c.parent_id = p.id
    WHERE 1 - (c.embedding <=> query_embedding) > match_threshold
    AND (
      file_paths IS NULL OR
      cardinality(file_paths) = 0 OR
      c.metadata->>'fileName' = ANY(file_paths)
    )
  ) sub
  WHERE sub.rn = 1
  ORDER BY sub.similarity DESC
  LIMIT match_count;
$$;
