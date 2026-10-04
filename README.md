# Legal Contract Analyser ⚖️

A high-performance, full-stack legal document analysis platform. Upload contracts (PDF or DOCX), chat with them using streaming responses backed by **verified quotes**, jump directly to cited passages with interactive bounding-box highlights, compare two document versions side-by-side with rule-based significance scoring, and generate tracked-change DOCX redlines.

🌐 **Live Application URL**: [https://doc-reader-w931.onrender.com](https://doc-reader-w931.onrender.com)

> ⚡ **Free Hosting Note**: Hosted on Render free tier + Neon PostgreSQL. Free services spin down after inactivity; the initial load may take about 60 seconds to start from a cold start.

---

## 📷 UI Walkthrough & Features

![Legal Contract Analyser Interface](docs/ui_demo.png)

- **Upload & Automated Processing**: Fast validation of PDF/DOCX header magic bytes and size limits (<= 50MB). Automated background pipeline handles text extraction, page word bounding boxes, clause chunking, and LibreOffice conversion.
- **Database Persistence**: File binaries (original documents, converted viewer PDFs, and redlined DOCX outputs) are stored as `BYTEA` in PostgreSQL (`document_files` table), guaranteeing files persist permanently across container restarts and redeployments without disk volume dependence.
- **Scanned PDF Detection**: Automatically detects scanned documents with insufficient selectable text (< 25 chars/page) and flags them with a `needs_ocr` status.
- **Real Groq AI Provider & Automatic Fallback**: Powered by Groq (`llama-3.1-8b-instant`). If Groq is unavailable, unconfigured, or rate-limited, the system silently falls back to the manual provider and notifies the user with a UI toast and badge.
- **Verified Quotes System**: Every answer quote (AI-generated or manual) is verified against canonical document text using NFKC normalisation, character offset mapping, and conservative fuzzy matching. Clicking a verified quote opens the document viewer at the exact page and passage.
- **Coverage Transparency & Map-Reduce Scan**: Tracks searched sections vs total document sections. Supports a **Scan All** mode using a parallel map-reduce pipeline for exhaustive existence queries across large contracts.
- **Side-by-Side Document Comparison**: Aligns clauses across two versions, labels changes (`added`, `removed`, `modified`, `moved`, `unchanged`), scores significance (`HIGH`, `MEDIUM`, `LOW`), and generates AI summaries for each change.
- **Tracked-Change Redlining (DOCX)**: AI-suggested redline edits or manual find/replace. Edits `word/document.xml` using `lxml` to insert OpenXML `<w:del>` and `<w:ins>` tags with author and timestamp attributes while preserving original formatting (`<w:rPr>`).

```
[ Upload Box ] ──> [ Python Extraction ] ──> [ Clause Chunker ] ──> [ Postgres FTS ]
                            │                                              │
                     [ LibreOffice PDF ]                          [ Groq AI / Manual ]
                            │                                              │
                    [ PDF.js Viewer ] <───── [ Verified Quotes ] ──────────┘
```

---

## 🔑 Groq API Setup & Environment Variables

### How to Get a Groq API Key
1. Go to [https://console.groq.com/keys](https://console.groq.com/keys) and sign in or create a free account.
2. Click **Create API Key**, copy your key, and paste it into `.env`.

### Environment Variables (.env)
```env
DATABASE_URL=postgresql://user:password@ep-xyz.neon.tech/neondb?sslmode=require

LLM_PROVIDER=groq            # groq | manual
LLM_API_KEY=gsk_your_groq_api_key_here
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.1-8b-instant   # fast & cheap default model
LLM_TIMEOUT_MS=30000
LLM_MAX_CONTEXT_CHARS=24000      # context budget per request, tuned to free-tier limits
```

> ⚠️ **Note**: If `LLM_API_KEY` is missing when `LLM_PROVIDER=groq`, the app automatically logs a warning at startup and uses the manual provider. Real API keys should never be committed to git repositories.

---

## 🛡️ Automatic Provider Fallback & Circuit Breaker

The system wraps the Groq AI provider in a resilient `FallbackProvider`:
- **Pre-stream Fallback**: On `AuthError` (401/403), `ServerError` (5xx), `TimeoutError`, `NetworkError`, or permanent `RateLimitError` (429 retried up to 2 times with header wait up to 5s), the system seamlessly switches to the manual provider for that request.
- **Circuit Breaker**: If Groq fails 3 consecutive times, an in-memory circuit breaker skips Groq for 60 seconds and routes directly to the manual provider.
- **Mid-stream Interruption**: If failure occurs *after* streaming text has already started, partial text is preserved, marked as `"interrupted"`, and a Retry button is displayed (never appending manual search results to a half-written AI response).
- **User Cancellation**: If the user clicks **Stop**, streaming halts, saving status as `"stopped"`, without triggering a fallback.
- **UI Notifications**: Every assistant message displays an **AI** or **Basic search mode** badge. When fallback triggers, a toast appears: *"AI is unavailable, answered using basic search instead."*

---

## 🛠️ Tech Stack

- **Frontend & API**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Database**: Neon PostgreSQL (Raw SQL queries via `pg` pool — NO ORM) with SSL support
- **Runtime**: Node.js 22 (`node:22-bookworm-slim` Docker image)
- **AI Provider**: Groq API (`POST /chat/completions` OpenAI-compatible API)
- **Python Processing**: PyMuPDF (`pymupdf`), `python-docx`, `lxml`
- **Document Viewing**: `pdfjs-dist` (Canvas rendering with SVG/div highlight overlays)
- **Headless Document Conversion**: LibreOffice (`soffice --headless --convert-to pdf`)
- **Testing**: Vitest for TypeScript & API logic (46 tests), Pytest for Python scripts (4 tests)

---

## 🚀 Local Setup Guide

### 1. Prerequisites
- Node.js >= 22
- Python 3.10+
- PostgreSQL (Local server or Neon database instance)
- LibreOffice (Optional but recommended for DOCX PDF conversion)

### 2. Environment Setup
```bash
cp .env.example .env
# Add your DATABASE_URL and LLM_API_KEY if testing with Groq
```

### 3. Install Dependencies & Setup Database
```bash
npm install
pip install -r python/requirements.txt
npm run migrate
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing Summary & Coverage

```bash
# Run all TypeScript unit, integration, fallback provider, & BYTEA storage tests (46 tests)
npm run test

# Run Python extraction and redline tests (4 tests)
npm run pytest
```

### What Was Tested
1. **Mocked Unit & Integration Tests (Vitest)**:
   - `test_postgres_storage.test.ts`: Verified BYTEA storage, document ingestion, viewer PDF persistence, and `ON DELETE CASCADE` behavior without any disk storage dependency.
   - `groqClient.test.ts`: SSE parsing, 401 AuthError, 429 RateLimitError with retry-after header, 500 ServerError, 30s timeout, user AbortSignal.
   - `quoteParser.test.ts`: Inline `<quote doc="D1">` parsing, tags split across stream chunks, unknown doc labels (`documentId: null`), nested/garbled tags, unclosed tags at stream end, `NOT_FOUND` response handling.
   - `fallbackProvider.test.ts`: Pre-stream fallback, mid-stream interruption preservation, user Stop handling, circuit breaker opening (3 failures) and recovery.
   - `e2e_verification.test.ts`: Verified that an invented quote emitted by mocked LLM is caught by the quote verifier and displayed as `unverified` (not clickable), while verbatim quotes pass as `verified`.
   - `compare.test.ts` & `big_document.test.ts`: 150-page document chunking, FTS retrieval, and clause comparison pipeline.
2. **Real API Integration**:
   - Tested live on Render + Neon with Groq API key (`llama-3.1-8b-instant`) for multi-document Q&A streaming, clause comparison AI summaries, and AI redline edit suggestions.

---

## ⚠️ Known Limits & Verification Safety

1. **Free-Tier Rate Limits**: Groq free-tier limits requests/minute (RPM) and tokens/minute (TPM). `groqClient` handles 429 responses with retries based on `retry-after` headers (capped at 5s), automatically falling back to basic search mode if rate limits persist.
2. **LLM Hallucinations & Quote Verification**: Generative AI models may occasionally produce paraphrased or invented quotes despite strict prompt rules. The app **never trusts the LLM**: every quote emitted inside `<quote>` tags is independently verified by `lib/quotes/verify.ts` against raw document text. Unverified quotes are clearly flagged and cannot be clicked to jump to document pages.
