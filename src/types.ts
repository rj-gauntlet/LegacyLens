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
  | "impact";
