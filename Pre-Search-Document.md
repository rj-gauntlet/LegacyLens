# LegacyLens: Pre-Search Document

This document captures the constraint-driven architectural decisions made prior to writing code for the LegacyLens project.

## Phase 1: Define Your Constraints

**1. Scale & Load Profile**
*   **Target Codebase:** OpenCOBOL Contrib (approx. 10,000 - 50,000 LOC)
    *   *Alternatives Considered:* GnuCOBOL (too abstract/large as a compiler), LAPACK/BLAS (too mathematical, lacks business logic focus).
*   **Expected Query Volume:** Demo / Portfolio Scale (10-100 queries/day)
    *   *Alternatives Considered:* Internal Team Scale (500-2k queries/day) - rejected to ensure we remain within free tier limits during development.
*   **Batch Ingestion or Incremental Updates:** One-time Batch Ingestion (MVP). 
    *   *Alternatives Considered:* Incremental Updates - rejected because setting up tracking DBs for file hashes adds too much overhead for a 3-day sprint. Future iterations for production would implement incremental updates via file-hashing or webhooks.
*   **Latency Requirements:** Interactive (< 3 seconds end-to-end). 
    *   *Alternatives Considered:* Strict Real-time (< 1s) - mathematically difficult with LLM API delays. Asynchronous (3-10s) - fails rubric requirement. Note: We will achieve < 3s via fast vector search and LLM response streaming.

**2. Budget & Cost Ceiling**
*   **Vector Database Hosting:** Free Tier / Serverless Cloud (Pinecone).
    *   *Alternatives Considered:* Self-hosted/Embedded (ChromaDB, pgvector) - rejected because managing persistent storage/Docker on Vercel deployment adds high friction.
*   **Embedding API Costs:** Low-Cost General Model (OpenAI `text-embedding-3-small`).
    *   *Alternatives Considered:* Local Embeddings (`sentence-transformers`) - requires heavy compute on server. Specialized Code Models (Voyage Code 2) - more expensive, requires extra API account setup.
*   **LLM API Costs:** Balanced Capability (OpenAI `gpt-4o-mini` for development, with a toggle for `gpt-4o` for final complex features).
    *   *Alternatives Considered:* Local LLM (Llama 3) - cannot easily be deployed on free serverless platforms.
*   **Money vs. Time Tradeoff:** Spend slightly on managed APIs/Hosting (Pinecone, OpenAI) to save significant setup time over local deployments.

**3. Time to Ship**
*   **MVP Timeline:** Recommended Target (Tuesday Night / 24 Hours) to hit the hard gate, leaving Wednesday for polish and docs.
*   **Must-Have Features (Code Understanding):** Code Explanation, Documentation Gen, Translation Hints, Business Logic Extract.
    *   *Alternatives Considered:* Dependency Mapping, Impact Analysis, Bug Pattern Search. These "Visual & Structural" features require much heavier bespoke parsing logic and will only be pursued as nice-to-haves once the core NLP-based features are done.
*   **Framework:** LangChain (using a custom syntax-aware chunker for COBOL).
    *   *Alternatives Considered:* Custom Pipeline (rejected because AI handles LangChain's boilerplate orchestration perfectly). LlamaIndex (rejected to keep MVP abstractions as simple as possible).

**4. Data Sensitivity**
*   **Codebase Type:** Open Source. No restrictions on sending code to external APIs like OpenAI or Pinecone.
    *   *Alternatives Considered:* Proprietary codebase - rejected because it would mandate local embeddings and local LLMs, violating our "Time to Ship" constraints.

**5. Team & Skill Constraints**
*   **Vector DB Familiarity:** None / Beginner. (Validated the choice to use managed Pinecone to offload DevOps).
*   **RAG Framework Experience:** None / Beginner. (Validated the use of standard, highly-documented LangChain abstractions).
*   **COBOL Comfort Level:** None. (Validates the core value proposition of the tool: making legacy code understandable to modern developers).

---

## Phase 2: Architecture Discovery

**6. Vector Database Selection**
*   **Choice:** Managed (Pinecone).
*   **Metadata:** Rich Metadata (File Path, Line Numbers, COBOL Division, Paragraph Name) to allow for advanced pre-filtering.
    *   *Alternatives Considered:* Basic Metadata (File Path only) - rejected because it makes complex RAG queries much harder to fulfill.
*   **Search Type:** Pure Vector Search (Semantic only) for MVP simplicity.
    *   *Alternatives Considered:* Hybrid Search (Vector + Keyword) - rejected for MVP due to added complexity of generating sparse vectors (BM25), though it could improve exact variable lookups later.

**7. Embedding Strategy**
*   **Model:** OpenAI `text-embedding-3-small`.
*   **Dimensions:** Standard (1536 dimensions) to maximize semantic accuracy.
    *   *Alternatives Considered:* Compressed (e.g., 512) - unnecessary since our 50k LOC easily fits in the free 2GB Pinecone tier.
*   **Batching:** Small Batches (~50-100 chunks per request) to safely avoid API rate limits without writing complex retry/backoff logic.

**8. Chunking Approach**
*   **Strategy:** Syntax-aware splitting based on COBOL Divisions, Sections, and Paragraphs. (Hard requirement for MVP).
    *   *Alternatives Considered:* Fixed-size chunking (e.g., 1000 characters) - rejected because it breaks logical boundaries in legacy code, leading to poor LLM explanations.
*   **Metadata Preserved:** File Path, Line Numbers, Division, Paragraph Name.

**9. Retrieval Pipeline**
*   **Top-k Value:** Medium (k=10 chunks) to balance context volume and token limits.
    *   *Alternatives Considered:* Low (k=3) - risks missing related code. High (k=25+) - risks confusing smaller LLMs and increasing latency/costs.
*   **Re-ranking:** No Re-ranking for the MVP (to preserve the <3s latency target).
    *   *Alternatives Considered:* Cross-Encoder Re-ranking (Cohere) - rejected as a premature optimization that adds an extra API call.
*   **Context Window:** Rely on the LLM's massive context window (128k tokens for gpt-4o-mini) rather than strict truncation logic.
*   **Query Style:** Single Query (no LLM pre-expansion) to optimize latency.
    *   *Alternatives Considered:* Multi-query Expansion - rejected because the pre-search LLM call risks violating the <3s latency target.

**10. Answer Generation**
*   **LLM:** OpenAI `gpt-4o-mini` (streaming enabled).

**11. Framework Selection**
*   **Choice:** LangChain (Node.js/TypeScript).

---

## Phase 3: Post-Stack Refinement

**12. Failure Mode Analysis**
*   **No Relevant Retrieval:** Strict "I don't know" Prompting. The system prompt will explicitly command the LLM to refuse answering if the retrieved context does not contain the answer, preventing hallucinations.
    *   *Alternatives Considered:* Similarity Score Thresholding - rejected because finding the perfect threshold number is difficult and brittle across different types of queries.
*   **Small Chunk Retrieval Gap (Discovered During Testing):** Very small COBOL paragraphs (1-3 lines, e.g., a MAIN paragraph that only contains a single PERFORM call) produce low-quality embeddings with insufficient semantic signal. When a user asks specifically about such a paragraph, the system retrieves surrounding structural chunks (e.g., IDENTIFICATION DIVISION) instead of the target paragraph. *Mitigation implemented:* A file-hint re-ranking system was added that fetches 3x the usual number of results and prioritizes chunks from the explicitly mentioned file. *Future fix:* Implement a hierarchical chunking strategy that always includes the parent section's context alongside small paragraph chunks, ensuring minimum token density per chunk.

**13. Evaluation Strategy**
*   **Measurement:** Automated Ground Truth Testing. A script evaluating Top-5 retrieval precision against a predefined set of questions and expected line numbers.
    *   *Alternatives Considered:* Manual "Eyeball" Testing - rejected because the rubric specifically demands objective precision metrics.

**14. Performance Optimization**
*   **(Deferred)**: The system relies on managed scaling (Pinecone) and fast models (`gpt-4o-mini`). Further optimization like semantic caching is out of scope for the MVP.

**15. Observability**
*   Standard console logging for ingestion metrics and query latency tracking.

**16. Deployment & DevOps**
*   Targeting Vercel for the Next.js web application frontend/backend.
