import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RetrievedChunk } from "./types";

export type { RetrievedChunk };

let pineconeIndex: ReturnType<InstanceType<typeof Pinecone>["index"]> | null = null;
let embeddingsModel: OpenAIEmbeddings | null = null;

function getClients() {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX;
  if (!apiKey || !indexName) {
    throw new Error(
      "Missing Pinecone config in this environment. Set PINECONE_API_KEY and PINECONE_INDEX (e.g. in Vercel Project Settings → Environment Variables)."
    );
  }
  if (!pineconeIndex) {
    const pinecone = new Pinecone({ apiKey });
    pineconeIndex = pinecone.index(indexName);
  }
  if (!embeddingsModel) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "Missing OPENAI_API_KEY in this environment. Set it in your deployment's environment variables for embeddings and LLM."
      );
    }
    embeddingsModel = new OpenAIEmbeddings({
      modelName: "text-embedding-3-small",
      dimensions: 1536,
    });
  }
  return { index: pineconeIndex, embeddings: embeddingsModel };
}

function extractFileHint(query: string): string | null {
  const fileMatch = query.match(/[\w\-]+\.(cob|cbl|cpy)/i);
  if (fileMatch) return fileMatch[0].toLowerCase();
  const knownTools = ["cobxref", "dasize", "accept-keys", "cobolmac", "htm2cob", "printcbl", "cgiform", "wumpus", "gcsort"];
  for (const tool of knownTools) {
    if (query.toLowerCase().includes(tool)) return tool;
  }
  return null;
}

function toChunk(match: any): RetrievedChunk {
  return {
    id: match.id,
    score: match.score ?? 0,
    text: (match.metadata?.text as string) ?? "",
    source: (match.metadata?.source as string) ?? "",
    loc_start: (match.metadata?.loc_start as number) ?? 0,
    loc_end: (match.metadata?.loc_end as number) ?? 0,
    division: (match.metadata?.division as string) ?? "",
    section: (match.metadata?.section as string) ?? "",
    paragraph: (match.metadata?.paragraph as string) ?? "",
  };
}

// --- Hybrid Search: keyword scoring ---

const STOPWORDS = new Set([
  "the","a","an","in","on","at","to","for","of","is","are","was","were","be",
  "been","being","have","has","had","do","does","did","will","would","could",
  "should","may","might","shall","can","this","that","these","those","i","me",
  "my","we","our","you","your","it","its","what","which","who","how","where",
  "when","why","all","each","every","both","and","or","not","no","so","if",
  "then","else","than","too","very","just","show","find","get","tell",
]);

function computeKeywordScore(queryTerms: string[], chunk: RetrievedChunk): number {
  if (queryTerms.length === 0) return 0;
  const haystack = `${chunk.text} ${chunk.source} ${chunk.paragraph} ${chunk.section}`.toLowerCase();
  let hits = 0;
  for (const term of queryTerms) {
    if (haystack.includes(term)) hits++;
  }
  return hits / queryTerms.length;
}

function extractQueryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

export async function retrieveChunks(
  query: string,
  topK: number = 10
): Promise<RetrievedChunk[]> {
  const { index, embeddings } = getClients();

  const [queryVector] = await embeddings.embedDocuments([query]);
  const fileHint = extractFileHint(query);
  const queryTerms = extractQueryTerms(query);

  // Always fetch a larger pool for hybrid re-ranking
  const fetchK = Math.max(topK * 3, 30);

  const results = await index.query({
    vector: queryVector,
    topK: fetchK,
    includeMetadata: true,
  });

  if (!results.matches) return [];

  // Apply hybrid scoring: vector similarity + keyword boost
  const allChunks = results.matches.map(toChunk).map((chunk) => ({
    ...chunk,
    score: chunk.score + 0.15 * computeKeywordScore(queryTerms, chunk),
  }));

  allChunks.sort((a, b) => b.score - a.score);

  if (fileHint) {
    const fromFile = allChunks.filter((c) =>
      c.source.toLowerCase().includes(fileHint)
    );
    const others = allChunks.filter(
      (c) => !c.source.toLowerCase().includes(fileHint)
    );
    return [...fromFile, ...others].slice(0, topK);
  }

  return allChunks.slice(0, topK);
}

// --- Multi-file cross-reference retrieval ---

export async function retrieveCrossFileChunks(
  query: string,
  topK: number = 15
): Promise<RetrievedChunk[]> {
  const { index, embeddings } = getClients();

  const [queryVector] = await embeddings.embedDocuments([query]);
  const queryTerms = extractQueryTerms(query);

  const results = await index.query({
    vector: queryVector,
    topK: Math.max(topK * 5, 50),
    includeMetadata: true,
  });

  if (!results.matches) return [];

  const allChunks = results.matches.map(toChunk).map((chunk) => ({
    ...chunk,
    score: chunk.score + 0.15 * computeKeywordScore(queryTerms, chunk),
  }));

  allChunks.sort((a, b) => b.score - a.score);

  // Ensure cross-file diversity: pick top chunk from each unique file first
  const seenFiles = new Set<string>();
  const diverse: RetrievedChunk[] = [];
  const remainder: RetrievedChunk[] = [];

  for (const chunk of allChunks) {
    const fileKey = chunk.source.toLowerCase();
    if (!seenFiles.has(fileKey)) {
      seenFiles.add(fileKey);
      diverse.push(chunk);
    } else {
      remainder.push(chunk);
    }
  }

  // Fill: diverse first (one per file), then remaining by score
  return [...diverse, ...remainder].slice(0, topK);
}
