CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    file_type TEXT NOT NULL, -- 'pdf' or 'docx'
    original_path TEXT DEFAULT '',
    converted_pdf_path TEXT,
    file_size BIGINT NOT NULL,
    page_count INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'uploading', -- 'uploading', 'extracting', 'chunking', 'ready', 'failed', 'needs_ocr'
    error_message TEXT,
    full_text TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_files (
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    kind VARCHAR(32) NOT NULL, -- 'original' or 'viewer_pdf'
    data BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (document_id, kind)
);


CREATE TABLE IF NOT EXISTS document_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_number INT NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    words_json JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    heading TEXT,
    start_page INT NOT NULL,
    end_page INT NOT NULL,
    start_char INT NOT NULL,
    end_char INT NOT NULL,
    text TEXT NOT NULL,
    tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(heading, '') || ' ' || text)) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_tsv ON chunks USING GIN(tsv);
CREATE INDEX IF NOT EXISTS idx_document_pages_doc_page ON document_pages(document_id, page_number);

CREATE TABLE IF NOT EXISTS chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL DEFAULT 'New Chat',
    document_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL, -- 'user' or 'assistant'
    content TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'completed', -- 'streaming', 'completed', 'stopped', 'failed', 'interrupted'
    quotes JSONB DEFAULT '[]'::jsonb,
    coverage JSONB DEFAULT '{}'::jsonb,
    provider_used TEXT NOT NULL DEFAULT 'manual',
    fallback_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS provider_used TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS fallback_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id, created_at);

