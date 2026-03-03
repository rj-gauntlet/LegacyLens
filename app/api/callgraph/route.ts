import { NextRequest } from "next/server";
import { retrieveChunks } from "../../../src/retriever";
import { CallGraphNode, CallGraphEdge, CallGraphData } from "../../../src/types";

export const runtime = "nodejs";
export const maxDuration = 30;

function parseCallRelationships(
  chunks: { text: string; paragraph: string; section: string; source: string }[]
): { nodes: CallGraphNode[]; edges: CallGraphEdge[] } {
  const nodeMap = new Map<string, CallGraphNode>();
  const edges: CallGraphEdge[] = [];
  const edgeSet = new Set<string>();

  for (const chunk of chunks) {
    const currentId = chunk.paragraph || chunk.section || "MAIN";
    if (!nodeMap.has(currentId)) {
      nodeMap.set(currentId, {
        id: currentId,
        label: currentId,
        type: chunk.paragraph ? "paragraph" : "section",
      });
    }

    const text = chunk.text.toUpperCase();

    // PERFORM paragraph-name [THRU/THROUGH ...]
    const performMatches = text.matchAll(/PERFORM\s+([\w-]+)/g);
    for (const m of performMatches) {
      const target = m[1];
      if (["UNTIL", "VARYING", "WITH", "TEST", "TIMES"].includes(target)) continue;
      if (!nodeMap.has(target)) {
        nodeMap.set(target, { id: target, label: target, type: "paragraph" });
      }
      const key = `${currentId}->perform->${target}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({ from: currentId, to: target, type: "perform" });
      }
    }

    // CALL "program-name"
    const callMatches = text.matchAll(/CALL\s+["']([\w-]+)["']/g);
    for (const m of callMatches) {
      const target = m[1];
      if (!nodeMap.has(target)) {
        nodeMap.set(target, { id: target, label: target, type: "external" });
      }
      const key = `${currentId}->call->${target}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({ from: currentId, to: target, type: "call" });
      }
    }

    // COPY copybook-name
    const copyMatches = text.matchAll(/COPY\s+([\w-]+)/g);
    for (const m of copyMatches) {
      const target = m[1];
      if (!nodeMap.has(target)) {
        nodeMap.set(target, { id: target, label: target, type: "copybook" });
      }
      const key = `${currentId}->copy->${target}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({ from: currentId, to: target, type: "copy" });
      }
    }

    // GO TO paragraph-name
    const gotoMatches = text.matchAll(/GO\s+TO\s+([\w-]+)/g);
    for (const m of gotoMatches) {
      const target = m[1];
      if (!nodeMap.has(target)) {
        nodeMap.set(target, { id: target, label: target, type: "paragraph" });
      }
      const key = `${currentId}->goto->${target}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({ from: currentId, to: target, type: "goto" });
      }
    }
  }

  return { nodes: Array.from(nodeMap.values()), edges };
}

export async function POST(req: NextRequest) {
  const { program } = await req.json();

  if (!program || typeof program !== "string") {
    return new Response(JSON.stringify({ error: "Missing program name" }), {
      status: 400,
    });
  }

  // Retrieve a large number of chunks for the specified program
  const chunks = await retrieveChunks(program, 50);

  // Filter to only chunks from the target program
  const programLower = program.toLowerCase();
  const programChunks = chunks.filter((c) =>
    c.source.toLowerCase().includes(programLower)
  );

  const { nodes, edges } = parseCallRelationships(
    programChunks.length > 0 ? programChunks : chunks
  );

  const data: CallGraphData = {
    nodes,
    edges,
    programName: program,
  };

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}
