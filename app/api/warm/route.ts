import { NextRequest } from "next/server";
import { retrieveChunks } from "../../../src/retriever";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Keep-warm endpoint for cold start mitigation.
 * Vercel cron hits this every 5 min to keep retrieval (embed + Pinecone) warm.
 * Uses retrieval only, no LLM — minimal cost (~1 embed + 1 vector query per run).
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const t0 = performance.now();
    const chunks = await retrieveChunks("main", 1);
    const ms = Math.round(performance.now() - t0);
    return new Response(
      JSON.stringify({ ok: true, warm_ms: ms, chunks: chunks.length }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[GET /api/warm]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Warm failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
