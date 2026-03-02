import OpenAI from "openai";
import { RetrievedChunk, FeatureMode } from "./types";

const SYSTEM_PROMPT = `You are LegacyLens, an expert AI assistant for analyzing legacy COBOL codebases.

You will be given relevant code chunks retrieved from a COBOL codebase. Your job is to answer the user's question accurately and helpfully based on the provided code context.

Rules:
- Always cite the source file and line numbers when referencing specific code.
- Format code references clearly (e.g., "In [filename], line [N]-[M]:")
- Be concise but thorough.
- Do not hallucinate variable names, paragraph names, or logic that is not visible in the provided context.
- For factual questions (Ask, Dependencies, Bug Scan, Impact): if the context does not contain enough information, respond with "I cannot answer this based on the provided codebase context."
- For generative tasks (Explain, Document, Translate, Business Logic): use the retrieved context as your primary source, and supplement with your general knowledge of COBOL conventions where the context is sparse — but always be clear about which parts are inferred vs directly observed.`;

const FEATURE_PROMPTS: Record<FeatureMode, string> = {
  answer: "Answer the user's question based on the code context provided.",
  explain:
    "Explain in plain English what the provided code does, step by step. Focus on the business purpose, not just the syntax.",
  document:
    "Generate clear technical documentation for the provided code. Include: purpose, inputs/outputs (data items), side effects, and any called paragraphs or programs.",
  translate:
    "Based on the retrieved COBOL code and program structure, suggest how this program or logic could be rewritten in Python. Use the retrieved context as your primary source. If only metadata (IDENTIFICATION DIVISION) is available, describe what the Python equivalent would look like based on the program's stated purpose and any visible data structures or file operations. Clearly note which parts are inferred from purpose vs directly translated from code.",
  business_logic:
    "Extract and explain the core business rules embedded in this code. What decisions does it make? What conditions does it check? What are the business outcomes?",
  dependency:
    "Identify and list all dependencies in this code: what paragraphs or sections it calls (PERFORM), what files it reads/writes (SELECT, OPEN, READ, WRITE), and what data items it uses from WORKING-STORAGE.",
  bug_pattern:
    "Analyze this COBOL code for potential bugs or anti-patterns. Look for: uninitialized variables, missing error handling after file I/O, arithmetic overflow risks, and dead code.",
  impact:
    "Analyze what would be impacted if this code were changed or removed. What other paragraphs PERFORM it? What data items does it modify that might be used elsewhere?",
};

let openaiClient: OpenAI | null = null;

function getOpenAI() {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

function buildContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map(
      (chunk, i) =>
        `--- Chunk ${i + 1} | File: ${chunk.source} | Lines: ${chunk.loc_start}-${chunk.loc_end} | ${chunk.division}${chunk.paragraph ? ` > ${chunk.paragraph}` : ""} | Relevance: ${(chunk.score * 100).toFixed(1)}% ---\n${chunk.text}`
    )
    .join("\n\n");
}

export async function generateAnswer(
  query: string,
  chunks: RetrievedChunk[],
  mode: FeatureMode = "answer"
): Promise<string> {
  if (chunks.length === 0) {
    return "I cannot answer this based on the provided codebase context. No relevant code chunks were retrieved.";
  }

  const openai = getOpenAI();
  const context = buildContext(chunks);
  const featureInstruction = FEATURE_PROMPTS[mode];

  const userMessage = `${featureInstruction}

USER QUESTION: ${query}

RETRIEVED CODE CONTEXT:
${context}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0.1,
    stream: false,
  });

  return response.choices[0]?.message?.content ?? "No response generated.";
}

export async function generateAnswerStream(
  query: string,
  chunks: RetrievedChunk[],
  mode: FeatureMode = "answer",
  onChunk: (text: string) => void,
  onDone: () => void
): Promise<void> {
  if (chunks.length === 0) {
    onChunk("I cannot answer this based on the provided codebase context. No relevant code chunks were retrieved.");
    onDone();
    return;
  }

  const openai = getOpenAI();
  const context = buildContext(chunks);
  const featureInstruction = FEATURE_PROMPTS[mode];

  const userMessage = `${featureInstruction}

USER QUESTION: ${query}

RETRIEVED CODE CONTEXT:
${context}`;

  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0.1,
    stream: true,
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content ?? "";
    if (text) onChunk(text);
  }
  onDone();
}
