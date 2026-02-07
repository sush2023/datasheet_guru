-- Change the embedding column to support 3072 dimensions
-- This matches the output of the newer Gemini embedding models
ALTER TABLE documents
ALTER COLUMN embedding TYPE vector(3072);

-- Note: We also need to update the match_documents function
-- because it accepts a vector parameter which must match the
-- column type.
DROP FUNCTION IF EXISTS match_documents;

create or replace function match_documents (
  query_embedding vector(3072), -- Updated to 3072
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where 1 - (documents.embedding <=> query_embedding) >
match_threshold
  order by similarity desc
  limit match_count;
$$;

