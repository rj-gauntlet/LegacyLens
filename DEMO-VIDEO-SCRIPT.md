# LegacyLens Demo Video Script (5–6 minutes)

Use this script while recording. **[SCREEN:** … **]** = what to show on screen at that moment.  
Aim for a calm pace; total runtime ~5:30.

---

## 1. Intro & problem (0:00 – 0:45)

**[SCREEN:** Browser on the LegacyLens app home — sidebar + empty chat. Optional: have the deployed URL visible in the address bar (e.g. legacylens-lake.vercel.app).]**

**Say:**  
"Hi, I'm [your name]. This is LegacyLens — a RAG system that makes legacy COBOL codebases queryable in plain English.

Enterprise systems still run on COBOL and Fortran: banking, insurance, government. These codebases hold decades of business logic, but few engineers can read them. LegacyLens lets you ask questions in natural language and get answers with real code references."

---

## 2. High-level architecture (0:45 – 1:25)

**[SCREEN:** App still on screen, or optionally open the RAG Architecture document in another tab and point at the "Retrieval Pipeline" or "Chunking" section while you say ingest vs query.]**

**Say:**  
"At a high level the system has two pipelines.

**Ingest:** We take the raw codebase, chunk it with syntax-aware splitting — so each COBOL division, section, or paragraph becomes a chunk. We embed each chunk with OpenAI’s text-embedding model and store the vectors plus metadata — file path, line numbers, division and paragraph names — in Pinecone. That’s a one-time batch; the repo documents how we’d add incremental updates later.

**Query:** When you ask a question, we embed the query with the same model, run semantic search in Pinecone — and we add hybrid search, so keyword overlap can boost relevance. We pull the top chunks, optionally re-rank by file hint if you mentioned a specific file, then send those chunks as context to the LLM. The LLM streams the answer back. So it’s **retrieve first, then generate** — that’s the RAG pattern. The stack is Next.js on Vercel, LangChain for orchestration, OpenAI for embeddings and the LLM, and Pinecone as the vector store."


---

## 3. MVP requirements — high level (1:25 – 2:10)

**[SCREEN:** While you list 1–9, you can keep the app open; optionally scroll or point at the header/sidebar. No need to click yet.]**

**Say:**  
"The project had a strict MVP gate. Here’s how LegacyLens meets every requirement.

**One:** We ingest a real legacy codebase — the GnuCOBOL Contrib repo: COBOL samples and utilities.

**Two:** We chunk with **syntax-aware splitting** — by COBOL divisions, sections, and paragraphs — not arbitrary line cuts. That keeps business logic in one piece.

**Three and four:** We generate embeddings with OpenAI text-embedding-3-small and store them in **Pinecone** as our vector database.

**Five:** Semantic search runs over those vectors so we find the right paragraphs for your question.

**Six:** You get a **natural language query interface** — this web UI — not just a CLI.

**Seven:** We return **relevant code snippets with file paths and line numbers**, and you can expand any chunk to see full context.

**Eight:** An LLM uses that context to **generate an answer** — we use GPT-4o-mini, with streaming so you see the response as it’s written.

**Nine:** The app is **deployed and publicly accessible** on Vercel."

---

## 4. Query interface requirements (2:10 – 2:55)

**[SCREEN:** Run one quick query so the interface is "live." Example: Ask mode, type "Where is the main entry point of cobxref?" Submit. Let the answer and chunks appear. Then expand the "Retrieved chunks" section and point at file path, line numbers, and relevance %.]**

- **Action:** Select **Ask**, type: `Where is the main entry point of cobxref?` → Send.
- **Action:** After the answer loads, click to expand “Retrieved chunks” and briefly point at:
  - File path (e.g. `cobxref.cbl`),
  - Line range (e.g. 48–72),
  - Relevance score (e.g. 82%).

**Say:**  
"The rubric also required a proper query interface. LegacyLens gives you: natural language input, **syntax-highlighted** code in responses, **file paths and line numbers** on every retrieved chunk, **relevance scores** when you expand the chunks, and a **generated explanation** from the LLM. You can drill down by expanding any chunk to see the full snippet."


---

## 5. Code understanding features — at least 4 (2:55 – 4:40)

**[SCREEN:** Sidebar visible so all mode groups (UNDERSTAND, TRANSFORM, ANALYZE) and the mode list are on camera.]**

**Say:**  
"We had to implement at least four code-understanding features. LegacyLens goes further — we have **Ask**, **Explain**, **Document**, **Translate**, **Test Gen**, **Modernize**, **Cross-Ref**, **Business Logic**, **Dependencies**, **Bug Scan**, and **Impact**. I’ll show a few."

**Explain (Code Explanation)**  
**[SCREEN:** Click **Explain**. Query: `Explain what cobxref does` or `Explain the CALCULATE-INTEREST paragraph`. Send. Show the [EXPLAIN] badge and the explanation with code blocks.]**

**Say:**  
"**Explain** answers ‘what does this code do?’ in plain English."

**Translate (Translation Hints)**  
**[SCREEN:** Click **Translate**. Query: `How would you read a sequential file in Python instead of COBOL?` Send. Show the side-by-side or the translation section with COBOL vs modern hints.]**

**Say:**  
"**Translate** suggests modern-language equivalents — e.g. Python — for COBOL constructs."

**Document (Documentation Gen)**  
**[SCREEN:** Click **Document**. Query: `Generate documentation for the main logic in cobxref`. Send. Show the [DOCUMENT] badge and the generated docs.]**

**Say:**  
"**Document** generates documentation for undocumented code."

**Business Logic (Business Logic Extract)**  
**[SCREEN:** Click **Biz Logic**. Query: `What business rules or calculations does this codebase implement?` Send. Show the [BIZ LOGIC] answer.]**

**Say:**  
"**Business Logic** pulls out business rules and explains them."


*(If you’re ahead on time, add one more: **Test Gen** — “Generate unit tests for the main paragraph in cobxref” — or **Cross-Ref** — “Where is CUSTOMER-ID used across files?”)*

---

## 6. Call graph & retrieval quality (4:40 – 5:25)

**[SCREEN:** Click the **Call Graph** view (bottom of sidebar). In the input, enter a program name, e.g. `cobxref`, and generate. Show the graph: nodes (program/sections/paragraphs), edges, and legend. Pan/zoom if you want.]**

**Say:**  
"We also added a **visual call graph**. You ask for a program name and see PERFORM, CALL, COPY, and GO TO relationships in an interactive diagram."

**[SCREEN:** You can stay on the call graph or switch back to Chat and briefly show **Cross-Ref** with a query like "Where is cobxref or main entry used?" so the multi-file aspect is visible.]**

**Say:**  
"Retrieval uses **hybrid search** — vector similarity plus keyword matching — and in Cross-Ref mode we prioritize results from multiple files so you see how identifiers are used across the codebase."


---

## 7. Docs, cost, deployment (5:25 – 5:55)

**[SCREEN:** Optional: open the repo in another tab and scroll quickly over Pre-Search, RAG Architecture, and AI Cost Analysis files; or keep the app open and just state the above.]**

**Say:**  
"The repo includes the **Pre-Search document** with our architecture choices, a **RAG Architecture document** with vector DB choice, chunking, retrieval pipeline, and failure modes, and an **AI Cost Analysis** for development spend and projections at 100, 1K, 10K, and 100K users. Everything is deployed on Vercel and the code is on GitHub."

---

## 8. Closing (5:55 – 6:15)

**[SCREEN:** Back to the LegacyLens app — either the chat with a couple of your demo answers visible or the call graph. Hold for 2–3 seconds, then stop recording.]**

**Say:**  
"LegacyLens meets every MVP requirement: ingestion, syntax-aware chunking, embeddings in Pinecone, semantic and hybrid search, a natural language web UI, code snippets with file and line references, LLM-generated answers, and public deployment. On top of that you get multiple code-understanding modes and a call graph. Thanks for watching."

---

## Quick reference: MVP checklist (for your own prep)

| # | Requirement | Where to show |
|---|-------------|----------------|
| 1 | Ingest legacy codebase | Say: GnuCOBOL Contrib; optional: repo or ingest script in GitHub |
| 2 | Syntax-aware chunking | Say: divisions/sections/paragraphs; optional: RAG doc or chunker |
| 3 | Generate embeddings | Say: OpenAI text-embedding-3-small |
| 4 | Vector database | Say: Pinecone |
| 5 | Semantic search | Say: vector + hybrid; show any query working |
| 6 | Natural language query interface | Show: web UI, input, send |
| 7 | Code snippets with file/line refs | Show: expanded chunks with path + line range |
| 8 | Answer generation from context | Show: any answer with [MODE] badge and text |
| 9 | Deployed & publicly accessible | Show: URL in browser or say Vercel URL |

---

## Suggested queries (copy-paste)

- Ask: `Where is the main entry point of cobxref?`
- Explain: `Explain what cobxref does`
- Translate: `How would you read a sequential file in Python instead of COBOL?`
- Document: `Generate documentation for the main logic in cobxref`
- Biz Logic: `What business rules or calculations does this codebase implement?`
- Cross-Ref: `Where is cobxref or the main program used across files?`
- Call Graph: program name `cobxref` (or another program you know exists)

---

*Script end. With the architecture section, total runtime is ~6 minutes. Trim one feature demo or shorten the MVP list if you need to stay under 5:30.*
