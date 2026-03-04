# LegacyLens Testing Strategy

## Overview

Testing is organized into three layers:

1. **Automated evals** — Retrieval and E2E regression (precision, latency)
2. **Manual smoke tests** — Quick validation of each feature mode
3. **Ad-hoc QA** — Exploratory testing before demo or release

---

## 1. Automated Evaluations

### Retrieval eval (`npm run eval`)

- **What:** 10 ground-truth test cases; checks if the expected file appears in top-5 retrieved chunks
- **Metrics:** Precision @ Top-1/3/5, MRR, latency (ms)
- **When to run:** After changing retriever, embeddings, or chunker
- **Output:** Console summary + `evals/results/<timestamp>.json` + `evals/history.jsonl`

### E2E eval (`npm run eval:e2e`)

- **What:** 5 test cases; full pipeline (retrieve + LLM generate)
- **Metrics:** Retrieval hit rate, answer cites expected file, E2E latency
- **When to run:** After changing prompts, LLM config, or full pipeline
- **Output:** Same as retrieval eval

### Running evals

```bash
npm run eval        # Retrieval only
npm run eval:e2e    # E2E only (uses OpenAI)
npm run eval:all    # Both
```

---

## 2. Manual Smoke Test Checklist

Before a demo or release, run through each mode with a representative query:

| Mode | Example Query | Expected |
|------|---------------|----------|
| Ask | "Where is the main entry point of cobxref?" | Answer with file/line refs |
| Explain | "Explain what cobxref does" | Plain-English explanation |
| Document | "Generate documentation for dasize.cob" | Structured docs |
| Translate | "How would you read a sequential file in Python instead of COBOL?" | COBOL vs Python comparison |
| Test Gen | "Generate unit tests for the main paragraph in cobxref" | Pytest-style tests |
| Modernize | "Create a migration plan for cobxref" | Migration sections |
| Cross-Ref | "Where is cobxref used across files?" | Cross-file references |
| Biz Logic | "What business rules does this codebase implement?" | Business rules list |
| Deps | "What are the dependencies of accept-keys?" | PERFORM, SELECT, etc. |
| Bug Scan | "Find potential bugs in cobxref" | Bug/risk analysis |
| Impact | "What would be impacted if MAIN were removed?" | Impact analysis |
| Call Graph | Program: `cobxref` | Interactive graph with nodes/edges |

---

## 3. Regression Checklist

- [ ] Retrieval eval passes (>70% precision @ Top-5)
- [ ] E2E eval passes (retrieval hit + answer relevance)
- [ ] All 11 modes return a non-empty response for a valid query
- [ ] Call graph renders for a known program (e.g. cobxref)
- [ ] Streaming works (first tokens appear within ~2s)
- [ ] Retrieved chunks expand and show file/line/relevance

---

## 4. Optional: Unit Tests (Future)

Potential scope for Jest or Vitest:

- **`cobolChunker`** — Parses COBOL structure correctly (divisions, sections, paragraphs)
- **`buildSearchQuery`** — Strips mode-specific language as expected
- **`extractFileHint`** — Extracts file names from queries

Not implemented for MVP; add if extending the system.
