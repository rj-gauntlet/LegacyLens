import { NextRequest } from "next/server";
import { explainChunk } from "../../../src/generate";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(req: NextRequest) {
  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }
  const text = body?.text;
  if (!text || typeof text !== "string") {
    return new Response(JSON.stringify({ error: "Missing text" }), { status: 400 });
  }
  const sanitized = text.trim().slice(0, 3000).replace(/[\x00-\x1f\x7f]/g, "");
  if (!sanitized) {
    return new Response(JSON.stringify({ error: "Empty text" }), { status: 400 });
  }
  try {
    const explanation = await explainChunk(sanitized);
    return new Response(JSON.stringify({ explanation }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Explanation failed.";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
