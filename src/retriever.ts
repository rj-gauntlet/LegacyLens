import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RetrievedChunk } from "./types";

export type { RetrievedChunk };

let pineconeIndex: ReturnType<InstanceType<typeof Pinecone>["index"]> | null = null;
let embeddingsModel: OpenAIEmbeddings | null = null;

function getClients() {
  if (!pineconeIndex) {
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
    pineconeIndex = pinecone.index(process.env.PINECONE_INDEX!);
  }
  if (!embeddingsModel) {
    embeddingsModel = new OpenAIEmbeddings({
      modelName: "text-embedding-3-small",
      dimensions: 1536,
    });
  }
  return { index: pineconeIndex, embeddings: embeddingsModel };
}

function extractFileHint(query: string): string | null {
  // Match explicit file references like "dasize.cob", "cobxref.cbl"
  const fileMatch = query.match(/[\w\-]+\.(cob|cbl|cpy)/i);
  if (fileMatch) return fileMatch[0].toLowerCase();
  // Match known bare program/tool names
  const knownTools = ["cobxref", "dasize", "accept-keys", "cobolmac", "htm2cob", "printcbl", "cgiform", "wumpus"];
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

export async function retrieveChunks(
  query: string,
  topK: number = 10
): Promise<RetrievedChunk[]> {
  const { index, embeddings } = getClients();

  const [queryVector] = await embeddings.embedDocuments([query]);
  const fileHint = extractFileHint(query);

  // Fetch a larger pool when a file is mentioned so we can re-rank
  const fetchK = fileHint ? Math.max(topK * 3, 30) : topK;

  const results = await index.query({
    vector: queryVector,
    topK: fetchK,
    includeMetadata: true,
  });

  if (!results.matches) return [];

  const allChunks = results.matches.map(toChunk);

  // If a specific file was mentioned, bubble those chunks to the top
  if (fileHint) {
    const fromFile = allChunks.filter((c) =>
      c.source.toLowerCase().includes(fileHint)
    );
    const others = allChunks.filter((c) =>
      !c.source.toLowerCase().includes(fileHint)
    );
    // Return file-specific chunks first, then fill remaining slots with global results
    return [...fromFile, ...others].slice(0, topK);
  }

  return allChunks.slice(0, topK);
}
