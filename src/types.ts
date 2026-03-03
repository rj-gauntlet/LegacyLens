export interface RetrievedChunk {
  id: string;
  score: number;
  text: string;
  source: string;
  loc_start: number;
  loc_end: number;
  division: string;
  section: string;
  paragraph: string;
}

export type FeatureMode =
  | "answer"
  | "explain"
  | "document"
  | "translate"
  | "business_logic"
  | "dependency"
  | "bug_pattern"
  | "impact"
  | "test_gen"
  | "modernize"
  | "cross_ref";

export interface CallGraphNode {
  id: string;
  label: string;
  type: "paragraph" | "section" | "external" | "copybook";
}

export interface CallGraphEdge {
  from: string;
  to: string;
  type: "perform" | "call" | "copy" | "goto";
}

export interface CallGraphData {
  nodes: CallGraphNode[];
  edges: CallGraphEdge[];
  programName: string;
}
