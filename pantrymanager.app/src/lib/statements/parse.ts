import { parseBanamexStatement } from "./banamex";
import { isBbvaStatement, parseBbvaStatement } from "./bbva";
import type { ParsedStatement } from "./types";
import { StatementParseError } from "./types";

// Detecta el banco por el texto del PDF y usa su lector.
export function parseStatement(lines: string[]): ParsedStatement {
  const text = lines.join("\n");
  if (/BANAMEX/i.test(text) && /Estado de Cuenta/i.test(text)) return parseBanamexStatement(lines);
  if (isBbvaStatement(lines)) return parseBbvaStatement(lines);
  throw new StatementParseError("No reconozco este estado de cuenta. Por ahora leo Banamex y BBVA.");
}
