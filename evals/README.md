# LegacyLens Evaluations

Run automated evaluations to track retrieval performance, latency, and end-to-end quality.

## Quick Start

```bash
# Retrieval evals (precision @ k, latency)
npm run eval

# End-to-end evals (retrieve + LLM, E2E latency, answer relevance)
npm run eval:e2e

# Both (retrieval first, then E2E on subset)
npm run eval:all
```

## Output

- **Console:** Human-readable summary with pass/fail
- **JSON:** `evals/results/YYYY-MM-DD-HHmmss.json` — full per-case results
- **History:** `evals/history.jsonl` — one-line summary per run for trend tracking

## Metrics

| Metric | Description |
|--------|-------------|
| Precision @ Top-1/3/5 | Expected file appears in top-k retrieved chunks |
| MRR | Mean Reciprocal Rank of first hit |
| Latency (retrieval) | Time for vector search + embedding (ms) |
| Latency (E2E) | Time for retrieve + LLM completion (ms) |
| Answer mentions expected file | Heuristic: does the LLM response cite the expected file? |

## Tracking Over Time

Append to `evals/history.jsonl` and inspect:

```bash
# View last 5 runs
tail -5 evals/history.jsonl
```
