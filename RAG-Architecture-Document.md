# LegacyLens: RAG Architecture Document

## Overview

LegacyLens is a Retrieval-Augmented Generation (RAG) system that makes legacy COBOL codebases queryable through natural language. The system indexes the GnuCOBOL Contrib repository (791 files, 13,187 code chunks) and exposes 8 distinct query modes through a web interface.

---

## 1. Vector Database Selection

**Choice:** Pinecone (Serverless, Free Tier) — AWS us-east-1

**Rationale:** Pinecone was selected as a managed, serverless vector database to eliminate DevOps overhead within the 3-day sprint window. Key factors:

- **Zero infrastructure management:** No Docker containers, persistent volumes, or database administration required. The serverless model auto-scales on demand.
- **Seamless Vercel integration:** Because Pinecone is a cloud service, the Next.js API route on Vercel can connect via a simple HTTP client without any persistent server-side storage.
- **Free tier capacity:** 2GB storage on the free tier comfortably accommodates our 12,287 vectors at 1536 dimensions (~95MB of vector data).

**Tradeoffs Considered:**

| Option | Why Rejected |
|---|---|
| ChromaDB (local) | Cannot persist on Vercel serverless without a separate server |
| pgvector | Requires a managed Postgres instance ($15-70/month) |
| Qdrant Cloud | Equally valid; Pinecone chosen for simpler Node.js SDK |
| Self-hosted Milvus | Too much DevOps overhead for a 3-day build |

---

## 2. Embedding Strategy

**Model:** OpenAI `text-embedding-3-small` (1536 dimensions, cosine similarity)

**Rationale:** A deliberate trade-off favoring speed and simplicity over code-specific optimization:

- **Cost:** $0.02 per 1M tokens. Full codebase ingestion cost under $0.10.
- **Quality:** Produces high-quality semantic representations of COBOL code and comments, sufficient for paragraph-level retrieval.
- **Single provider:** Eliminates the need for a second API account (e.g., Voyage AI), reducing setup time and authentication complexity.

**Dimension choice:** Full 1536 dimensions were used (no compression) to maximize semantic accuracy. Compression to 512 dimensions would save ~67% storage but risk losing subtle semantic distinctions between similar COBOL paragraphs.

**Batch processing:** Chunks are embedded in batches of 50 (rather than individual calls) to avoid OpenAI rate limits while keeping ingestion simple. Total ingestion time: ~5 minutes for 13,187 chunks.

**Alternative considered:** Voyage Code 2 — optimized for code, but requires a separate API key and costs 6x more per token. The performance uplift for COBOL (a language Voyage was not specifically trained on) was deemed insufficient to justify the complexity.

---

## 3. Chunking Approach

**Strategy:** Syntax-aware splitting based on COBOL's structural hierarchy.

COBOL has an explicit, rigid structure that maps naturally to a chunking hierarchy:

```
IDENTIFICATION DIVISION  → Program metadata chunk
DATA DIVISION            → Data structure chunk
PROCEDURE DIVISION       → Entry point chunk
  SECTION-NAME SECTION   → Section chunk
    PARAGRAPH-NAME.      → Paragraph chunk (finest granularity)
```

**Implementation:** A custom regex-based parser (`src/cobolChunker.ts`) scans each `.cob`, `.cbl`, and `.cpy` file line-by-line, detecting division headers, section headers, and paragraph labels. A new chunk is emitted at each structural boundary.

**Metadata preserved per chunk:**
| Field | Example |
|---|---|
| `source` | `samples/dasize/dasize.cob` |
| `loc_start` | 48 |
| `loc_end` | 72 |
| `division` | `PROCEDURE DIVISION` |
| `section` | `MAIN SECTION` |
| `paragraph` | `CALCULATE-INTEREST` |

**Why not fixed-size chunking:** Fixed-size chunking (e.g., 512 tokens with overlap) would split COBOL paragraphs mid-logic, breaking the semantic integrity of business rule units. A COBOL PARAGRAPH is the natural unit of behavior, equivalent to a function in modern languages.

---

## 4. Retrieval Pipeline

**Query flow:**

```
User Query
    ↓
Query Preprocessing (strip mode-specific language)
    ↓
File Hint Extraction (detect mentioned file names)
    ↓
OpenAI Embedding (text-embedding-3-small)
    ↓
Pinecone Vector Search (top-30 if file hint, top-10 otherwise)
    ↓
File-Hint Re-ranking (prioritize chunks from mentioned file)
    ↓
Top-10 Chunks Selected
    ↓
LLM Answer Generation (gpt-4o-mini, streaming)
    ↓
Streamed Response to Client
```

**Query preprocessing:** Mode-specific language is stripped before embedding. For example, "Translate the cobxref tool to Python" becomes "cobxref tool" for the vector search. This prevents the Python/translate language from pulling retrieval toward non-COBOL content.

**File-hint re-ranking:** When a user mentions a specific file (e.g., "dasize.cob"), the system fetches 3x the normal result pool from Pinecone, then sorts chunks from the target file to the top before truncating to top-10. This is a client-side re-ranking that does not require a dedicated re-ranking model.

**Top-k value:** k=10 was chosen as the retrieval depth. At an average chunk size of ~300 tokens, 10 chunks produces approximately 3,000 tokens of context — well within `gpt-4o-mini`'s 128k context window, while providing sufficient redundancy for complex queries.

**No LLM re-ranking:** A cross-encoder re-ranking step (e.g., Cohere Rerank) was evaluated but rejected for the MVP. The added API call would increase latency by 500-1000ms, risking violation of the <3 second end-to-end target.

---

## 5. Failure Modes Discovered

**5.1 Small Chunk Retrieval Gap**
COBOL paragraphs containing only 1-3 lines (e.g., a MAIN paragraph that only calls `PERFORM ROOT`) produce low-quality embeddings with insufficient semantic signal. These chunks score poorly in similarity search even when they are the precise answer to the user's query.

*Example:* "Translate the MAIN paragraph from dasize.cob to Python" fails to retrieve the 2-line MAIN paragraph at L48-49, instead retrieving the IDENTIFICATION DIVISION chunk at L2-20.

*Mitigation implemented:* File-hint re-ranking (described above) partially addresses this.

*Future fix:* Hierarchical chunking — always include the parent section's context alongside small paragraph chunks to ensure minimum token density per vector.

**5.2 Mode Language Embedding Pollution**
Queries prefixed with mode-specific language ("Translate...to Python", "Scan for bugs in...") shift the embedding toward the task language rather than the code content. This was fixed by stripping mode verbs/targets before embedding.

**5.3 Cross-File PERFORM Dependencies**
COBOL programs use `PERFORM paragraph-name` to call logic, sometimes across copybooks. The current retrieval pipeline cannot trace multi-hop call chains (A calls B calls C) because each chunk is retrieved independently. This limits the accuracy of Dependency and Impact analyses.

*Future fix:* Build a static call graph during ingestion and store it as metadata, enabling graph traversal at query time.

---

## 6. Performance Results

| Metric | Target | Actual |
|---|---|---|
| Query latency (end-to-end) | < 3 seconds | 1.3s – 8.6s (avg ~4s) |
| Retrieval precision (top-5) | > 70% | ~75% for broad queries |
| Codebase coverage | 100% of files | 791/791 files (100%) |
| Ingestion throughput | 10,000+ LOC in < 5 min | 13,187 chunks in ~5 min |
| Answer accuracy | Correct file/line refs | Correct in 6/8 modes tested |

*Note on latency:* The <3s target is met for simple factual queries. Complex generative tasks (Document, Translate) typically take 6-9 seconds due to longer LLM output generation. Streaming is enabled to improve perceived latency — the first tokens appear within ~1 second in all cases.
