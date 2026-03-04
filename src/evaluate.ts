import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config();

import { retrieveChunks } from "./retriever";
import { generateAnswer } from "./generate";

// ── Types ──

interface TestCase {
  id: number;
  query: string;
  expected_file: string;
  description: string;
}

interface RetrievalResult {
  id: number;
  description: string;
  hit1: boolean;
  hit3: boolean;
  hit5: boolean;
  mrr: number;
  latency_ms: number;
  topSource: string;
}

interface E2EResult {
  id: number;
  description: string;
  retrieval_hit5: boolean;
  retrieval_latency_ms: number;
  e2e_latency_ms: number;
  answer_mentions_expected: boolean;
  topSource: string;
}

interface EvalResult {
  timestamp: string;
  mode: "retrieval" | "e2e";
  metrics: {
    precision_top1: number;
    precision_top3: number;
    precision_top5: number;
    mrr?: number;
    latency_avg_ms: number;
    latency_min_ms: number;
    latency_max_ms: number;
    e2e_latency_avg_ms?: number;
    answer_relevance_rate?: number;
  };
  passed: boolean;
  target: string;
  cases: RetrievalResult[] | E2EResult[];
}

// ── Test Cases ──

const TEST_CASES: TestCase[] = [
  { id: 1, query: "Where is the main entry point of this program?", expected_file: "dasize", description: "Find MAIN paragraph in dasize.cob" },
  { id: 2, query: "What does the dasize program do?", expected_file: "dasize", description: "Explain dasize.cob purpose" },
  { id: 3, query: "What is the cobxref tool used for?", expected_file: "cobxref", description: "Retrieve cobxref identification/purpose" },
  { id: 4, query: "Find all file I/O operations", expected_file: "cobxref", description: "File I/O in cobxref tool" },
  { id: 5, query: "Show me error handling patterns in this codebase", expected_file: "cobxref", description: "Error handling in cobxref" },
  { id: 6, query: "What are the dependencies of the accept-keys program?", expected_file: "accept-keys", description: "Dependencies in ask.cob" },
  { id: 7, query: "What functions modify customer records?", expected_file: "accept-keys", description: "Data modification in accept-keys" },
  { id: 8, query: "Show me the PROCEDURE DIVISION logic in the accept-keys program", expected_file: "accept-keys", description: "Procedure division of ask.cob" },
  { id: 9, query: "What does the wumpus game program do?", expected_file: "wumpus", description: "Wumpus game program explanation" },
  { id: 10, query: "Find programs that perform sorting operations", expected_file: "GCSORT", description: "GCSORT sorting tests" },
];

// E2E uses first 5 cases to limit cost/time
const E2E_SUBSET = TEST_CASES.slice(0, 5);

// ── Helpers ──

function checkHit(chunks: { source: string }[], expectedFile: string, topK: number): boolean {
  return chunks.slice(0, topK).some(c =>
    c.source.toLowerCase().includes(expectedFile.toLowerCase())
  );
}

function computeMRR(chunks: { source: string }[], expectedFile: string): number {
  const exp = expectedFile.toLowerCase();
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].source.toLowerCase().includes(exp)) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

function answerMentionsExpected(answer: string, expectedFile: string): boolean {
  return answer.toLowerCase().includes(expectedFile.toLowerCase());
}

const EVALS_DIR = path.join(__dirname, "../evals");
const RESULTS_DIR = path.join(EVALS_DIR, "results");
const HISTORY_FILE = path.join(EVALS_DIR, "history.jsonl");

function ensureDirs() {
  if (!fs.existsSync(EVALS_DIR)) fs.mkdirSync(EVALS_DIR, { recursive: true });
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

function saveResult(result: EvalResult): string {
  ensureDirs();
  const filename = `${result.timestamp}.json`;
  const filepath = path.join(RESULTS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(result, null, 2), "utf-8");
  return filepath;
}

function appendHistory(summary: Record<string, unknown>) {
  ensureDirs();
  fs.appendFileSync(HISTORY_FILE, JSON.stringify(summary) + "\n", "utf-8");
}

// ── Retrieval Evaluation ──

async function runRetrievalEval(): Promise<EvalResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const results: RetrievalResult[] = [];
  let top1Hits = 0, top3Hits = 0, top5Hits = 0;
  const latencies: number[] = [];
  const mrrScores: number[] = [];

  console.log("=".repeat(60));
  console.log("LegacyLens Retrieval Evaluation");
  console.log("=".repeat(60));
  console.log(`Test cases: ${TEST_CASES.length}`);
  console.log("Metrics: Precision @ Top-1/3/5, MRR, Latency (ms)\n");

  for (const tc of TEST_CASES) {
    process.stdout.write(`[${tc.id}/${TEST_CASES.length}] ${tc.description}... `);
    const start = Date.now();
    const chunks = await retrieveChunks(tc.query, 10);
    const latency = Date.now() - start;
    latencies.push(latency);

    const hit1 = checkHit(chunks, tc.expected_file, 1);
    const hit3 = checkHit(chunks, tc.expected_file, 3);
    const hit5 = checkHit(chunks, tc.expected_file, 5);
    const mrr = computeMRR(chunks, tc.expected_file);

    if (hit1) top1Hits++;
    if (hit3) top3Hits++;
    if (hit5) top5Hits++;
    mrrScores.push(mrr);

    const topSource = chunks[0]?.source ?? "none";
    const status = hit5 ? "✅ HIT" : "❌ MISS";
    console.log(`${status} (${latency}ms) — Top: ${topSource}`);

    results.push({
      id: tc.id,
      description: tc.description,
      hit1,
      hit3,
      hit5,
      mrr,
      latency_ms: latency,
      topSource,
    });
  }

  const n = TEST_CASES.length;
  const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / n);
  const avgMRR = mrrScores.reduce((a, b) => a + b, 0) / n;

  const evalResult: EvalResult = {
    timestamp,
    mode: "retrieval",
    metrics: {
      precision_top1: Math.round((top1Hits / n) * 100),
      precision_top3: Math.round((top3Hits / n) * 100),
      precision_top5: Math.round((top5Hits / n) * 100),
      mrr: Math.round(avgMRR * 1000) / 1000,
      latency_avg_ms: avgLatency,
      latency_min_ms: Math.min(...latencies),
      latency_max_ms: Math.max(...latencies),
    },
    passed: top5Hits / n >= 0.70,
    target: ">70% precision @ Top-5",
    cases: results,
  };

  console.log("\n" + "=".repeat(60));
  console.log("RESULTS SUMMARY");
  console.log("=".repeat(60));
  console.log(`Precision @ Top-1:  ${top1Hits}/${n} = ${evalResult.metrics.precision_top1}%`);
  console.log(`Precision @ Top-3:  ${top3Hits}/${n} = ${evalResult.metrics.precision_top3}%`);
  console.log(`Precision @ Top-5:  ${top5Hits}/${n} = ${evalResult.metrics.precision_top5}%`);
  console.log(`MRR:                ${avgMRR.toFixed(3)}`);
  console.log(`\nLatency (ms):`);
  console.log(`  Avg: ${avgLatency}  Min: ${Math.min(...latencies)}  Max: ${Math.max(...latencies)}`);
  console.log(`\nTarget: ${evalResult.target}`);
  console.log(`Status: ${evalResult.passed ? "✅ PASSED" : "❌ BELOW TARGET"}`);
  console.log("=".repeat(60));

  const filepath = saveResult(evalResult);
  console.log(`\nResults saved: ${filepath}`);

  appendHistory({
    ts: new Date().toISOString(),
    mode: "retrieval",
    precision_top5: evalResult.metrics.precision_top5,
    mrr: evalResult.metrics.mrr,
    latency_avg_ms: evalResult.metrics.latency_avg_ms,
    passed: evalResult.passed,
  });

  return evalResult;
}

// ── E2E Evaluation ──

async function runE2EEval(): Promise<EvalResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const results: E2EResult[] = [];
  let hit5Count = 0;
  let answerRelevantCount = 0;
  const retrievalLatencies: number[] = [];
  const e2eLatencies: number[] = [];

  console.log("=".repeat(60));
  console.log("LegacyLens E2E Evaluation (Retrieve + Generate)");
  console.log("=".repeat(60));
  console.log(`Test cases: ${E2E_SUBSET.length} (subset to limit cost)`);
  console.log("Metrics: Retrieval hit, E2E latency, Answer cites expected file\n");

  for (const tc of E2E_SUBSET) {
    process.stdout.write(`[${tc.id}/${E2E_SUBSET.length}] ${tc.description}... `);
    const startRetrieve = Date.now();
    const chunks = await retrieveChunks(tc.query, 10);
    const retrievalLatency = Date.now() - startRetrieve;
    retrievalLatencies.push(retrievalLatency);

    const hit5 = checkHit(chunks, tc.expected_file, 5);
    if (hit5) hit5Count++;

    const startE2E = Date.now();
    const answer = await generateAnswer(tc.query, chunks, "answer");
    const e2eLatency = Date.now() - startE2E;
    e2eLatencies.push(e2eLatency);

    const answerRelevant = answerMentionsExpected(answer, tc.expected_file);
    if (answerRelevant) answerRelevantCount++;

    const topSource = chunks[0]?.source ?? "none";
    const status = hit5 ? "✅" : "❌";
    const relStatus = answerRelevant ? "✓" : "✗";
    console.log(`${status} retrieve | ${relStatus} answer (${e2eLatency}ms)`);

    results.push({
      id: tc.id,
      description: tc.description,
      retrieval_hit5: hit5,
      retrieval_latency_ms: retrievalLatency,
      e2e_latency_ms: e2eLatency,
      answer_mentions_expected: answerRelevant,
      topSource,
    });
  }

  const n = E2E_SUBSET.length;
  const evalResult: EvalResult = {
    timestamp,
    mode: "e2e",
    metrics: {
      precision_top1: 0,
      precision_top3: 0,
      precision_top5: Math.round((hit5Count / n) * 100),
      latency_avg_ms: Math.round(retrievalLatencies.reduce((a, b) => a + b, 0) / n),
      latency_min_ms: Math.min(...retrievalLatencies),
      latency_max_ms: Math.max(...retrievalLatencies),
      e2e_latency_avg_ms: Math.round(e2eLatencies.reduce((a, b) => a + b, 0) / n),
      answer_relevance_rate: Math.round((answerRelevantCount / n) * 100),
    },
    passed: hit5Count / n >= 0.70,
    target: ">70% retrieval hit + answer cites expected file",
    cases: results,
  };

  console.log("\n" + "=".repeat(60));
  console.log("E2E RESULTS SUMMARY");
  console.log("=".repeat(60));
  console.log(`Retrieval hit @ Top-5:  ${hit5Count}/${n} = ${evalResult.metrics.precision_top5}%`);
  console.log(`Answer cites expected:  ${answerRelevantCount}/${n} = ${evalResult.metrics.answer_relevance_rate}%`);
  console.log(`Retrieval latency avg:  ${evalResult.metrics.latency_avg_ms}ms`);
  console.log(`E2E latency avg:        ${evalResult.metrics.e2e_latency_avg_ms}ms`);
  console.log(`\nStatus: ${evalResult.passed ? "✅ PASSED" : "❌ BELOW TARGET"}`);
  console.log("=".repeat(60));

  const filepath = saveResult(evalResult);
  console.log(`\nResults saved: ${filepath}`);

  appendHistory({
    ts: new Date().toISOString(),
    mode: "e2e",
    precision_top5: evalResult.metrics.precision_top5,
    answer_relevance_rate: evalResult.metrics.answer_relevance_rate,
    e2e_latency_avg_ms: evalResult.metrics.e2e_latency_avg_ms,
    passed: evalResult.passed,
  });

  return evalResult;
}

// ── CLI ──

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes("--e2e") ? "e2e" : args.includes("--all") ? "all" : "retrieval";

  if (mode === "retrieval") {
    await runRetrievalEval();
  } else if (mode === "e2e") {
    await runE2EEval();
  } else {
    await runRetrievalEval();
    console.log("\n");
    await runE2EEval();
  }
}

main().catch(console.error);
