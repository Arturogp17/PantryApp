import type { CommitmentMonth, ExpenseCategory, MonthSpend } from "../types";

const pad = (n: number): string => String(n).padStart(2, "0");

// Mes en hora local como "2026-11".
export const monthKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

// Fecha local como "2026-11-21". No usa toISOString para no correrse de día por la zona horaria.
export const dateKey = (d: Date): string => `${monthKey(d)}-${pad(d.getDate())}`;

export const todayKey = (): string => dateKey(new Date());

// Suma días a una fecha "YYYY-MM-DD" con aritmética UTC, así que no depende de la zona horaria.
export function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

// Días desde "today" hasta una fecha "YYYY-MM-DD": positivo si falta, 0 si es hoy, negativo si ya pasó.
export function daysUntil(iso: string, today: Date = new Date()): number {
  const [y, m, d] = iso.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - now) / (24 * 60 * 60 * 1000));
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

// Rango de un mes para el API: "from" entra y "to" no.
export function monthRange(key: string): { from: string; to: string } {
  return { from: `${key}-01`, to: `${shiftMonth(key, 1)}-01` };
}

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_LONG = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DAYS_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

const parseKey = (key: string): [number, number] => {
  const [y, m] = key.split("-").map(Number);
  return [y, m];
};

export const monthShort = (key: string): string => MONTHS_SHORT[parseKey(key)[1] - 1];

export function monthLong(key: string): string {
  const [y, m] = parseKey(key);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

// "2026-11-21" -> "sáb 21 nov"
export function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${DAYS_SHORT[date.getDay()]} ${d} ${MONTHS_SHORT[m - 1]}`;
}

// "2026-12-08" -> "8 dic"
export function dayMonthLabel(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

// "2026-11-18" -> "18 nov 2026"
export function dateLabel(iso: string): string {
  return `${dayMonthLabel(iso)} ${iso.slice(0, 4)}`;
}

export interface ChartSegment {
  color: string;
  value: number;
}

export interface ChartMonth {
  key: string;
  label: string;
  total: number;
  segments: ChartSegment[];
}

export interface ChartSeries {
  id: number | "rest";
  name: string;
  color: string;
}

export const REST_COLOR = "#A9A56F";

// Las categorías de mayor gasto en los meses mostrados salen cada una con su color y el resto se junta.
export function buildMonthChart(
  months: MonthSpend[],
  categories: ExpenseCategory[],
  topN = 4
): { months: ChartMonth[]; series: ChartSeries[] } {
  const totals = new Map<number, number>();
  for (const m of months) {
    for (const c of m.byCategory) totals.set(c.id, (totals.get(c.id) ?? 0) + c.total);
  }

  const topIds = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([id]) => id);

  const byId = new Map(categories.map((c) => [c.id, c]));
  const series: ChartSeries[] = topIds.map((id) => ({
    id,
    name: byId.get(id)?.name ?? "Sin categoría",
    color: byId.get(id)?.color ?? REST_COLOR,
  }));

  const hasRest = months.some((m) => m.byCategory.some((c) => !topIds.includes(c.id)));
  if (hasRest) series.push({ id: "rest", name: "Resto", color: REST_COLOR });

  const chartMonths = months.map((m) => {
    const segments: ChartSegment[] = [];
    for (const s of series) {
      const value =
        s.id === "rest"
          ? m.byCategory.filter((c) => !topIds.includes(c.id)).reduce((sum, c) => sum + c.total, 0)
          : m.byCategory.find((c) => c.id === s.id)?.total ?? 0;
      if (value > 0) segments.push({ color: s.color, value });
    }
    return { key: m.month, label: monthShort(m.month), total: m.total, segments };
  });

  return { months: chartMonths, series };
}

// Compromisos por mes apilados por tarjeta. Cada tarjeta tiene su color y su serie; el orden de las
// series depende del total de la tarjeta en los meses mostrados (y del id para desempatar), no del orden
// en que llega la respuesta. Una tarjeta sin cargos en ningún mes no tiene serie.
export function buildCommitmentChart(months: CommitmentMonth[]): { months: ChartMonth[]; series: ChartSeries[] } {
  const totals = new Map<number, { name: string; color: string; total: number }>();
  for (const m of months) {
    for (const c of m.byCard) {
      const known = totals.get(c.cardId);
      if (known) known.total += c.total;
      else totals.set(c.cardId, { name: c.cardName, color: c.color, total: c.total });
    }
  }

  const series: ChartSeries[] = [...totals.entries()]
    .filter(([, t]) => t.total > 0)
    .sort((a, b) => b[1].total - a[1].total || a[0] - b[0])
    .map(([id, t]) => ({ id, name: t.name, color: t.color }));

  const chartMonths = months.map((m) => {
    const segments: ChartSegment[] = [];
    for (const s of series) {
      const value = m.byCard.find((c) => c.cardId === s.id)?.total ?? 0;
      if (value > 0) segments.push({ color: s.color, value });
    }
    return { key: m.month, label: monthShort(m.month), total: m.installmentsTotal, segments };
  });

  return { months: chartMonths, series };
}

// Fondo conic-gradient de una dona. Cada porción va de su inicio a su fin en porcentaje.
export function donutGradient(items: { color: string; total: number }[]): string {
  const sum = items.reduce((s, i) => s + i.total, 0);
  if (sum <= 0) return "conic-gradient(#DDE1C0 0 100%)";

  let acc = 0;
  const stops = items.map((i) => {
    const start = acc;
    acc += (i.total / sum) * 100;
    return `${i.color} ${start.toFixed(2)}% ${acc.toFixed(2)}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

// Monto corto para etiquetas de barras: 5420 -> "$5.4k"
export function shortMoney(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

// Último gasto con el mismo comercio (sin importar mayúsculas), para proponer categoría y tarjeta.
export function lastForMerchant<T extends { merchant: string }>(recent: T[], merchant: string): T | undefined {
  const needle = merchant.trim().toLowerCase();
  if (needle.length < 2) return undefined;
  return recent.find((e) => e.merchant.trim().toLowerCase() === needle);
}

export const CARD_COLORS = ["#2F6E94", "#B5483A", "#3B4517", "#8E6AA8", "#D9822B", "#2C7A5B", "#5E4B8B", "#C25B7E"];
