-- 1. Create an index on the filename within the metadata JSONB column for faster filtering
CREATE INDEX IF NOT EXISTS idx_documents_filename ON documents ((metadata->>'fileName'));

-- 2. Update the match_documents function to support optional file filtering
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
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE 1 - (documents.embedding <=> query_embedding) > match_threshold
  AND (
    file_paths IS NULL OR
    cardinality(file_paths) = 0 OR
    metadata->>'fileName' = ANY(file_paths)
  )
  ORDER BY similarity DESC
  LIMIT match_count;
$$;