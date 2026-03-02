"use client";

import { useState, useRef, useEffect } from "react";
import { RetrievedChunk, FeatureMode } from "../src/types";


const MODES: { value: FeatureMode; label: string; icon: string; description: string }[] = [
  { value: "answer", label: "Ask", icon: "💬", description: "Answer a question about the codebase" },
  { value: "explain", label: "Explain", icon: "📖", description: "Explain what this code does" },
  { value: "document", label: "Document", icon: "📄", description: "Generate documentation" },
  { value: "translate", label: "Translate", icon: "🔄", description: "Suggest modern equivalents" },
  { value: "business_logic", label: "Business Logic", icon: "🏢", description: "Extract business rules" },
  { value: "dependency", label: "Dependencies", icon: "🔗", description: "Map dependencies" },
  { value: "bug_pattern", label: "Bug Scan", icon: "🐛", description: "Find potential issues" },
  { value: "impact", label: "Impact", icon: "💥", description: "Analyze change impact" },
];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: FeatureMode;
  chunks?: RetrievedChunk[];
  isStreaming?: boolean;
}

function CodeBlock({ text }: { text: string }) {
  return (
    <pre className="bg-gray-900 border border-gray-700 rounded-lg p-4 overflow-x-auto text-xs leading-relaxed font-mono text-gray-300 whitespace-pre-wrap">
      {text}
    </pre>
  );
}

function ChunkCard({ chunk, index }: { chunk: RetrievedChunk; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const relevance = Math.round(chunk.score * 100);
  const relevanceColor =
    relevance >= 80 ? "text-green-400" : relevance >= 60 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden bg-gray-900">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start justify-between p-3 text-left hover:bg-gray-800 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono bg-gray-800 border border-gray-700 text-blue-300 px-2 py-0.5 rounded">
              #{index + 1}
            </span>
            <span className="text-xs text-gray-300 font-mono truncate max-w-[200px]">
              {chunk.source}
            </span>
            <span className="text-xs text-gray-500">
              L{chunk.loc_start}–{chunk.loc_end}
            </span>
            {chunk.paragraph && (
              <span className="text-xs bg-purple-900/50 border border-purple-700 text-purple-300 px-2 py-0.5 rounded font-mono">
                ¶ {chunk.paragraph}
              </span>
            )}
            {chunk.division && (
              <span className="text-xs bg-blue-900/50 border border-blue-700 text-blue-300 px-2 py-0.5 rounded font-mono">
                {chunk.division}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-3 shrink-0">
          <span className={`text-xs font-bold ${relevanceColor}`}>{relevance}%</span>
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-gray-700">
          <CodeBlock text={chunk.text} />
        </div>
      )}
    </div>
  );
}

function AssistantMessage({ message }: { message: Message }) {
  return (
    <div className="space-y-4">
      {/* Answer */}
      <div className="prose prose-invert prose-sm max-w-none">
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
          {message.content}
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 bg-blue-400 ml-1 animate-pulse" />
          )}
        </div>
      </div>

      {/* Retrieved Chunks */}
      {message.chunks && message.chunks.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">
            Retrieved {message.chunks.length} code chunks
          </p>
          <div className="space-y-2">
            {message.chunks.map((chunk, i) => (
              <ChunkCard key={chunk.id} chunk={chunk} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<FeatureMode>("answer");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      mode,
    };

    const assistantId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      chunks: [],
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: input.trim(), mode }),
      });

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
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Error: Failed to get response.", isStreaming: false }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const selectedMode = MODES.find((m) => m.value === mode)!;

  return (
    <div className="flex flex-col h-screen max-w-5xl mx-auto">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Legacy<span className="text-blue-400">Lens</span>
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              RAG-powered natural language queries for COBOL codebases
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-gray-400">gnucobol-contrib</span>
          </div>
        </div>

        {/* Mode Selector */}
        <div className="flex gap-1.5 mt-4 flex-wrap">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              title={m.description}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                mode === m.value
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
              }`}
            >
              <span>{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-20">
            <div className="text-5xl">🔍</div>
            <h2 className="text-lg font-semibold text-gray-300">
              Query your COBOL codebase in plain English
            </h2>
            <p className="text-sm text-gray-500 max-w-md">
              Ask anything about the GnuCOBOL Contrib codebase. Try one of the example queries below.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 w-full max-w-xl">
              {[
                "Where is the main entry point of this program?",
                "What functions modify customer records?",
                "Find all file I/O operations",
                "Show me error handling patterns in this codebase",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="text-left text-xs text-gray-400 bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 hover:bg-gray-800 hover:text-gray-200 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id}>
            {message.role === "user" ? (
              <div className="flex justify-end">
                <div className="max-w-[80%] bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-2 mb-1 opacity-70">
                    <span className="text-xs">{MODES.find((m) => m.value === message.mode)?.icon}</span>
                    <span className="text-xs capitalize">{message.mode?.replace("_", " ")}</span>
                  </div>
                  {message.content}
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 mt-1 text-sm">
                  🔍
                </div>
                <div className="flex-1 min-w-0">
                  <AssistantMessage message={message} />
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </main>

      {/* Input */}
      <footer className="flex-shrink-0 border-t border-gray-800 px-6 py-4">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`${selectedMode.icon} ${selectedMode.description}...`}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-5 py-3 rounded-xl text-sm font-medium transition-colors"
          >
            {loading ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
            Send
          </button>
        </form>
        <p className="text-xs text-gray-600 mt-2 text-center">
          Powered by OpenAI text-embedding-3-small · Pinecone · GPT-4o-mini · LangChain
        </p>
      </footer>
    </div>
  );
}
