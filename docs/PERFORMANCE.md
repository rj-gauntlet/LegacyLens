# Query Performance: Profiling & Improvement Ideas

## Profiling Baseline

Profiling is now instrumented. When a query runs, the server logs:

**Retriever** (in `retriever.ts`):
- `embed_ms` — time for OpenAI embedding API call
- `pinecone_ms` — time for Pinecone vector search

**Query route** (in `app/api/query/route.ts`):
- `retrieve_ms` — total retrieval (embed + Pinecone + post-processing)
- `ttft_ms` — time to first token (LLM response start)
- `llm_total_ms` — total LLM streaming duration
- `total_ms` — end-to-end request time

### How to View Baseline

**Local:**
```bash
npm run dev
# Run a query, then check the terminal for [query perf] and [retriever perf] logs
```

**Vercel:**
1. Vercel Dashboard → Project → Logs (or Runtime Logs)
2. Run a query on the live site
3. Filter/search for `[query perf]` or `[retriever perf]`

### Example Output

```
[retriever perf] {"embed_ms":420,"pinecone_ms":180}
[query perf] {"retrieve_ms":650,"ttft_ms":1200,"llm_total_ms":8500,"total_ms":9200,"mode":"answer","chunks":10}
```

---

## Improvement Ideas

### 1. **Reduce Embedding Latency** (often 300–800ms)
- **Edge embeddings**: Use Vercel Edge or a provider with lower latency (e.g. Cohere Embed v3, Voyage)
- **Caching**: Cache embeddings for repeated/similar queries (Redis, Vercel KV)
- **Parallel init**: Ensure embedding client is warmed; consider pre-warming on cold start

### 2. **Reduce Pinecone Latency** (often 100–400ms)
- **Serverless index**: Use Pinecone serverless if not already; it scales to zero and avoids cold pods
- **Region alignment**: Ensure Pinecone index is in the same region as Vercel (e.g. us-east-1)
- **Reduce fetchK**: Lower `fetchK` (e.g. 30 → 20) if quality allows; less data transferred

### 3. **Reduce Time-to-First-Token (TTFT)** (often 1–3s)
- **Faster model**: Switch to `gpt-4o-mini` with higher throughput tier, or try `gpt-4o` with streaming optimizations
- **Smaller context**: Truncate or summarize chunks before sending to LLM; reduce prompt size
- **Stream system prompt**: Not all providers support this; check if OpenAI allows progressive prompt send

### 4. **Reduce Total LLM Time**
- **Shorter responses**: Add instruction to be concise; reduce max_tokens if applicable
- **Lower chunk count**: Use 6–8 chunks instead of 10 for simple queries (mode-dependent)
- **Two-phase**: For complex modes (e.g. modernize, test_gen), consider summarizer first, then generator

### 5. **Parallelization**
- **Embed + prepare**: Start building the LLM prompt while Pinecone query runs (not applicable — we need chunks first)
- **Stream chunks to client earlier**: Currently chunks are sent before LLM starts; ensure UI renders them immediately so perceived latency improves

### 6. **User Experience**
- **Skeleton / loading states**: Show chunk cards as they arrive; stream answer tokens progressively (already done)
- **Progressive disclosure**: Show top 3 chunks first, “loading more…” for rest
- **Timeout + retry**: If TTFT > 10s, show “taking longer than usual” and offer retry

### 7. **Infrastructure**
- **Vercel region**: Deploy in same region as OpenAI/Pinecone (e.g. us-east-1)
- **Keep-alive**: Reuse HTTP connections; Node.js fetch/OpenAI client should do this by default
- **Cold starts**: Consider Vercel Pro for better cold-start behavior; or edge runtime for the embedding step

### 8. **Target SLAs**
- **Retrieve**: < 1s (embed + Pinecone)
- **TTFT**: < 2s
- **Total**: < 10s for typical answer-mode queries

---

## Next Steps

1. Run 5–10 sample queries and record the baseline (retrieve_ms, ttft_ms, total_ms).
2. Identify the main bottleneck: embedding, Pinecone, or LLM.
3. Prioritize changes based on impact vs. effort.
4. Re-measure after each change.
