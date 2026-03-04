# LegacyLens

A RAG (Retrieval-Augmented Generation) system that makes legacy COBOL codebases queryable through natural language. Ask questions, get explanations, documentation, translation hints, and more—backed by real code references.

**Live demo:** [legacylens-lake.vercel.app](https://legacylens-lake.vercel.app)

## Features

- **Natural language queries** — Ask about entry points, file I/O, dependencies, and more
- **11 query modes** — Ask, Explain, Document, Translate, Test Gen, Modernize, Cross-Ref, Biz Logic, Deps, Bug Scan, Impact
- **Syntax-aware chunking** — COBOL divisions, sections, and paragraphs as retrieval units
- **Visual call graph** — Explore PERFORM, CALL, COPY, and GO TO relationships
- **Streaming responses** — See answers as they're generated

## Prerequisites

- **Node.js** 18+ and npm
- **API keys:** OpenAI, Pinecone (see [Setup](#setup))

## Setup

### 1. Clone and install

```bash
git clone https://github.com/rj-gauntlet/LegacyLens.git
cd LegacyLens
npm install
```

### 2. Environment variables

Create a `.env` file in the project root (see `.env.example` if provided, or use this template):

```env
OPENAI_API_KEY=sk-your-openai-key
PINECONE_API_KEY=pcsk_your-pinecone-key
PINECONE_INDEX=legacylens
```

**Important:** Never commit `.env` to version control. It is listed in `.gitignore`.

### 3. Ingest the codebase

Clone the GnuCOBOL Contrib repo into the `codebase` folder, then run ingestion:

```bash
git clone https://github.com/OCamlPro/gnucobol-contrib.git codebase
npm run ingest
```

Ingestion takes ~5 minutes for ~13k chunks. Requires a valid Pinecone index (Serverless, 1536 dimensions, cosine similarity).

### 4. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
LegacyLens/
├── app/                    # Next.js App Router
│   ├── api/
│   │   ├── query/          # RAG query endpoint (POST)
│   │   └── callgraph/      # Call graph data endpoint
│   ├── globals.css         # Global styles
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Main chat UI
├── src/
│   ├── cobolChunker.ts     # Syntax-aware COBOL chunking
│   ├── generate.ts         # LLM answer generation
│   ├── retriever.ts        # Pinecone retrieval + hybrid search
│   ├── types.ts            # Shared TypeScript types
│   ├── ingest.ts           # Ingestion script
│   └── evaluate.ts         # Retrieval and E2E eval scripts
├── evals/                  # Evaluation output
│   ├── results/            # JSON results per run
│   ├── history.jsonl       # Summary per run (trend tracking)
│   └── README.md           # Eval usage docs
├── codebase/               # Cloned COBOL repo (gitignored)
├── Pre-Search-Document.md  # Architecture decisions
├── RAG-Architecture-Document.md
├── AI-Cost-Analysis.md
└── TESTING.md              # Testing strategy and QA checklist
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Run production server |
| `npm run ingest` | Ingest codebase into Pinecone |
| `npm run eval` | Run retrieval evaluation |
| `npm run eval:e2e` | Run end-to-end (retrieve + LLM) evaluation |
| `npm run eval:all` | Run both retrieval and E2E evals |

## Documentation

- [Pre-Search Document](Pre-Search-Document.md) — Constraints and architecture decisions
- [RAG Architecture](RAG-Architecture-Document.md) — Vector DB, chunking, retrieval pipeline
- [AI Cost Analysis](AI-Cost-Analysis.md) — Development and production cost estimates
- [TESTING.md](TESTING.md) — Testing strategy and QA checklist
