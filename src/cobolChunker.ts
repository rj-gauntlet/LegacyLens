import { Document } from "@langchain/core/documents";
import * as fs from "fs/promises";

export interface CobolMetadata {
  source: string;
  loc_start: number;
  loc_end: number;
  division?: string;
  section?: string;
  paragraph?: string;
}

export async function chunkCobolFile(filePath: string): Promise<Document<CobolMetadata>[]> {
  const content = await fs.readFile(filePath, "utf-8");
  const lines = content.split(/\r?\n/);
  
  const documents: Document<CobolMetadata>[] = [];
  
  let currentDivision: string | undefined = undefined;
  let currentSection: string | undefined = undefined;
  let currentParagraph: string | undefined = undefined;
  
  let currentChunkLines: string[] = [];
  let chunkStartLine = 1;
  
  // Regex patterns for COBOL structure
  const divisionRegex = /^\s*([A-Z0-9\-]+)\s+DIVISION\./i;
  const sectionRegex = /^\s*([A-Z0-9\-]+)\s+SECTION\./i;
  // Paragraphs usually start in Area A (cols 8-11), so few spaces, end with dot.
  const paragraphRegex = /^.{0,11}([A-Z0-9\-]+)\.\s*$/i;
  
  const pushChunk = (endLine: number) => {
    if (currentChunkLines.length > 0 && currentChunkLines.some(l => l.trim().length > 0)) {
      documents.push(
        new Document({
          pageContent: currentChunkLines.join("\n"),
          metadata: {
            source: filePath,
            loc_start: chunkStartLine,
            loc_end: endLine,
            division: currentDivision,
            section: currentSection,
            paragraph: currentParagraph
          }
        })
      );
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    
    // Check for divisions
    const divMatch = line.match(divisionRegex);
    if (divMatch) {
      pushChunk(lineNumber - 1);
      currentDivision = divMatch[1].toUpperCase() + " DIVISION";
      currentSection = undefined;
      currentParagraph = undefined;
      currentChunkLines = [line];
      chunkStartLine = lineNumber;
      continue;
    }
    
    // Check for sections
    const secMatch = line.match(sectionRegex);
    if (secMatch) {
      pushChunk(lineNumber - 1);
      currentSection = secMatch[1].toUpperCase() + " SECTION";
      currentParagraph = undefined;
      currentChunkLines = [line];
      chunkStartLine = lineNumber;
      continue;
    }
    
    // Check for paragraphs (only in PROCEDURE DIVISION typically, but good to track anyway)
    // Ignore lines that are comments (usually asterisk in column 7, so index 6)
    const isComment = line.length > 6 && (line[6] === '*' || line[6] === '/');
    if (!isComment && currentDivision?.includes("PROCEDURE")) {
        const parMatch = line.match(paragraphRegex);
        if (parMatch && !line.toUpperCase().includes("EXIT")) {
            pushChunk(lineNumber - 1);
            currentParagraph = parMatch[1].toUpperCase();
            currentChunkLines = [line];
            chunkStartLine = lineNumber;
            continue;
        }
    }
    
    currentChunkLines.push(line);
  }
  
  // push last chunk
  pushChunk(lines.length);
  
  return documents;
}
