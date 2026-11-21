import { ThemeTokens } from "./themes";

export interface RowStyle {
  bgcolor?: string;
  borderRadius?: string;
  border?: string;
  borderBottom?: string;
  boxShadow?: string;
  mb?: number;
  pl?: number;
  pr?: number;
}

// Estilo de un renglón de lista según el tema: tarjeta, línea fina o línea de ticket.
// "dashed" es para lo que todavía no está resuelto (pendiente por buscar, sugerido).
export function rowStyle(tokens: ThemeTokens, dashed = false): RowStyle {
  if (tokens.rows === "cards") {
    return {
      bgcolor: dashed ? "transparent" : tokens.surface,
      borderRadius: `${tokens.radius}px`,
      border: dashed ? `2px dashed ${tokens.line}` : tokens.border,
      boxShadow: dashed ? "none" : tokens.shadow,
      mb: 0.75,
      pl: 2,
      pr: 0.5,
    };
  }

  return {
    borderBottom: dashed
      ? `1px dotted ${tokens.muted}`
      : tokens.rows === "ticket"
      ? `1px dashed ${tokens.text}`
      : `1px solid ${tokens.line}`,
    pl: 0.5,
    pr: 0,
  };
}
