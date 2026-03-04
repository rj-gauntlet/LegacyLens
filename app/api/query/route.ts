import { NextRequest } from "next/server";
import { retrieveChunks, retrieveCrossFileChunks } from "../../../src/retriever";
import { generateAnswerStream } from "../../../src/generate";
import { FeatureMode } from "../../../src/types";

// Strip mode-specific language that pollutes the embedding search.
// We keep file/program names and domain terms but remove task verbs.
function buildSearchQuery(query: string, mode: FeatureMode): string {
  const lower = query.toLowerCase();
  
  // For these modes, the user's phrasing often includes target language or action words
  // that pull embeddings away from the actual code content we want to retrieve.
  const stripPatterns: Record<string, RegExp[]> = {
    translate: [/translate\s+(the\s+)?/gi, /\s+to\s+(python|typescript|javascript|java|go|rust|c\+\+|c#)/gi, /suggest\s+(modern\s+)?equivalents?\s*(for\s+)?/gi],
    impact: [/what\s+would\s+be\s+impacted\s+if\s+i?\s+(changed?|removed?|modified?)\s+/gi, /impact\s+(analysis\s+)?of\s+/gi],
    bug_pattern: [/scan\s+(for\s+)?(potential\s+)?(bugs?\s+)?(and\s+)?/gi, /find\s+(potential\s+)?bugs?\s+in\s+/gi],
    document: [/document\s+(the\s+)?/gi, /generate\s+documentation\s+for\s+/gi],
    explain: [/explain\s+(what\s+)?(the\s+)?/gi, /what\s+does\s+/gi, /\s+do(es)?\??$/gi],
    test_gen: [/generate\s+(unit\s+)?tests?\s+(for\s+)?/gi, /write\s+(pytest\s+)?tests?\s+(for\s+)?/gi, /test\s+(the\s+)?/gi],
    modernize: [/modernize\s+(the\s+)?/gi, /create\s+(a\s+)?migration\s+plan\s+(for\s+)?/gi, /modernization\s+plan\s+(for\s+)?/gi],
    cross_ref: [/trace\s+(the\s+)?/gi, /cross[- ]?reference\s+(for\s+)?/gi, /track\s+(the\s+)?usage\s+of\s+/gi, /\s+across\s+(all\s+)?(programs?|files?|modules?|the\s+codebase)/gi, /\s+in\s+(all\s+)?(programs?|files?)/gi],
  };

  let searchQuery = query;
  const patterns = stripPatterns[mode] ?? [];
  for (const pattern of patterns) {
    searchQuery = searchQuery.replace(pattern, " ");
  }
  return searchQuery.trim().replace(/\s+/g, " ") || query;
}

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let query: string;
  let mode: string;
  try {
    const body = await req.json();
    query = body?.query;
    mode = body?.mode ?? "answer";
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  if (!query || typeof query !== "string") {
    return new Response(JSON.stringify({ error: "Missing query" }), { status: 400 });
  }

  // Input validation: max length, strip control chars
  const MAX_QUERY_LENGTH = 2000;
  let sanitized = query.trim().slice(0, MAX_QUERY_LENGTH).replace(/[\x00-\x1f\x7f]/g, "");
  if (!sanitized) {
    return new Response(JSON.stringify({ error: "Query is empty after sanitization" }), { status: 400 });
  }
  query = sanitized;

  const encoder = new TextEncoder();

  try {
    const searchQuery = buildSearchQuery(query, mode as FeatureMode);
    const chunks =
      mode === "cross_ref"
        ? await retrieveCrossFileChunks(searchQuery, 15)
        : await retrieveChunks(searchQuery, 10);

    const stream = new ReadableStream({
      async start(controller) {
        // First, stream the chunks metadata as a JSON event
        const chunksPayload = JSON.stringify({ type: "chunks", chunks });
        controller.enqueue(encoder.encode(`data: ${chunksPayload}\n\n`));

        try {
          // Then stream the LLM answer
          await generateAnswerStream(
            query,
            chunks,
            mode as FeatureMode,
            (text) => {
              const payload = JSON.stringify({ type: "token", text });
              controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
            },
            () => {
              const payload = JSON.stringify({ type: "done" });
              controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
              controller.close();
            }
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : "LLM request failed.";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: msg })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed.";
    // Log server-side so you can see the real error in deployment logs (e.g. Cursor Labs / Vercel)
    console.error("[POST /api/query]", err);
    const body = JSON.stringify({ error: String(message).slice(0, 500) });
    return new Response(body, {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8", "X-Query-Error": "1" },
    });
  }
}
