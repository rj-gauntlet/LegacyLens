# LegacyLens: AI Cost Analysis

## Development & Testing Costs (Actual)

### Embedding Costs
| Item | Details | Cost |
|---|---|---|
| Model | OpenAI text-embedding-3-small ($0.02 / 1M tokens) | — |
| Codebase size | 13,187 chunks × ~300 avg tokens | ~3.96M tokens |
| Embedding runs | 1 full ingestion run | $0.079 |
| Re-ingestion testing | ~2 partial re-runs during debugging | $0.020 |
| **Subtotal** | | **~$0.10** |

### LLM Answer Generation Costs (Development Testing)
| Item | Details | Cost |
|---|---|---|
| Model | GPT-4o-mini ($0.15/1M input, $0.60/1M output) | — |
| Test queries run | ~60 queries during feature development | — |
| Avg input tokens | ~4,500 (system prompt + 10 chunks + query) | — |
| Avg output tokens | ~800 | — |
| Input cost | 60 × 4,500 = 270,000 tokens × $0.15/1M | $0.04 |
| Output cost | 60 × 800 = 48,000 tokens × $0.60/1M | $0.03 |
| **Subtotal** | | **~$0.07** |

### Infrastructure Costs
| Item | Cost |
|---|---|
| Pinecone (Free Serverless Tier) | $0.00 |
| Vercel (Free Hobby Tier) | $0.00 |
| **Subtotal** | **$0.00** |

### Total Development Spend
| Category | Cost |
|---|---|
| Embeddings | $0.10 |
| LLM (GPT-4o-mini) | $0.07 |
| Infrastructure | $0.00 |
| **Total** | **~$0.17** |

---

## Production Cost Projections

### Assumptions
| Parameter | Value | Rationale |
|---|---|---|
| Queries per user per day | 5 | Typical developer session: a few lookups |
| Avg input tokens per query | 4,500 | System prompt (500) + 10 chunks × ~350 tokens + user question (500) |
| Avg output tokens per query | 800 | Moderate explanation or code snippet |
| Avg query embedding tokens | 500 | User question vectorization |
| LLM model | GPT-4o-mini | $0.15/1M input, $0.60/1M output |
| Embedding model | text-embedding-3-small | $0.02/1M tokens |
| Codebase update frequency | Monthly | Legacy codebases change slowly |
| New code added per month | 1,000 lines | Conservative for a legacy system |

### Monthly Cost at Scale

#### 100 Users/Month
| Line Item | Calculation | Monthly Cost |
|---|---|---|
| Daily queries | 100 users × 5 = 500 queries/day | — |
| Query embeddings | 500 × 500 tokens × 30 days = 7.5M tokens | $0.15 |
| LLM input | 500 × 4,500 tokens × 30 days = 67.5M tokens | $10.13 |
| LLM output | 500 × 800 tokens × 30 days = 12M tokens | $7.20 |
| Pinecone | Free tier (< 2GB) | $0.00 |
| Vercel | Free Hobby tier | $0.00 |
| **Total** | | **~$17.50/month** |

#### 1,000 Users/Month
| Line Item | Calculation | Monthly Cost |
|---|---|---|
| Daily queries | 1,000 × 5 = 5,000 queries/day | — |
| Query embeddings | 5,000 × 500 × 30 = 75M tokens | $1.50 |
| LLM input | 5,000 × 4,500 × 30 = 675M tokens | $101.25 |
| LLM output | 5,000 × 800 × 30 = 120M tokens | $72.00 |
| Pinecone | Starter paid plan | $70.00 |
| Vercel | Pro plan | $20.00 |
| **Total** | | **~$265/month** |

#### 10,000 Users/Month
| Line Item | Calculation | Monthly Cost |
|---|---|---|
| Daily queries | 10,000 × 5 = 50,000 queries/day | — |
| Query embeddings | 50,000 × 500 × 30 = 750M tokens | $15.00 |
| LLM input | 50,000 × 4,500 × 30 = 6.75B tokens | $1,012.50 |
| LLM output | 50,000 × 800 × 30 = 1.2B tokens | $720.00 |
| Pinecone | Standard plan | $70.00 |
| Vercel | Pro + usage overages | $200.00 |
| **Total** | | **~$2,018/month** |

#### 100,000 Users/Month
| Line Item | Calculation | Monthly Cost |
|---|---|---|
| Daily queries | 100,000 × 5 = 500,000 queries/day | — |
| Query embeddings | 500,000 × 500 × 30 = 7.5B tokens | $150.00 |
| LLM input | 500,000 × 4,500 × 30 = 67.5B tokens | $10,125.00 |
| LLM output | 500,000 × 800 × 30 = 12B tokens | $7,200.00 |
| Pinecone | Enterprise plan | $500.00 |
| Vercel | Enterprise | $500.00 |
| **Total** | | **~$18,475/month** |

---

## Summary Table

| Scale | Users | Monthly Cost | Cost per User |
|---|---|---|---|
| Portfolio/Demo | 100 | $17.50 | $0.18 |
| Small Team | 1,000 | $265 | $0.27 |
| Growing Product | 10,000 | $2,018 | $0.20 |
| Enterprise | 100,000 | $18,475 | $0.18 |

---

## Cost Optimization Opportunities

The dominant cost driver at scale is **LLM input tokens** (the 10 retrieved code chunks passed to GPT-4o-mini per query). The following optimizations would dramatically reduce costs:

| Optimization | Estimated Savings | Trade-off |
|---|---|---|
| **Semantic caching** — Cache embeddings + answers for repeated queries | 30-50% reduction | Stale answers if code changes |
| **Reduce top-k from 10 to 5** | ~40% reduction in LLM input cost | Slightly lower retrieval coverage |
| **Use GPT-4o-mini more selectively** — Use a smaller local model (e.g., Llama 3.1 8B via Groq) for simple queries | 70-90% reduction | Requires model evaluation |
| **Chunk summarization** — Store 100-token summaries alongside full chunks; pass summaries to LLM unless user asks for full code | 50-70% reduction | Requires re-ingestion |
| **Upgrade to OpenAI Batch API** for non-real-time queries | 50% reduction on LLM costs | Adds latency for batch jobs |
