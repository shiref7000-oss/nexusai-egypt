-- Optional pgvector columns (no-op if extension missing)

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
  ALTER TABLE business_products ADD COLUMN IF NOT EXISTS embedding vector(768);
  ALTER TABLE bci_embedding_cache ADD COLUMN IF NOT EXISTS embedding vector(768);
  ALTER TABLE context_chunks ADD COLUMN IF NOT EXISTS embedding vector(768);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping pgvector columns: %', SQLERRM;
END $$;
