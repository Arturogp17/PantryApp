export type ThemeId = "mercado" | "calculadora" | "ticket" | "editorial" | "brutalista";

// Valores de diseño de cada tema. Las pantallas leen estos valores y el tema de MUI
// se construye a partir de ellos, así cambiar de tema cambia toda la app.
export interface ThemeTokens {
  id: ThemeId;
  name: string;
  description: string;
  mode: "light" | "dark";

  bg: string;
  surface: string;
  text: string;
  muted: string;
  line: string;

  primary: string;
  onPrimary: string;
  accent: string;
  onAccent: string;

  // Bloque del total ("Llevas")
  heroBg: string;
  heroText: string;
  heroLabel: string;
  totalSize: number;
  totalWeight: number;
  totalTracking: string;

  // Barra de acciones inferior (escanear / agregar)
  bar: string;
  barText: string;
  barRadius: number;
  barInset: number;
  scanBg: string;
  scanFg: string;
  addBg: string;
  addFg: string;

  radius: number;
  border: string; // "none" o "3px solid #111"
  shadow: string; // "none" o "4px 4px 0 #111"
  fontBody: string;
  fontDisplay: string;
  rows: "cards" | "ruled" | "ticket";
  uppercaseNames: boolean;
  mascotOpacity: number;
}

const SANS = '"Nunito", "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const THEMES: Record<ThemeId, ThemeTokens> = {
  mercado: {
    id: "mercado",
    name: "Mercado",
    description: "Claro y redondeado, con verde.",
    mode: "light",
    bg: "#F5F8F1",
    surface: "#FFFFFF",
    text: "#17301F",
    muted: "#4F6354",
    line: "#CFDBC8",
    primary: "#1F7A4D",
    onPrimary: "#FFFFFF",
    accent: "#FFD24A",
    onAccent: "#17301F",
    heroBg: "#1F7A4D",
    heroText: "#FFFFFF",
    heroLabel: "#FFFFFF",
    totalSize: 46,
    totalWeight: 800,
    totalTracking: "0",
    bar: "#17301F",
    barText: "#FFFFFF",
    barRadius: 36,
    barInset: 16,
    scanBg: "#FFFFFF",
    scanFg: "#17301F",
    addBg: "#FFD24A",
    addFg: "#17301F",
    radius: 20,
    border: "none",
    shadow: "none",
    fontBody: SANS,
    fontDisplay: SANS,
    rows: "cards",
    uppercaseNames: false,
    mascotOpacity: 0.16,
  },
  calculadora: {
    id: "calculadora",
    name: "Calculadora",
    description: "Oscuro, con el total enorme en verde lima.",
    mode: "dark",
    bg: "#0E1116",
    surface: "#171C24",
    text: "#F2F4F7",
    muted: "#9AA4B2",
    line: "#3A4352",
    primary: "#C6F36B",
    onPrimary: "#0E1116",
    accent: "#F2F4F7",
    onAccent: "#0E1116",
    heroBg: "transparent",
    heroText: "#C6F36B",
    heroLabel: "#9AA4B2",
    totalSize: 76,
    totalWeight: 700,
    totalTracking: "-0.04em",
    bar: "#0E1116",
    barText: "#F2F4F7",
    barRadius: 0,
    barInset: 0,
    scanBg: "#C6F36B",
    scanFg: "#0E1116",
    addBg: "#F2F4F7",
    addFg: "#0E1116",
    radius: 16,
    border: "none",
    shadow: "none",
    fontBody: '"Space Grotesk", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontDisplay: '"Space Grotesk", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    rows: "cards",
    uppercaseNames: false,
    mascotOpacity: 0.1,
  },
  ticket: {
    id: "ticket",
    name: "Ticket",
    description: "Como el comprobante del súper.",
    mode: "light",
    bg: "#C9D2D9",
    surface: "#FAFAF7",
    text: "#1A1A1A",
    muted: "#55554F",
    line: "#1A1A1A",
    primary: "#F2C94C",
    onPrimary: "#1A1A1A",
    accent: "#FAFAF7",
    onAccent: "#1A1A1A",
    heroBg: "#FAFAF7",
    heroText: "#1A1A1A",
    heroLabel: "#55554F",
    totalSize: 40,
    totalWeight: 700,
    totalTracking: "0",
    bar: "#1A1A1A",
    barText: "#FAFAF7",
    barRadius: 0,
    barInset: 0,
    scanBg: "#F2C94C",
    scanFg: "#1A1A1A",
    addBg: "#FAFAF7",
    addFg: "#1A1A1A",
    radius: 0,
    border: "none",
    shadow: "none",
    fontBody: '"IBM Plex Mono", "Courier New", monospace',
    fontDisplay: '"IBM Plex Mono", "Courier New", monospace',
    rows: "ticket",
    uppercaseNames: true,
    mascotOpacity: 0.18,
  },
  editorial: {
    id: "editorial",
    name: "Editorial",
    description: "Blanco y negro con un acento naranja.",
    mode: "light",
    bg: "#FFFFFF",
    surface: "#FFFFFF",
    text: "#111111",
    muted: "#5F5F5F",
    line: "#DADADA",
    primary: "#111111",
    onPrimary: "#FFFFFF",
    accent: "#C93A12",
    onAccent: "#FFFFFF",
    heroBg: "transparent",
    heroText: "#111111",
    heroLabel: "#5F5F5F",
    totalSize: 84,
    totalWeight: 800,
    totalTracking: "-0.06em",
    bar: "#111111",
    barText: "#FFFFFF",
    barRadius: 0,
    barInset: 0,
    scanBg: "#FFFFFF",
    scanFg: "#111111",
    addBg: "#C93A12",
    addFg: "#FFFFFF",
    radius: 0,
    border: "none",
    shadow: "none",
    fontBody: '"Manrope", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontDisplay: '"Manrope", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    rows: "ruled",
    uppercaseNames: false,
    mascotOpacity: 0.14,
  },
  brutalista: {
    id: "brutalista",
    name: "Brutalista",
    description: "Amarillo, bordes gruesos y sombras duras.",
    mode: "light",
    bg: "#FFD84D",
    surface: "#FFFFFF",
    text: "#111111",
    muted: "#2B2B2B",
    line: "#111111",
    primary: "#FF9DBD",
    onPrimary: "#111111",
    accent: "#8EC5FF",
    onAccent: "#111111",
    heroBg: "#111111",
    heroText: "#FFFFFF",
    heroLabel: "#FFD84D",
    totalSize: 56,
    totalWeight: 400,
    totalTracking: "0",
    bar: "#FFD84D",
    barText: "#111111",
    barRadius: 0,
    barInset: 0,
    scanBg: "#FF9DBD",
    scanFg: "#111111",
    addBg: "#FFFFFF",
    addFg: "#111111",
    radius: 0,
    border: "3px solid #111111",
    shadow: "4px 4px 0 #111111",
    fontBody: '"Archivo", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontDisplay: '"Archivo Black", "Archivo", Impact, sans-serif',
    rows: "cards",
    uppercaseNames: false,
    mascotOpacity: 0.22,
  },
};

export const THEME_LIST: ThemeTokens[] = [
  THEMES.mercado,
  THEMES.calculadora,
  THEMES.ticket,
  THEMES.editorial,
  THEMES.brutalista,
];

export const DEFAULT_THEME: ThemeId = "mercado";

export const isThemeId = (value: unknown): value is ThemeId =>
  typeof value === "string" && value in THEMES;
