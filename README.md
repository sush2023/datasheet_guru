# datasheet_guru
Hold the context here so your head doesn't have to.

**Data Sheet Guru** is an AI-powered technical assistant for embedded systems engineers. It uses advanced RAG (Retrieval-Augmented Generation) to help you query PDF datasheets with extreme accuracy, especially for complex electrical specifications and tables.

## 🚀 Key Features
- **Multimodal Ingestion:** Uses Gemini Flash to "see" and extract structured Markdown (including tables) from raw PDF datasheets.
- **Parent-Child RAG:** Implements a "Small-to-Big" retrieval strategy. We search small, precise fragments but feed the LLM entire Markdown sections for maximum context.
- **Conversational Memory:** Remembers previous questions to handle follow-up queries naturally.
- **Real-time Processing Status:** UI indicates when a file is being analyzed by the AI backend.

## 🏗️ Architecture
- **Frontend:** React (Vite) + Supabase Auth.
- **Backend:** Vercel Serverless Functions (Node.js/TypeScript).
- **Database:** Supabase (PostgreSQL + pgvector).
- **AI Models:** 
    - **Inversion:** Gemini Flash (Multimodal extraction).
    - **Embeddings:** Gemini Text-Embedding-004 (3072 dimensions).
    - **Chat:** Gemini Flash (Streaming SSE).

##  tech stack
- react, typescript, vite.
- supabase (auth, storage, database, edge webhooks).
- vercel (hosting, serverless api).
- google generative ai (gemini).