"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import Prism from "prismjs";

const PRISM_LANGS_LOADED = new Set<string>();
function loadPrismLang(lang: string) {
  if (PRISM_LANGS_LOADED.has(lang) || Prism.languages[lang]) return;
  PRISM_LANGS_LOADED.add(lang);
  try {
    if (lang === "cobol") require("prismjs/components/prism-cobol");
    else if (lang === "python") require("prismjs/components/prism-python");
    else if (lang === "javascript" || lang === "js") require("prismjs/components/prism-javascript");
    else if (lang === "typescript" || lang === "ts") require("prismjs/components/prism-typescript");
    else if (lang === "bash" || lang === "shell") require("prismjs/components/prism-bash");
    else if (lang === "json") require("prismjs/components/prism-json");
    else if (lang === "sql") require("prismjs/components/prism-sql");
  } catch { /* language not available */ }
}
import { RetrievedChunk, FeatureMode, CallGraphData, CallGraphNode, CallGraphEdge } from "../src/types";

// ── Mode Definitions ──

const MODE_GROUPS = [
  {
    label: "UNDERSTAND",
    modes: [
      { value: "answer" as FeatureMode, label: "Ask", icon: "?", description: "Answer a question about the codebase" },
      { value: "explain" as FeatureMode, label: "Explain", icon: "i", description: "Explain what this code does" },
      { value: "document" as FeatureMode, label: "Document", icon: "D", description: "Generate documentation" },
    ],
  },
  {
    label: "TRANSFORM",
    modes: [
      { value: "translate" as FeatureMode, label: "Translate", icon: "T", description: "Suggest modern equivalents" },
      { value: "test_gen" as FeatureMode, label: "Test Gen", icon: "t", description: "Generate Python unit tests" },
      { value: "modernize" as FeatureMode, label: "Modernize", icon: "M", description: "Create a migration plan" },
    ],
  },
  {
    label: "ANALYZE",
    modes: [
      { value: "cross_ref" as FeatureMode, label: "Cross-Ref", icon: "X", description: "Trace identifiers across files" },
      { value: "business_logic" as FeatureMode, label: "Biz Logic", icon: "B", description: "Extract business rules" },
      { value: "dependency" as FeatureMode, label: "Deps", icon: "d", description: "Map dependencies" },
      { value: "bug_pattern" as FeatureMode, label: "Bug Scan", icon: "!", description: "Find potential issues" },
      { value: "impact" as FeatureMode, label: "Impact", icon: "*", description: "Analyze change impact" },
    ],
  },
];

const ALL_MODES = MODE_GROUPS.flatMap((g) => g.modes);
const QUERY_HISTORY_KEY = "legacylens_query_history";
const THEME_KEY = "legacylens_theme";
const MAX_HISTORY = 10;

// ── Types ──

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: FeatureMode;
  chunks?: RetrievedChunk[];
  isStreaming?: boolean;
}

interface TooltipInfo {
  label: string;
  description?: string;
  top: number;
  left: number;
  positionAbove?: boolean;
}

// ── Sidebar Button ──

function SidebarButton({
  icon,
  label,
  description,
  tooltipAbove,
  active,
  expanded,
  onClick,
  onTooltip,
}: {
  icon: string;
  label: string;
  description?: string;
  tooltipAbove?: boolean;
  active: boolean;
  expanded: boolean;
  onClick: () => void;
  onTooltip: (tip: TooltipInfo | null) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <button
      ref={btnRef}
      onClick={onClick}
      onMouseEnter={() => {
        if (!btnRef.current) return;
        const rect = btnRef.current.getBoundingClientRect();
        if (expanded && description) {
          onTooltip({
            label,
            description,
            top: tooltipAbove ? rect.top : rect.bottom + 6,
            left: rect.left,
            positionAbove: tooltipAbove,
          });
        } else if (!expanded) {
          onTooltip({ label, top: rect.top + rect.height / 2 - 12, left: rect.right + 8 });
        }
      }}
      onMouseLeave={() => onTooltip(null)}
      className="flex items-center transition-all"
      style={{
        width: "100%",
        height: 40,
        marginBottom: 2,
        borderRadius: 0,
        borderLeft: active ? "3px solid var(--accent-green)" : "3px solid transparent",
        background: active ? "var(--bg-elevated)" : "transparent",
        color: active ? "var(--accent-green)" : "var(--text-muted)",
        fontSize: 14,
        fontWeight: 700,
        fontFamily: "inherit",
        justifyContent: expanded ? "flex-start" : "center",
        paddingLeft: expanded ? 12 : 0,
        gap: expanded ? 10 : 0,
      }}
    >
      <span style={{ width: 20, textAlign: "center", flexShrink: 0 }}>{icon}</span>
      {expanded && <span className="truncate text-xs">{label}</span>}
    </button>
  );
}

// ── Sidebar ──

function Sidebar({
  mode,
  setMode,
  view,
  setView,
  onTooltip,
}: {
  mode: FeatureMode;
  setMode: (m: FeatureMode) => void;
  view: "chat" | "callgraph";
  setView: (v: "chat" | "callgraph") => void;
  onTooltip: (tip: TooltipInfo | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sidebarWidth = expanded ? 180 : 56;

  return (
    <aside
      className="flex-shrink-0 flex flex-col py-3 gap-0.5 border-r sidebar-transition"
      style={{
        width: sidebarWidth,
        background: "var(--bg-surface)",
        borderColor: "var(--border-green)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-center mx-auto mb-2 transition-all"
        style={{
          width: expanded ? "calc(100% - 16px)" : 40,
          height: 28,
          borderRadius: 2,
          background: "transparent",
          color: "var(--text-muted)",
          fontSize: 12,
          fontWeight: 700,
          fontFamily: "inherit",
          border: "1px solid var(--border-green)",
        }}
      >
        {expanded ? "\u00AB Collapse" : "\u00BB"}
      </button>

      {MODE_GROUPS.map((group, gi) => (
        <div key={gi} className="w-full flex flex-col">
          {gi > 0 && (
            <div
              className="mx-auto my-1.5"
              style={{ width: expanded ? "calc(100% - 24px)" : 24, height: 1, background: "var(--border-green-bright)" }}
            />
          )}
          {expanded && (
            <span
              className="px-4 mb-1 text-xs font-bold uppercase tracking-wider"
              style={{ color: "var(--text-green-dim)", fontSize: 9 }}
            >
              {group.label}
            </span>
          )}
          {group.modes.map((m) => (
            <SidebarButton
              key={m.value}
              icon={m.icon}
              label={m.label}
              description={m.description}
              active={view === "chat" && mode === m.value}
              expanded={expanded}
              onClick={() => { setMode(m.value); setView("chat"); }}
              onTooltip={onTooltip}
            />
          ))}
        </div>
      ))}

      <div className="mt-auto w-full flex flex-col">
        <div
          className="mx-auto my-1.5"
          style={{ width: expanded ? "calc(100% - 24px)" : 24, height: 1, background: "var(--border-green-bright)" }}
        />
        {expanded && (
          <span
            className="px-4 mb-1 text-xs font-bold uppercase tracking-wider"
            style={{ color: "var(--text-green-dim)", fontSize: 9 }}
          >
            VIEW
          </span>
        )}
        <SidebarButton
          icon=">_"
          label="Chat"
          description="Switch to chat and ask questions"
          tooltipAbove
          active={view === "chat"}
          expanded={expanded}
          onClick={() => setView("chat")}
          onTooltip={onTooltip}
        />
        <SidebarButton
          icon="#"
          label="Call Graph"
          description="Visualize PERFORM, CALL, COPY relationships"
          tooltipAbove
          active={view === "callgraph"}
          expanded={expanded}
          onClick={() => setView("callgraph")}
          onTooltip={onTooltip}
        />
      </div>
    </aside>
  );
}

// ── Chunk Display ──

function CodeBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="relative group">
      <button
        onClick={copy}
        className="absolute top-2 right-2 text-xs font-mono px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-green-bright)", color: "var(--accent-green)", borderRadius: 2 }}
        title="Copy"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
      <pre
        className="overflow-x-auto text-xs leading-relaxed font-mono whitespace-pre-wrap p-3 pr-16"
        style={{ color: "var(--amber)", background: "var(--bg-deep)" }}
      >
        {text}
      </pre>
    </div>
  );
}

function ChunkCard({ chunk, index, maxScore }: { chunk: RetrievedChunk; index: number; maxScore: number }) {
  const [expanded, setExpanded] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainText, setExplainText] = useState<string | null>(null);
  const relevance = Math.round(chunk.score * 100);
  const relColor =
    relevance >= 80 ? "var(--accent-green)" : relevance >= 60 ? "var(--amber)" : "#f87171";
  const barPct = maxScore > 0 ? Math.min(100, (chunk.score / maxScore) * 100) : relevance;

  const onExplain = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (explainLoading || explainText) return;
    setExplainLoading(true);
    try {
      const res = await fetch("/api/explain-chunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: chunk.text }),
      });
      const data = await res.json();
      setExplainText(data.explanation ?? data.error ?? "Could not explain.");
    } catch {
      setExplainText("Request failed.");
    } finally {
      setExplainLoading(false);
    }
  };

  return (
    <div className="overflow-hidden" style={{ border: "1px solid var(--border-green)", borderRadius: 2, background: "var(--bg-surface)" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-2 text-left transition-colors"
        style={{ fontSize: 11 }}
      >
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span style={{ color: "var(--text-green-dim)" }}>#{index + 1}</span>
          <span className="font-mono truncate max-w-[180px]" style={{ color: "var(--text-green)" }}>
            {chunk.source}
          </span>
          <span style={{ color: "var(--text-muted)" }}>
            L{chunk.loc_start}-{chunk.loc_end}
          </span>
          {chunk.paragraph && (
            <span style={{ color: "var(--amber)", opacity: 0.8 }}>
              [{chunk.paragraph}]
            </span>
          )}
        </div>
        <span className="font-bold shrink-0 ml-2" style={{ color: relColor }}>
          {relevance}%
        </span>
      </button>
      <div className="px-2 pb-1.5">
        <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--bg-deep)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${barPct}%`, background: relColor }}
          />
        </div>
      </div>
      {expanded && (
        <div style={{ borderTop: "1px solid var(--border-green)" }}>
          <div className="flex items-center justify-between px-2 py-1" style={{ background: "var(--bg-panel)", borderBottom: "1px solid var(--border-green)" }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Relevance: {relevance}%</span>
            <button
              onClick={onExplain}
              disabled={explainLoading}
              className="text-xs font-mono px-2 py-1 transition-colors"
              style={{ color: "var(--accent-green)", border: "1px solid var(--border-green-bright)", borderRadius: 2, background: "var(--bg-surface)" }}
            >
              {explainLoading ? "..." : explainText ? "Explained" : "Explain"}
            </button>
          </div>
          {explainText && (
            <p className="text-xs px-3 py-2" style={{ color: "var(--text-green-dim)", background: "var(--bg-deep)", borderBottom: "1px solid var(--border-green)" }}>
              &gt; {explainText}
            </p>
          )}
          <CodeBlock text={chunk.text} />
        </div>
      )}
    </div>
  );
}

function CollapsedChunks({ chunks }: { chunks: RetrievedChunk[] }) {
  if (!chunks || chunks.length === 0) return null;
  const topChunk = chunks[0];
  const topSource = topChunk.source.split("\\").pop() ?? topChunk.source;
  const topScore = Math.round(topChunk.score * 100);
  const maxScore = Math.max(...chunks.map((c) => c.score), 0.01);

  return (
    <details className="group mt-3">
      <summary
        className="cursor-pointer select-none transition-colors text-xs font-mono py-1.5 px-3"
        style={{
          color: "var(--text-green-dim)",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-green)",
          borderRadius: 2,
        }}
      >
        <span style={{ color: "var(--text-muted)" }}>&gt;</span>{" "}
        {chunks.length} chunks retrieved{" "}
        <span style={{ color: "var(--text-muted)" }}>|</span>{" "}
        top: <span style={{ color: "var(--text-green)" }}>{topSource}</span>{" "}
        <span style={{ color: "var(--amber)" }}>({topScore}%)</span>{" "}
        <span style={{ color: "var(--text-muted)" }}>{"────"} [expand]</span>
      </summary>
      <div className="space-y-1 mt-2">
        {chunks.map((chunk, i) => (
          <ChunkCard key={chunk.id} chunk={chunk} index={i} maxScore={maxScore} />
        ))}
      </div>
    </details>
  );
}

// ── Side-by-Side (Translate Mode) ──

function SideBySideView({ message }: { message: Message }) {
  const cobolCode = (message.chunks ?? [])
    .map((c) => `      *> File: ${c.source} | Lines ${c.loc_start}-${c.loc_end}\n${c.text}`)
    .join("\n\n");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "var(--amber)" }} />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--amber)" }}>
              Original COBOL
            </span>
          </div>
          <pre
            className="overflow-x-auto text-xs leading-relaxed font-mono whitespace-pre-wrap h-[400px] overflow-y-auto p-4"
            style={{ color: "var(--amber)", background: "var(--bg-deep)", border: "1px solid var(--border-green)", borderRadius: 2 }}
          >
            {cobolCode || "Waiting for code chunks..."}
          </pre>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "var(--accent-green)" }} />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--accent-green)" }}>
              Python Translation
            </span>
          </div>
          <pre
            className="overflow-x-auto text-xs leading-relaxed font-mono whitespace-pre-wrap h-[400px] overflow-y-auto p-4"
            style={{ color: "var(--accent-green)", background: "var(--bg-deep)", border: "1px solid var(--border-green)", borderRadius: 2 }}
          >
            {message.content || "Generating translation..."}
            {message.isStreaming && <span className="terminal-cursor" />}
          </pre>
        </div>
      </div>
      <CollapsedChunks chunks={message.chunks ?? []} />
    </div>
  );
}

// ── Markdown Code Highlight ──

function MarkdownCode({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const lang = match ? match[1] : "";
  const code = String(children).replace(/\n$/, "");

  if (!match) {
    return (
      <code className="font-mono text-xs px-1 py-0.5" style={{ color: "var(--amber)", background: "var(--bg-deep)", borderRadius: 2 }} {...props}>
        {children}
      </code>
    );
  }

  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  loadPrismLang(lang);
  let html = "";
  const grammar = Prism.languages[lang];
  if (grammar) {
    try { html = Prism.highlight(code, grammar, lang); } catch { /* fall back */ }
  }

  return (
    <div className="relative group my-2">
      <button
        onClick={copy}
        className="absolute top-2 right-2 text-xs font-mono px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity z-[1]"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-green-bright)", color: "var(--accent-green)", borderRadius: 2 }}
        title="Copy"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
      <pre className="overflow-x-auto text-xs leading-relaxed font-mono p-3 pr-16" style={{ background: "var(--bg-deep)", borderRadius: 2, border: "1px solid var(--border-green)" }}>
        {html ? (
          <code className={className} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <code className={className}>{code}</code>
        )}
      </pre>
    </div>
  );
}

const markdownComponents = {
  code: MarkdownCode as any,
  pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
};

// ── Assistant Message ──

function AssistantMessage({ message }: { message: Message }) {
  if (message.mode === "translate") {
    return <SideBySideView message={message} />;
  }

  const modeLabel = ALL_MODES.find((m) => m.value === message.mode)?.label ?? message.mode;

  return (
    <div className="space-y-2">
      {message.mode && (
        <span
          className="inline-block text-xs font-mono px-2 py-0.5 uppercase tracking-wider"
          style={{
            color: "var(--accent-green)",
            border: "1px solid var(--border-green-bright)",
            borderRadius: 2,
          }}
        >
          [{modeLabel}]
        </span>
      )}
      <div className="flex items-start gap-2">
        <span className="crt-glow shrink-0 mt-3 text-sm" style={{ color: "var(--accent-green)" }}>&gt;</span>
        <div
          className="terminal-markdown text-sm leading-relaxed flex-1 min-w-0"
          style={{ background: "var(--bg-panel)", border: "1px solid var(--border-green)", borderRadius: 2, padding: "1em 1.2em" }}
        >
          {message.content ? (
            <>
              <ReactMarkdown components={markdownComponents}>{message.content}</ReactMarkdown>
              {message.isStreaming && <span className="terminal-cursor" />}
            </>
          ) : message.isStreaming ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-3 rounded" style={{ background: "var(--border-green)", width: "95%" }} />
              <div className="h-3 rounded" style={{ background: "var(--border-green)", width: "80%" }} />
              <div className="h-3 rounded" style={{ background: "var(--border-green)", width: "70%" }} />
              <span className="terminal-cursor" />
            </div>
          ) : null}
        </div>
      </div>
      <CollapsedChunks chunks={message.chunks ?? []} />
    </div>
  );
}

// ── Call Graph Visualization ──

const NODE_W = 150;
const NODE_H = 36;
const LEVEL_GAP = 90;
const NODE_GAP = 30;

const EDGE_COLORS: Record<string, string> = {
  perform: "#00ff41",
  call: "#ffb000",
  copy: "#39ff14",
  goto: "#f87171",
};

const GR_NODE_FILL: Record<string, string> = {
  paragraph: "#0d1f0d",
  section: "#111a11",
  external: "#1a1400",
  copybook: "#0d120d",
};

const GR_NODE_BORDER: Record<string, string> = {
  paragraph: "#00ff41",
  section: "#39ff14",
  external: "#ffb000",
  copybook: "#5a7a2a",
};

interface LayoutNode extends CallGraphNode {
  x: number;
  y: number;
  level: number;
}

function computeGraphLayout(nodes: CallGraphNode[], edges: CallGraphEdge[]): LayoutNode[] {
  if (nodes.length === 0) return [];

  const children = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const n of nodes) {
    children.set(n.id, []);
    inDegree.set(n.id, 0);
  }
  for (const e of edges) {
    children.get(e.from)?.push(e.to);
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
  }

  let roots = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  if (roots.length === 0) roots = [nodes[0].id];

  const levels = new Map<string, number>();
  const queue = roots.map((r) => ({ id: r, level: 0 }));
  const visited = new Set<string>();
  while (queue.length > 0) {
    const { id, level } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    levels.set(id, level);
    for (const child of children.get(id) ?? []) {
      if (!visited.has(child)) {
        queue.push({ id: child, level: level + 1 });
      }
    }
  }

  for (const n of nodes) {
    if (!levels.has(n.id))
      levels.set(n.id, levels.size > 0 ? Math.max(...levels.values()) + 1 : 0);
  }

  const byLevel = new Map<number, CallGraphNode[]>();
  for (const n of nodes) {
    const lvl = levels.get(n.id) ?? 0;
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl)!.push(n);
  }

  const result: LayoutNode[] = [];
  const sortedLevels = [...byLevel.entries()].sort((a, b) => a[0] - b[0]);
  const maxLevel = sortedLevels.length > 0 ? sortedLevels[sortedLevels.length - 1][0] : 0;
  for (const [lvl, group] of sortedLevels) {
    const totalWidth = group.length * NODE_W + (group.length - 1) * NODE_GAP;
    const startX = -totalWidth / 2 + NODE_W / 2;
    // Stagger single-node levels horizontally so they don't stack in a vertical column
    const stagger = group.length === 1 && maxLevel > 0
      ? ((lvl / maxLevel) - 0.5) * (NODE_W + NODE_GAP) * Math.min(maxLevel, 4)
      : 0;
    group.forEach((n, i) => {
      result.push({
        ...n,
        x: startX + i * (NODE_W + NODE_GAP) + stagger,
        y: lvl * (NODE_H + LEVEL_GAP),
        level: lvl,
      });
    });
  }

  return result;
}

function CallGraphViewer() {
  const [program, setProgram] = useState("");
  const [graphData, setGraphData] = useState<CallGraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const fetchGraph = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!program.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/callgraph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program: program.trim() }),
      });
      const data: CallGraphData = await res.json();
      if (data.nodes.length === 0) {
        setError("No call relationships found for this program.");
        setGraphData(null);
      } else {
        setGraphData(data);
      }
    } catch {
      setError("Failed to generate call graph.");
    } finally {
      setLoading(false);
    }
  };

  const layoutNodes = graphData
    ? computeGraphLayout(graphData.nodes, graphData.edges)
    : [];
  const nodeMap = new Map(layoutNodes.map((n) => [n.id, n]));

  const padding = 40;
  let minX = 0,
    maxX = 0,
    maxY = 0;
  for (const n of layoutNodes) {
    if (n.x - NODE_W / 2 < minX) minX = n.x - NODE_W / 2;
    if (n.x + NODE_W / 2 > maxX) maxX = n.x + NODE_W / 2;
    if (n.y + NODE_H > maxY) maxY = n.y + NODE_H;
  }
  const svgW = maxX - minX + padding * 2;
  const svgH = maxY + padding * 2;
  const offsetX = -minX + padding;
  const offsetY = padding;

  const connectedToHovered = new Set<string>();
  if (hoveredNode && graphData) {
    for (const e of graphData.edges) {
      if (e.from === hoveredNode) connectedToHovered.add(e.to);
      if (e.to === hoveredNode) connectedToHovered.add(e.from);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <form onSubmit={fetchGraph} className="flex gap-3 mb-4">
        <div className="flex-1 flex items-center gap-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-green)", borderRadius: 2, padding: "0 12px" }}>
          <span className="crt-glow" style={{ color: "var(--accent-green)", fontSize: 14, fontWeight: 700 }}>&gt;_</span>
          <input
            type="text"
            value={program}
            onChange={(e) => setProgram(e.target.value)}
            placeholder="program name (cobxref, dasize, wumpus)..."
            className="flex-1 bg-transparent py-2.5 text-sm focus:outline-none"
            style={{ color: "var(--text-body)" }}
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !program.trim()}
          className="font-mono text-xs font-bold px-4 py-2.5 transition-colors"
          style={{
            background: loading ? "var(--bg-panel)" : "var(--bg-elevated)",
            border: "1px solid var(--border-green-bright)",
            borderRadius: 2,
            color: loading ? "var(--text-muted)" : "var(--accent-green)",
          }}
        >
          {loading ? "..." : "[GENERATE]"}
        </button>
      </form>

      {error && (
        <div
          className="text-sm mb-4 px-4 py-2.5 font-mono"
          style={{ background: "#1a0808", border: "1px solid #4a1515", borderRadius: 2, color: "#f87171" }}
        >
          ERROR: {error}
        </div>
      )}

      {graphData && layoutNodes.length > 0 && (
        <div className="flex-1 overflow-auto" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-green)", borderRadius: 2 }}>
          <div className="flex gap-4 px-4 py-2 flex-wrap" style={{ borderBottom: "1px solid var(--border-green)", fontSize: 11 }}>
            <span style={{ color: "var(--text-muted)" }} className="uppercase tracking-wide font-bold mr-1">
              Legend:
            </span>
            {Object.entries(EDGE_COLORS).map(([type, color]) => (
              <span key={type} className="flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                <span className="w-4 h-0.5 inline-block" style={{ backgroundColor: color, borderRadius: 1 }} />
                {type.toUpperCase()}
              </span>
            ))}
            <span style={{ color: "var(--text-green-dim)" }} className="ml-auto">
              {graphData.nodes.length} nodes / {graphData.edges.length} edges
            </span>
          </div>

          <svg width={Math.max(svgW, 600)} height={Math.max(svgH, 200)} className="mx-auto">
            <defs>
              {Object.entries(EDGE_COLORS).map(([type, color]) => (
                <marker key={type} id={`arrow-${type}`} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
                </marker>
              ))}
            </defs>
            <g transform={`translate(${offsetX}, ${offsetY})`}>
              {graphData.edges.map((edge, i) => {
                const from = nodeMap.get(edge.from);
                const to = nodeMap.get(edge.to);
                if (!from || !to) return null;
                const x1 = from.x, y1 = from.y + NODE_H, x2 = to.x, y2 = to.y;
                const midY = (y1 + y2) / 2;
                const dimmed = hoveredNode && edge.from !== hoveredNode && edge.to !== hoveredNode;
                return (
                  <g key={i} className="callgraph-animate-edge" style={{ animationDelay: `${i * 40}ms` }}>
                    <path
                      d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                      stroke={EDGE_COLORS[edge.type] ?? "#333"}
                      strokeWidth={dimmed ? 1 : 2}
                      fill="none"
                      opacity={dimmed ? 0.15 : 0.8}
                      markerEnd={`url(#arrow-${edge.type})`}
                    />
                  </g>
                );
              })}
              {layoutNodes.map((node, nodeIdx) => {
                const isHovered = hoveredNode === node.id;
                const isConnected = connectedToHovered.has(node.id);
                const dimmed = hoveredNode && !isHovered && !isConnected;
                return (
                  <g
                    key={`${node.id}-${nodeIdx}`}
                    transform={`translate(${node.x - NODE_W / 2}, ${node.y})`}
                    onMouseEnter={() => setHoveredNode(node.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                    style={{ cursor: "pointer" }}
                  >
                    <g
                      style={{ opacity: dimmed ? 0.25 : 1, animationDelay: `${graphData.edges.length * 40 + nodeIdx * 50}ms` }}
                      className="callgraph-animate-node"
                    >
                    <rect
                      width={NODE_W}
                      height={NODE_H}
                      rx={2}
                      fill={GR_NODE_FILL[node.type] ?? "#0d120d"}
                      stroke={isHovered ? "var(--accent-green)" : (GR_NODE_BORDER[node.type] ?? "#1a2e1a")}
                      strokeWidth={isHovered ? 2 : 1}
                    />
                    <text
                      x={NODE_W / 2}
                      y={NODE_H / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={isHovered ? "#fff" : "var(--text-green)"}
                      fontSize={node.label.length > 16 ? 9 : 11}
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {node.label.length > 22 ? node.label.slice(0, 20) + "\u2026" : node.label}
                    </text>
                    </g>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      )}

      {!graphData && !error && (
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 py-20">
          <pre className="crt-glow text-xs leading-tight" style={{ color: "var(--accent-green)" }}>
{`   ____      _ _    ____                 _     
  / ___|__ _| | |  / ___|_ __ __ _ _ __ | |__  
 | |   / _\` | | | | |  _| '__/ _\` | '_ \\| '_ \\ 
 | |__| (_| | | | | |_| | | | (_| | |_) | | | |
  \\____\\__,_|_|_|  \\____|_|  \\__,_| .__/|_| |_|
                                   |_|          `}
          </pre>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Enter a COBOL program name to visualize its call relationships.
          </p>
          <div className="flex gap-2 mt-2">
            {["cobxref", "wumpus", "dasize"].map((p) => (
              <button
                key={p}
                onClick={() => setProgram(p)}
                className="text-xs font-mono px-3 py-1.5 transition-colors"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-green)",
                  borderRadius: 2,
                  color: "var(--text-green-dim)",
                }}
              >
                $ {p}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ASCII Art Logo ──

const ASCII_LOGO = `
 _                                _                   
| |    ___  __ _  __ _  ___ _   _| |    ___ _ __  ___ 
| |   / _ \\/ _\` |/ _\` |/ __| | | | |   / _ \\ '_ \\/ __|
| |__|  __/ (_| | (_| | (__| |_| | |__|  __/ | | \\__ \\
|_____\\___|\\__, |\\__,_|\\___|\\__, |_____\\___|_| |_|___/
            |___/            |___/                     
`.trimStart();

// ── Main App ──

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<FeatureMode>("answer");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"chat" | "callgraph">("chat");
  const [sidebarTooltip, setSidebarTooltip] = useState<TooltipInfo | null>(null);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const bottomRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(QUERY_HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) setQueryHistory(parsed.slice(0, MAX_HISTORY));
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY) as "dark" | "light" | null;
      if (saved === "dark" || saved === "light") setTheme(saved);
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!historyOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setHistoryOpen(false);
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [historyOpen]);

  const pushHistory = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setQueryHistory((prev) => {
      const next = [trimmed, ...prev.filter((x) => x !== trimmed)].slice(0, MAX_HISTORY);
      try {
        localStorage.setItem(QUERY_HISTORY_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const runQuery = async (query: string, assistantId: string) => {
    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, mode }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const message = (errBody as { error?: string }).error ?? `Request failed (${response.status})`;
        throw new Error(message);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);
          try {
            const event = JSON.parse(jsonStr);
            if (event.type === "chunks") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, chunks: event.chunks } : m
                )
              );
            } else if (event.type === "token") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + event.text }
                    : m
                )
              );
            } else if (event.type === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: `Error: ${event.message ?? "Request failed."}`, isStreaming: false }
                    : m
                )
              );
            } else if (event.type === "done") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, isStreaming: false } : m
                )
              );
            }
          } catch {}
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get response.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `Error: ${message}`, isStreaming: false }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const pickHistory = (q: string, submit = false) => {
    setHistoryOpen(false);
    if (submit && !loading) {
      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: q,
        mode,
      };
      const assistantId = (Date.now() + 1).toString();
      setMessages((prev) => [...prev, userMessage, {
        id: assistantId,
        role: "assistant",
        content: "",
        mode,
        chunks: [],
        isStreaming: true,
      }]);
      setLoading(true);
      runQuery(q, assistantId);
    } else {
      setInput(q);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q || loading) return;
    pushHistory(q);
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: q,
      mode,
    };
    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, userMessage, {
      id: assistantId,
      role: "assistant",
      content: "",
      mode,
      chunks: [],
      isStreaming: true,
    }]);
    setInput("");
    setLoading(true);
    runQuery(q, assistantId);
  };

  const selectedMode = ALL_MODES.find((m) => m.value === mode)!;

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <Sidebar mode={mode} setMode={setMode} view={view} setView={setView} onTooltip={setSidebarTooltip} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header
          className="flex-shrink-0 flex items-center justify-between px-5 py-3 sticky top-0 z-10"
          style={{ borderBottom: "1px solid var(--border-green)", background: "var(--bg-deep)" }}
        >
          <div>
            <h1 className="text-base font-bold crt-glow tracking-tight" style={{ color: "var(--accent-green)" }}>
              LegacyLens
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-green-dim)" }}>
              {view === "callgraph" ? "call graph visualization" : `mode: ${selectedMode.label.toLowerCase()}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              className="text-xs font-mono px-2 py-1 transition-colors hover:opacity-80"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-green)",
                borderRadius: 2,
                color: "var(--text-green-dim)",
              }}
              title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            >
              <span className="tracking-wide">
                {theme === "dark" ? "█ Light" : "█ Dark"}
              </span>
            </button>
            <div
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: "var(--accent-green)" }}
            />
            <span className="text-xs font-mono" style={{ color: "var(--text-green-dim)" }}>
              gnucobol-contrib
            </span>
          </div>
        </header>

        {/* Call Graph View */}
        {view === "callgraph" && (
          <main className="flex-1 overflow-hidden px-5 py-4">
            <CallGraphViewer />
          </main>
        )}

        {/* Chat View */}
        {view === "chat" && (
          <main className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-5 py-16">
                <pre
                  className="crt-glow text-xs leading-tight select-none"
                  style={{ color: "var(--accent-green)" }}
                >
                  {ASCII_LOGO}
                </pre>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Query your COBOL codebase in plain English. Select a mode from the sidebar.
                </p>
                <div className="flex flex-col gap-1.5 mt-3 w-full max-w-lg">
                  {[
                    "Where is the main entry point of this program?",
                    "Find all file I/O operations",
                    "Show me error handling patterns in this codebase",
                    "Translate cobxref to Python",
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => setInput(q)}
                      className="text-left text-xs font-mono px-3 py-2 transition-colors"
                      style={{
                        color: "var(--text-green-dim)",
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-green)",
                        borderRadius: 2,
                      }}
                    >
                      <span style={{ color: "var(--accent-green)" }}>$</span> {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div key={message.id}>
                {message.role === "user" ? (
                  <div
                    className="flex items-start gap-2 text-sm font-mono px-4 py-2.5"
                    style={{
                      background: "var(--bg-panel)",
                      borderLeft: "3px solid var(--accent-green)",
                      borderRadius: 2,
                    }}
                  >
                    <span className="crt-glow shrink-0" style={{ color: "var(--accent-green)" }}>
                      $
                    </span>
                    <span style={{ color: "var(--text-body)" }}>{message.content}</span>
                  </div>
                ) : (
                  <div className="pl-1">
                    <AssistantMessage message={message} />
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </main>
        )}

        {/* Input */}
        {view === "chat" && (
          <footer className="flex-shrink-0 px-5 py-3" style={{ borderTop: "1px solid var(--border-green)" }}>
            <form onSubmit={handleSubmit} className="flex gap-3">
              <div className="flex-1 relative" ref={historyRef}>
                <div
                  className="flex items-center gap-2"
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-green)",
                    borderRadius: 2,
                    padding: "0 12px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setHistoryOpen((o) => !o)}
                    className="shrink-0 text-xs font-mono py-2.5"
                    style={{ color: "var(--text-green-dim)" }}
                    title="Query history"
                  >
                    [⌃]
                  </button>
                  <span className="crt-glow shrink-0" style={{ color: "var(--accent-green)", fontSize: 14, fontWeight: 700 }}>
                    &gt;_
                  </span>
                  <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.ctrlKey) {
                      e.preventDefault();
                      if (!loading && input.trim()) {
                        const form = e.currentTarget.form;
                        form?.requestSubmit();
                      }
                    }
                  }}
                  placeholder={`${selectedMode.label.toLowerCase()}... (Ctrl+Enter to send)`}
                  className="flex-1 py-2.5 text-sm focus:outline-none placeholder-opacity-40"
                  style={{
                    color: "var(--text-body)",
                    background: "var(--bg-surface)",
                    caretColor: "var(--accent-green)",
                  }}
                  disabled={loading}
                />
                {loading && <span className="terminal-cursor" />}
                </div>
                {historyOpen && queryHistory.length > 0 && (
                  <div
                    className="absolute bottom-full left-0 right-0 mb-1 overflow-auto max-h-48"
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-green-bright)",
                      borderRadius: 2,
                      zIndex: 100,
                    }}
                  >
                    <div className="px-2 py-1.5 text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                      Recent queries
                    </div>
                    {queryHistory.map((q) => (
                      <div key={q} className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => pickHistory(q, false)}
                          className="flex-1 text-left text-xs font-mono px-3 py-2 truncate transition-colors hover:bg-[var(--bg-panel)]"
                          style={{ color: "var(--text-green-dim)" }}
                        >
                          {q}
                        </button>
                        <button
                          type="button"
                          onClick={() => pickHistory(q, true)}
                          className="text-[10px] font-mono px-2 shrink-0"
                          style={{ color: "var(--accent-green)" }}
                        >
                          [Run]
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="font-mono text-xs font-bold px-4 py-2.5 transition-colors"
                style={{
                  background: loading || !input.trim() ? "var(--bg-panel)" : "var(--bg-elevated)",
                  border: "1px solid var(--border-green-bright)",
                  borderRadius: 2,
                  color: loading || !input.trim() ? "var(--text-muted)" : "var(--accent-green)",
                }}
              >
                [SEND]
              </button>
            </form>
            <p className="text-xs mt-1.5 text-center font-mono" style={{ color: "var(--text-green-dim)", opacity: 0.5 }}>
              embedding: text-embedding-3-small | vector-db: pinecone | llm: gpt-4o-mini
            </p>
          </footer>
        )}
      </div>

      {/* Sidebar Tooltip */}
      {sidebarTooltip && (
        <div
          style={{
            position: "fixed",
            top: sidebarTooltip.top,
            left: sidebarTooltip.left,
            transform: sidebarTooltip.positionAbove ? "translateY(calc(-100% - 6px))" : undefined,
            zIndex: 99999,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-green-bright)",
            color: "var(--text-green)",
            fontSize: 11,
            padding: "6px 10px",
            borderRadius: 2,
            maxWidth: 260,
            whiteSpace: sidebarTooltip.description ? "normal" : "nowrap",
            pointerEvents: "none",
          }}
        >
          {sidebarTooltip.description ?? sidebarTooltip.label}
        </div>
      )}
    </div>
  );
}
