import * as fs from "fs/promises";
import * as path from "path";
import { Pinecone } from "@pinecone-database/pinecone";
import type { PineconeRecord } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { chunkCobolFile, CobolMetadata } from "./cobolChunker";
import { Document } from "@langchain/core/documents";
import * as dotenv from "dotenv";

dotenv.config();

const CODEBASE_DIR = path.join(__dirname, "../codebase");
const EMBED_BATCH_SIZE = 50;   // how many texts to embed at once via OpenAI
const PINECONE_BATCH_SIZE = 100; // how many vectors to upsert at once to Pinecone

async function getCobolFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== ".git") {
        files.push(...(await getCobolFiles(fullPath)));
      }
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if ([".cob", ".cbl", ".cpy"].includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

async function main() {
  console.log("Starting ingestion process...");

  if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX || !process.env.OPENAI_API_KEY) {
    console.error("Missing required environment variables: PINECONE_API_KEY, PINECONE_INDEX, OPENAI_API_KEY");
    process.exit(1);
  }

  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  const index = pinecone.index(process.env.PINECONE_INDEX);

  const embeddings = new OpenAIEmbeddings({
    modelName: "text-embedding-3-small",
    dimensions: 1536,
  });

  console.log(`Scanning codebase directory: ${CODEBASE_DIR}`);
  const cobolFiles = await getCobolFiles(CODEBASE_DIR);
  console.log(`Found ${cobolFiles.length} COBOL files.`);

  const totalDocs: Document<CobolMetadata>[] = [];

  for (const file of cobolFiles) {
    try {
      const docs = await chunkCobolFile(file);
      docs.forEach(d => {
        d.metadata.source = path.relative(CODEBASE_DIR, d.metadata.source);
      });
      totalDocs.push(...docs);
    } catch (err) {
      console.error(`Error processing file ${file}:`, err);
    }
  }

  console.log(`Total chunks generated: ${totalDocs.length}`);

  if (totalDocs.length === 0) {
    console.log("No chunks to ingest.");
    return;
  }

  // Process in embed batches
  let totalUpserted = 0;
  const embedBatchCount = Math.ceil(totalDocs.length / EMBED_BATCH_SIZE);

  for (let i = 0; i < totalDocs.length; i += EMBED_BATCH_SIZE) {
    const batch = totalDocs.slice(i, i + EMBED_BATCH_SIZE);
    const batchNum = Math.floor(i / EMBED_BATCH_SIZE) + 1;

    console.log(`Embedding batch ${batchNum}/${embedBatchCount} (${batch.length} chunks)...`);

    // Embed the whole batch at once
    const texts = batch.map(doc => doc.pageContent);
    let embeddingVectors: number[][];
    try {
      embeddingVectors = await embeddings.embedDocuments(texts);
    } catch (err) {
      console.error(`Failed to embed batch ${batchNum}:`, err);
      continue;
    }

    // Build Pinecone records
    const records: PineconeRecord[] = batch.map((doc, idx) => {
      const id = `${doc.metadata.source}-${doc.metadata.loc_start}`
        .replace(/[^a-zA-Z0-9\-_]/g, "_")
        .substring(0, 512);
      return {
        id,
        values: embeddingVectors[idx],
        metadata: {
          text: doc.pageContent.substring(0, 4000), // Pinecone metadata limit
          source: doc.metadata.source ?? "",
          loc_start: doc.metadata.loc_start ?? 0,
          loc_end: doc.metadata.loc_end ?? 0,
          division: doc.metadata.division ?? "",
          section: doc.metadata.section ?? "",
          paragraph: doc.metadata.paragraph ?? "",
        },
      };
    });

    // Upsert to Pinecone in sub-batches
    for (let j = 0; j < records.length; j += PINECONE_BATCH_SIZE) {
      const pineconeBatch = records.slice(j, j + PINECONE_BATCH_SIZE);
      try {
        await index.upsert({ records: pineconeBatch });
        totalUpserted += pineconeBatch.length;
        console.log(`  Upserted ${totalUpserted}/${totalDocs.length} vectors to Pinecone.`);
      } catch (err) {
        console.error(`  Failed to upsert batch to Pinecone:`, err);
      }
    }
  }

  console.log(`\nIngestion complete! Total vectors upserted: ${totalUpserted}`);
}

main().catch(console.error);
