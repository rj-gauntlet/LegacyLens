# Pre-Search Feedback: Improvement Plan

Addressing the three areas for improvement from the grader feedback.

---

## 1. Security Considerations (Currently Minimal)

**Feedback:** "Should address code injection, API key management, and data validation"

### Current state
- `.env` is gitignored; API keys are not committed
- No explicit security documentation
- Query input passed directly to APIs (potential injection surface)

### Plan

| Action | Where | Effort |
|--------|-------|--------|
| **API key management** | Document in README + Pre-Search addendum | Low |
| - Add "Security" subsection under Phase 3 (or new section) | Pre-Search-Document.md | Low |
| - Describe: keys in env vars only, never logged, Vercel env for prod | | |
| **Data validation** | API route + Pre-Search | Low |
| - Validate/sanitize query input (max length, strip control chars) | `app/api/query/route.ts` | Low |
| - Document in security section | | |
| **Code injection / prompt injection** | Pre-Search + optional hardening | Medium |
| - Note: user query is injected into LLM prompt; we rely on system prompt to refuse out-of-scope answers | Pre-Search addendum | Low |
| - Optional: add input length cap (e.g. 2000 chars) to limit abuse | API route | Low |

### Deliverable
- New **Section 17: Security** in Pre-Search-Document.md covering API key handling, input validation, and prompt-injection awareness
- Input validation in `/api/query` (max length, basic sanitization)

---

## 2. Testing Strategy Beyond Evaluation Metrics

**Feedback:** "Testing strategy beyond evaluation metrics is not well defined"

### Current state
- We have automated retrieval + E2E evals (Precision@k, MRR, latency)
- No unit tests, integration tests, or manual QA strategy
- Pre-Search Section 13 only mentions "Automated Ground Truth Testing"

### Plan

| Action | Where | Effort |
|--------|-------|--------|
| **Expand Section 13 in Pre-Search** | Pre-Search-Document.md | Low |
| - Add: unit tests (chunker, retriever helpers), manual smoke tests, regression checklist | | |
| **Define testing pyramid** | Pre-Search or new TESTING.md | Low |
| - Eval scripts = integration/regression layer | | |
| - Manual QA = smoke tests for each mode before demo | | |
| - (Optional) Unit tests for `cobolChunker`, `buildSearchQuery` | `src/` + jest/vitest | Medium |

### Deliverable
- Expanded **Section 13: Evaluation Strategy** in Pre-Search with:
  - Automated evals (retrieval, E2E) — *already implemented*
  - Manual smoke test checklist (per mode)
  - Optional unit test scope (chunker, query preprocessing)
- Optional: `TESTING.md` with step-by-step QA checklist

---

## 3. File Structure and Development Tooling Setup

**Feedback:** "File structure and development tooling setup could be more detailed"

### Current state
- No project-level README
- `evals/README.md` exists for eval usage
- Pre-Search does not describe folder layout or setup steps

### Plan

| Action | Where | Effort |
|--------|-------|--------|
| **Create README.md** | Project root | Low |
| - Project overview, features, deployed link | | |
| - Prerequisites (Node 18+, npm) | | |
| - Setup: clone, `npm install`, `.env` template, `npm run ingest` | | |
| - Scripts: `dev`, `build`, `ingest`, `eval`, `eval:e2e` | | |
| **Document file structure** | README or Pre-Search addendum | Low |
| - `app/` — Next.js pages, API routes | | |
| - `src/` — retriever, chunker, generate, types | | |
| - `evals/` — eval script, results, history | | |
| - `codebase/` — cloned GnuCOBOL contrib (gitignored) | | |
| **Add to Pre-Search** | Pre-Search-Document.md | Low |
| - New Section 18: Project Structure & Setup, or link to README | | |

### Deliverable
- `README.md` with setup, structure, and scripts
- Brief "Project structure" section in Pre-Search (or reference to README)

---

## Summary: Recommended Order

| # | Area | Priority | Est. time |
|---|------|----------|-----------|
| 1 | File structure + README | High (most visible) | 30 min |
| 2 | Testing strategy expansion in Pre-Search | High | 20 min |
| 3 | Security section + input validation | Medium | 30 min |

Total: ~1.5 hours to address all three areas.

---

## Out of Scope (For Now)

- Full unit test suite (Jest/Vitest setup)
- Rate limiting, auth, or production-grade security hardening
- CI/CD pipeline for automated evals
