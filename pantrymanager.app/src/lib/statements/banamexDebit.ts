import { cleanMerchant } from "./banamex";
import type { DebitMovement, DebitMovementKind, DebitStatement } from "./types";
import { StatementParseError } from "./types";

const SHORT_MONTHS: Record<string, number> = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12,
};

const LONG_MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const AMOUNT = "([\\d,]+\\.\\d{2})";
// La última línea de un movimiento trae el monto y el saldo. Si solo trae el saldo, el movimiento no tiene monto.
const TWO_AMOUNTS = new RegExp(`(?:^|\\s)${AMOUNT}\\s+${AMOUNT}$`);
const ONE_AMOUNT = new RegExp(`(?:^|\\s)${AMOUNT}$`);
// "01 OCT CONCEPTO..." o "01 OCT" solo.
const MOVEMENT_START = /^(\d{2}) ([A-Z]{3})(?: (.*))?$/;
// El número de página puede venir en la misma línea que el pie ("Centro de Atención VIP ... Página 2 de 15").
const PAGE_START = /P[áa]gina \d+ de \d+/i;
const TABLE_HEADER = /^FECHA CONCEPTO/i;
// Pies y encabezados que pueden quedar entre las líneas de un movimiento.
const NOISE = [/^\d{6}\.B\d{2}/, /^Estado de Cuenta$/i, /^Cuenta Priority$/i, /^Detalle de Operaciones/i, /^Suc\. \d+/];
const BENEFICIARY = /AL BENEF\.?\s+(.+?)(?=\s*\(DATO|\s+SU REF|\s+CTA\b|\s+CLAVE\b|$)/i;

const money = (text: string): number => Number(text.replace(/,/g, ""));
const round2 = (n: number): number => Math.round(n * 100) / 100;
const normalizeLine = (line: string): string => line.normalize("NFC").replace(/\s+/g, " ").trim();
const pad = (n: number): string => String(n).padStart(2, "0");
const isoDate = (year: number, month: number, day: number): string => `${year}-${pad(month)}-${pad(day)}`;

export function isBanamexDebit(rawLines: string[]): boolean {
  const text = rawLines.join("\n");
  return /BANAMEX/i.test(text) && /Tarjeta de D[ée]bito/i.test(text) && /Detalle de Operaciones/i.test(text);
}

function firstMoney(lines: string[], re: RegExp): number | null {
  for (const line of lines) {
    const m = re.exec(line);
    if (m) return money(m[1]);
  }
  return null;
}

function classifyDebit(heading: string, direction: "out" | "in"): DebitMovementKind {
  if (direction === "in") return "deposit";
  if (/DIS\.?\s?EFE|RETIRO.*CAJERO|\bATM\b/i.test(heading)) return "cash";
  if (/PAGO A TERCEROS|PAGO INTERBANCARIO|TRANSFERENCIA|SPEI/i.test(heading)) return "transfer";
  if (/^(IVA )?COMISION/i.test(heading)) return "fee";
  return "purchase";
}

function merchantFor(kind: DebitMovementKind, heading: string, description: string): string {
  if (kind === "cash") return "Retiro en cajero";
  if (kind === "transfer") {
    const beneficiary = BENEFICIARY.exec(description);
    if (beneficiary) {
      const words = beneficiary[1].replace(/[,/]/g, " ").split(/\s+/).filter((w) => w.length > 0);
      return `Transferencia a ${[...new Set(words)].join(" ")}`;
    }
  }
  // cleanMerchant ya quita la clave de RFC del final.
  return cleanMerchant(heading);
}

export function parseBanamexDebit(rawLines: string[]): DebitStatement {
  const lines = rawLines.map(normalizeLine).filter((l) => l.length > 0);
  if (!isBanamexDebit(lines)) {
    throw new StatementParseError("Este PDF no parece un estado de cuenta de débito de Banamex.");
  }
  const text = lines.join("\n");

  const cardMatch = /N[úu]mero de Tarjeta de D[ée]bito\s+(\d[\d ]*\d)/i.exec(text);
  const digits = cardMatch ? cardMatch[1].replace(/\D/g, "") : "";
  if (digits.length < 4) throw new StatementParseError("No encontré el número de tarjeta en el estado.");
  const last4 = digits.slice(-4);

  const period = /Per[ií]odo\s+Del\s+(\d{1,2})(?:\s+de\s+([a-záéíóúñ]+))?(?:\s+de(?:l)?\s+(\d{4}))?\s+al\s+(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de(?:l)?\s+(\d{4})/i.exec(text);
  if (!period) throw new StatementParseError("No encontré el periodo del estado.");
  const endMonth = LONG_MONTHS[period[5].toLowerCase()];
  const endYear = Number(period[6]);
  if (!endMonth) throw new StatementParseError("No encontré el periodo del estado.");
  const startMonth = period[2] ? LONG_MONTHS[period[2].toLowerCase()] : endMonth;
  if (!startMonth) throw new StatementParseError("No encontré el periodo del estado.");
  const startYear = period[3] ? Number(period[3]) : startMonth > endMonth ? endYear - 1 : endYear;
  const periodStart = isoDate(startYear, startMonth, Number(period[1]));
  const periodEnd = isoDate(endYear, endMonth, Number(period[4]));

  const closingBalance = firstMoney(lines, /^Saldo al corte\s+\$?\s*([\d,]+\.\d{2})/i);
  if (closingBalance === null) throw new StatementParseError("No encontré el saldo al corte.");
  const retiros = firstMoney(lines, /^Retiros en efectivo\s+\$?\s*([\d,]+\.\d{2})/i);
  const otros = firstMoney(lines, /^Otros cargos\s+\$?\s*([\d,]+\.\d{2})/i);
  const comisiones = firstMoney(lines, /^Comisiones\s+\$?\s*([\d,]+\.\d{2})/i);
  const printedIn = firstMoney(lines, /^(?:\(\+\)\s*\d+\s+)?Dep[óo]sitos\s+\$?\s*([\d,]+\.\d{2})/i);
  const printedOut = retiros === null || otros === null ? null : round2(retiros + otros + (comisiones ?? 0));

  const detailIndex = lines.findIndex((l) => /^Detalle de Operaciones/i.test(l));
  if (detailIndex < 0) throw new StatementParseError("No encontré el detalle de operaciones.");

  type OpenMovement = { month: number; day: number; parts: string[] };
  let current: OpenMovement | null = null;
  let opening: number | null = null;
  let prev: number | null = null;
  let skipping = false;
  const movements: DebitMovement[] = [];

  for (const line of lines.slice(detailIndex + 1)) {
    if (PAGE_START.test(line)) {
      skipping = true;
      continue;
    }
    if (TABLE_HEADER.test(line)) {
      skipping = false;
      continue;
    }
    if (NOISE.some((re) => re.test(line))) continue;

    const start = MOVEMENT_START.exec(line);
    const isStart = start !== null && SHORT_MONTHS[start[2]] !== undefined;
    if (skipping && !isStart) continue;
    skipping = false;

    const rest = isStart && start ? start[3] ?? "" : line;
    if (isStart && start) {
      if (/^SALDO ANTERIOR/i.test(rest)) {
        const saldo = ONE_AMOUNT.exec(rest);
        if (!saldo) throw new StatementParseError("No encontré el saldo anterior.");
        opening = money(saldo[1]);
        prev = opening;
        current = null;
        continue;
      }
      current = { month: SHORT_MONTHS[start[2]], day: Number(start[1]), parts: [] };
    }
    if (!current) continue;

    const end = TWO_AMOUNTS.exec(rest);
    const piece = end ? rest.slice(0, end.index) : rest;
    if (piece.trim()) current.parts.push(piece.trim());
    if (!end) continue;

    const { month, day, parts } = current;
    current = null;
    const amount = money(end[1]);
    const balance = money(end[2]);
    if (prev === null) throw new StatementParseError("No encontré el saldo anterior.");
    const before = prev;
    prev = balance;
    // Renglón con solo saldo (por ejemplo, una exención de comisión): no es un movimiento.
    if (Math.abs(balance - before) < 0.005) continue;

    const direction: "out" | "in" = balance < before ? "out" : "in";
    const heading = parts[0] ?? "";
    const description = parts.join(" ");
    const kind = classifyDebit(heading, direction);
    const year = month > endMonth ? endYear - 1 : endYear;
    movements.push({
      date: isoDate(year, month, day),
      rawDescription: description,
      merchant: merchantFor(kind, heading, description),
      amount,
      direction,
      kind,
      balance,
    });
  }

  if (opening === null) throw new StatementParseError("No encontré el saldo anterior.");
  if (movements.length === 0) {
    throw new StatementParseError("Encontré el resumen pero ningún movimiento. Puede que el PDF sea una imagen escaneada.");
  }

  const readOut = round2(movements.filter((m) => m.direction === "out").reduce((s, m) => s + m.amount, 0));
  const readIn = round2(movements.filter((m) => m.direction === "in").reduce((s, m) => s + m.amount, 0));
  const lastBalance = prev ?? opening;
  const reconciles =
    printedOut !== null &&
    printedIn !== null &&
    Math.abs(readOut - printedOut) < 0.01 &&
    Math.abs(readIn - printedIn) < 0.01 &&
    Math.abs(lastBalance - closingBalance) < 0.01;

  return {
    bank: "banamex",
    last4,
    periodStart,
    periodEnd,
    openingBalance: opening,
    closingBalance,
    movements,
    printedOut,
    printedIn,
    readOut,
    readIn,
    reconciles,
  };
}
