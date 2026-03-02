import * as dotenv from "dotenv";
dotenv.config();

import { retrieveChunks } from "./retriever";

interface TestCase {
  id: number;
  query: string;
  expected_file: string; // substring match on source path
  description: string;
}

const TEST_CASES: TestCase[] = [
  {
    id: 1,
    query: "Where is the main entry point of this program?",
    expected_file: "dasize",
    description: "Find MAIN paragraph in dasize.cob"
  },
  {
    id: 2,
    query: "What does the dasize program do?",
    expected_file: "dasize",
    description: "Explain dasize.cob purpose"
  },
  {
    id: 3,
    query: "What is the cobxref tool used for?",
    expected_file: "cobxref",
    description: "Retrieve cobxref identification/purpose"
  },
  {
    id: 4,
    query: "Find all file I/O operations",
    expected_file: "cobxref",
    description: "File I/O in cobxref tool"
  },
  {
    id: 5,
    query: "Show me error handling patterns in this codebase",
    expected_file: "cobxref",
    description: "Error handling in cobxref"
  },
  {
    id: 6,
    query: "What are the dependencies of the accept-keys program?",
    expected_file: "accept-keys",
    description: "Dependencies in ask.cob"
  },
  {
    id: 7,
    query: "What functions modify customer records?",
    expected_file: "accept-keys",
    description: "Data modification in accept-keys"
  },
  {
    id: 8,
    query: "Show me the PROCEDURE DIVISION logic in the accept-keys program",
    expected_file: "accept-keys",
    description: "Procedure division of ask.cob"
  },
  {
    id: 9,
    query: "What does the wumpus game program do?",
    expected_file: "wumpus",
    description: "Wumpus game program explanation"
  },
  {
    id: 10,
    query: "Find programs that perform sorting operations",
    expected_file: "GCSORT",
    description: "GCSORT sorting tests"
  },
];

function checkHit(chunks: { source: string }[], expectedFile: string, topK: number): boolean {
  const topChunks = chunks.slice(0, topK);
  return topChunks.some(c =>
    c.source.toLowerCase().includes(expectedFile.toLowerCase())
  );
}

async function runEvaluation() {
  console.log("=".repeat(60));
  console.log("LegacyLens RAG Evaluation");
  console.log("=".repeat(60));
  console.log(`Test cases: ${TEST_CASES.length}`);
  console.log(`Metric: Hit Rate @ Top-5 (expected file in top-5 results)\n`);

  let top1Hits = 0;
  let top3Hits = 0;
  let top5Hits = 0;
  const latencies: number[] = [];
  const results: { id: number; hit5: boolean; latency: number; topSource: string }[] = [];

  for (const tc of TEST_CASES) {
    process.stdout.write(`[${tc.id}/10] ${tc.description}... `);
    const start = Date.now();
    const chunks = await retrieveChunks(tc.query, 10);
    const latency = Date.now() - start;
    latencies.push(latency);

    const hit1 = checkHit(chunks, tc.expected_file, 1);
    const hit3 = checkHit(chunks, tc.expected_file, 3);
    const hit5 = checkHit(chunks, tc.expected_file, 5);

    if (hit1) top1Hits++;
    if (hit3) top3Hits++;
    if (hit5) top5Hits++;

    const topSource = chunks[0]?.source ?? "none";
    const status = hit5 ? "✅ HIT" : "❌ MISS";
    console.log(`${status} (${latency}ms) — Top chunk: ${topSource}`);

    results.push({ id: tc.id, hit5, latency, topSource });
  }

  const n = TEST_CASES.length;
  const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  const maxLatency = Math.max(...latencies);
  const minLatency = Math.min(...latencies);

  console.log("\n" + "=".repeat(60));
  console.log("RESULTS SUMMARY");
  console.log("=".repeat(60));
  console.log(`Precision @ Top-1:  ${top1Hits}/${n} = ${Math.round(top1Hits/n*100)}%`);
  console.log(`Precision @ Top-3:  ${top3Hits}/${n} = ${Math.round(top3Hits/n*100)}%`);
  console.log(`Precision @ Top-5:  ${top5Hits}/${n} = ${Math.round(top5Hits/n*100)}%`);
  console.log(`\nLatency:`);
  console.log(`  Average: ${avgLatency}ms`);
  console.log(`  Min:     ${minLatency}ms`);
  console.log(`  Max:     ${maxLatency}ms`);
  console.log(`\nTarget: >70% precision @ Top-5`);
  const passed = top5Hits / n >= 0.70;
  console.log(`Status: ${passed ? "✅ PASSED" : "❌ BELOW TARGET"}`);
  console.log("=".repeat(60));
}

runEvaluation().catch(console.error);
