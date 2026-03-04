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
  test_gen:
    `Generate Python unit tests (using pytest) that would verify the equivalent behavior of the provided COBOL code. For each test:
1. Name the test function descriptively based on the business logic being tested.
2. Include a brief docstring explaining what COBOL behavior is being validated.
3. Define the expected inputs and outputs based on the COBOL logic.
4. Use assertions that map to the COBOL conditions (IF, EVALUATE) and computations (COMPUTE, ADD, MULTIPLY).
5. Include edge case tests where appropriate (zero values, boundary conditions, empty strings).
If the COBOL code involves file I/O, mock the file operations and test the record processing logic.
Output ONLY valid Python code with pytest imports. Add comments referencing the original COBOL paragraph names and line numbers.`,
  modernize:
    `You are a senior solutions architect. Analyze the provided COBOL program and produce a structured modernization plan with the following sections:

## 1. Program Summary
One paragraph describing what this program does in business terms.

## 2. Architecture Recommendation
Suggest the modern architecture (e.g., REST API, serverless function, microservice, scheduled job) and justify why.

## 3. Technology Stack
Recommend specific modern technologies (language, framework, database, cloud services) for the rewrite.

## 4. Module Breakdown
List each COBOL section/paragraph as a discrete module to migrate. For each:
- Current COBOL paragraph/section name
- Proposed modern function/class name
- Complexity estimate (Low / Medium / High)
- Dependencies on other modules

## 5. Migration Order
Recommend the order to migrate modules (dependency-first), with rationale.

## 6. Risk Assessment
Identify the top 3-5 risks in migrating this specific program (data format changes, business logic ambiguity, untested edge cases).

## 7. Effort Estimate
Provide a rough effort estimate in developer-days for the full migration.

Be specific to the actual code provided — do not give generic advice.`,
  cross_ref:
    `Trace the given identifier (variable, paragraph name, file, or concept) across ALL files present in the retrieved context. For each file where it appears:
1. State the file name and line numbers.
2. Explain HOW the identifier is used in that file (defined, read, written, called, etc.).
3. Identify the data flow: where does data come FROM and where does it GO TO?

Organize your response by file. At the end, provide a summary of the cross-file relationships and any potential risks if this identifier were changed.`,
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

export async function explainChunk(code: string): Promise<string> {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are LegacyLens. Explain the given COBOL code in 1-2 clear sentences. Focus on what it does, not syntax.",
      },
      {
        role: "user",
        content: `Explain this COBOL code:\n\n${code.slice(0, 2000)}`,
      },
    ],
    temperature: 0.2,
    stream: false,
  });
  return response.choices[0]?.message?.content ?? "Could not generate explanation.";
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
