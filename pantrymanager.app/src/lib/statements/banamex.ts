import type { ParsedStatement, StatementInstallment, StatementLine } from "./types";
import { StatementParseError } from "./types";

const MONTHS: Record<string, string> = {
  ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
  jul: "07", ago: "08", sep: "09", oct: "10", nov: "11", dic: "12",
};

const DATE = "(\\d{1,2}-[a-zA-Z]{3}-\\d{4})";
const MONEY = "\\$\\s*([\\d,]+\\.\\d{2})";

// "08-dic-2026" -> "2026-12-08"
export function parseSpanishDate(text: string): string | null {
  const m = /^(\d{1,2})-([a-zA-Z]{3})-(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
}

const money = (text: string): number => Number(text.replace(/,/g, ""));

// Quita del texto de un movimiento la clave de RFC del comercio y los restos de ciudad.
export function cleanMerchant(raw: string): string {
  let text = raw.replace(/\s+/g, " ").trim();

  // "NPA 0803124V6MX", "HEGD631208L71MX", "CCO 8605231N4": letras opcionales, 6 dígitos y 3 caracteres.
  text = text.replace(/\s+(?:[A-Z&Ñ]{3,4}\s?)?\d{6}[A-Z0-9]{3}(?:MX)?$/, "");
  // Mensualidad: "001 de 003".
  text = text.replace(/\s+\d{1,3} de \d{1,3}$/i, "");
  // Ciudad pegada al país: "SN LUIS POTOSMX".
  text = text.replace(/\s+SN LUIS POTOS(?:I)?(?:\s?MX)?$/, "");

  return text.replace(/\s+/g, " ").trim();
}

// Quita acentos y mayúsculas para comparar etiquetas: "Número" y "NUMERO" dan lo mismo.
export const fold = (text: string): string => text.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();

const normalizeLine = (line: string): string => line.normalize("NFC").replace(/\s+/g, " ").trim();

// Últimos 4 dígitos del número de tarjeta. Primero "Número de tarjeta" con los dígitos completos;
// si no aparece, prueba las etiquetas de respaldo (con la tarjeta enmascarada, por ejemplo "XXXXXXXXXXXX5947").
export function findCardLast4(lines: string[], fallbacks: RegExp[] = []): string | null {
  for (const line of lines) {
    const m = /NUMERO DE TARJETA:?\s+(\d[\d ]{14,22}\d)/.exec(fold(line));
    if (m) return m[1].replace(/\D/g, "").slice(-4);
  }
  for (const re of fallbacks) {
    for (const line of lines) {
      const m = re.exec(fold(line));
      if (m) return m[1];
    }
  }
  return null;
}

// "Tarjeta titular: XXXXXXXXXXXX5947": solo los últimos 4 dígitos tras las X.
export const MASKED_TITULAR = /TARJETA TITULAR:?\s*[X*\s]*(\d{4})\b/;

// Valores del resumen. Los grupos son lo que interesa: el monto sin "$", la fecha, o las dos fechas del periodo.
export const MONEY_VALUE = /\$\s*([\d,]+\.\d{2})/;
export const DATE_VALUE = /(\d{1,2}-[a-zA-Z]{3}-\d{4})/;
export const PERIOD_VALUE = /(\d{1,2}-[a-zA-Z]{3}-\d{4})\s+al\s+(\d{1,2}-[a-zA-Z]{3}-\d{4})/i;

// Etiquetas del resumen. Sirven para cortar el texto de una etiqueta antes de la siguiente
// y para no tomar el valor de una línea vecina que ya es de otra etiqueta.
const SUMMARY_LABELS: RegExp[] = [
  /Fecha l[íi]mite de pago:?/i,
  /Periodo:/i,
  /Pago para no generar intereses:/i,
  /Pago m[íi]nimo \+ compras[^:$]*:/i,
  /Pago m[íi]nimo:/i,
  /Saldo deudor total:/i,
  /Saldo cargos? regulares?:/i,
  /Saldo cargos? a meses:/i,
  /L[íi]mite de cr[ée]dito:/i,
  /Cr[ée]dito disponible:/i,
  /N[úu]mero de tarjeta:/i,
  /Tarjeta titular:/i,
  /TASA DE INTER[ÉE]S ANUAL/i,
];

// Criterio de la etiqueta: si está escrita en mayúsculas y sin acentos (por ejemplo "NUMERO DE TARJETA"),
// se busca en fold(línea), así coincide aunque el PDF la traiga con acentos o en minúsculas.
// Cualquier otra etiqueta (con minúsculas o acentos en la expresión) se busca tal cual.
const isFoldedLabel = (label: RegExp): boolean => {
  const src = label.source.replace(/\\./g, "");
  return !/[a-zñ]/.test(src) && !/[^ -~]/.test(src);
};

// Otra etiqueta del resumen en la línea, distinta de la buscada. Acepta la línea tal cual y sin acentos.
const hasOtherLabel = (line: string, label: RegExp): boolean =>
  SUMMARY_LABELS.some((k) => k.source !== label.source && (k.test(line) || k.test(fold(line))));

// Posición donde empieza la siguiente etiqueta del resumen (distinta de la buscada), desde "from". Si no hay, el final del texto.
function nextOtherLabel(text: string, from: number, label: RegExp): number {
  let end = text.length;
  for (const k of SUMMARY_LABELS) {
    if (k.source === label.source) continue;
    const g = new RegExp(k.source, "gi");
    g.lastIndex = from;
    const m = g.exec(text);
    if (m && m.index < end) end = m.index;
  }
  return end;
}

// Última coincidencia de una expresión global en el texto. Con varios montos en una línea, es la columna de valores.
function lastMatch(re: RegExp, text: string): RegExpExecArray | null {
  let last: RegExpExecArray | null = null;
  re.lastIndex = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) last = m;
  return last;
}

// Busca el valor de una etiqueta cuando el PDF la separa de su valor (pdf.js pone líneas distintas
// si la etiqueta y el valor tienen tamaños de letra distintos). Orden:
// 1) El texto que sigue a la etiqueta en su misma línea, hasta la siguiente etiqueta del resumen. Gana la primera coincidencia.
// 2) Las líneas vecinas en el orden i-1, i+1, i-2, i+2, hasta "window". Una línea vecina se descarta si tiene otra etiqueta del resumen.
//    De esa línea se toma la coincidencia más a la derecha.
// Las coincidencias de la misma línea son relativas al texto buscado, no a la línea completa.
// Si la etiqueta se buscó en fold(línea), el resultado de la misma línea viene en mayúsculas y sin acentos.
export function valueNearLabel(lines: string[], label: RegExp, value: RegExp, window = 2): RegExpExecArray | null {
  const labelRe = new RegExp(label.source, label.flags.replace(/[gy]/g, ""));
  const valueRe = new RegExp(value.source, value.flags.replace(/[gy]/g, ""));
  const valueAll = new RegExp(value.source, valueRe.flags + "g");
  const folded = isFoldedLabel(label);

  for (let i = 0; i < lines.length; i++) {
    const hay = folded ? fold(lines[i]) : lines[i];
    const hit = labelRe.exec(hay);
    if (!hit) continue;

    const start = hit.index + hit[0].length;
    const same = valueRe.exec(hay.slice(start, nextOtherLabel(hay, start, label)));
    if (same) return same;

    for (let d = 1; d <= window; d++) {
      for (const j of [i - d, i + d]) {
        if (j < 0 || j >= lines.length || hasOtherLabel(lines[j], label)) continue;
        const near = lastMatch(valueAll, lines[j]);
        if (near) return near;
      }
    }
  }
  return null;
}

// Tasa anual del estado: la etiqueta "TASA DE INTERES ANUAL" va en una línea y el valor en las siguientes,
// en una línea con "Sin IVA" que termina con la tasa (por ejemplo "71.5% Sin IVA 55.52%"). Se toma el último porcentaje.
export function annualRateAfterLabel(lines: string[]): number | null {
  const label = /TASA DE INTER[ÉE]S ANUAL/i;
  for (let i = 0; i < lines.length; i++) {
    if (!label.test(lines[i])) continue;
    // En el navegador (pdf.js) pueden quedar varias líneas de otras columnas entre la etiqueta y el valor.
    for (let j = i + 1; j < Math.min(lines.length, i + 9); j++) {
      if (!/sin iva/i.test(lines[j])) continue;
      const pct = [...lines[j].matchAll(/(\d+(?:\.\d+)?)\s*%/g)];
      if (pct.length > 0) return Number(pct[pct.length - 1][1]);
    }
  }
  return null;
}

type Section = "none" | "installments" | "installmentsInterest" | "regular";

export function parseBanamexStatement(rawLines: string[]): ParsedStatement {
  const lines = rawLines.map(normalizeLine).filter((l) => l.length > 0);
  const text = lines.join("\n");

  if (!/BANAMEX/i.test(text) || !/Estado de Cuenta/i.test(text)) {
    throw new StatementParseError("Este PDF no parece un estado de cuenta de Banamex.");
  }

  const moneyAfter = (label: RegExp): number | null => {
    const m = valueNearLabel(lines, label, MONEY_VALUE);
    return m === null ? null : money(m[1]);
  };

  // Solo se guardan los últimos 4 dígitos del número de tarjeta.
  const last4 = findCardLast4(lines, [MASKED_TITULAR]);
  if (!last4) throw new StatementParseError("No encontré el número de tarjeta en el estado.");

  const period = valueNearLabel(lines, /Periodo:/i, PERIOD_VALUE);
  const periodStart = period ? parseSpanishDate(period[1]) : null;
  const periodEnd = period ? parseSpanishDate(period[2]) : null;
  if (!periodStart || !periodEnd) throw new StatementParseError("No encontré el periodo del estado.");

  const due = valueNearLabel(lines, /Fecha l[íi]mite de pago:?/i, DATE_VALUE);
  const dueDate = due ? parseSpanishDate(due[1]) : null;
  if (!dueDate) throw new StatementParseError("No encontré la fecha límite de pago.");

  const payToAvoidInterest = moneyAfter(/Pago para no generar intereses:/);
  const minimumPayment = moneyAfter(/Pago m[íi]nimo:/);
  if (payToAvoidInterest === null || minimumPayment === null) {
    throw new StatementParseError("No encontré el pago para no generar intereses o el pago mínimo.");
  }

  const minimumPlusInstallments = moneyAfter(/Pago m[íi]nimo \+ compras[^:$]*:/);
  const totalBalance = moneyAfter(/Saldo deudor total:/);
  const regularBalance = moneyAfter(/Saldo cargos regulares:/);
  const installmentBalance = moneyAfter(/Saldo cargos a meses:/);
  const creditLimit = moneyAfter(/L[íi]mite de cr[ée]dito:/);
  const availableCredit = moneyAfter(/Cr[ée]dito disponible:/);

  const installments: StatementInstallment[] = [];
  const movements: StatementLine[] = [];
  let section: Section = "none";
  let holder: "titular" | "digital" | null = null;
  let printedCharges: number | null = null;
  let printedPayments: number | null = null;
  let inDetail = false;

  const installmentRow = new RegExp(
    `^${DATE}\\s+(.+?)\\s+${MONEY}\\s+${MONEY}\\s+${MONEY}\\s+(\\d+) de (\\d+)\\s+(NA|[\\d.]+%)$`
  );
  const installmentInterestRow = new RegExp(
    `^${DATE}\\s+(.+?)\\s+${MONEY}\\s+${MONEY}\\s+${MONEY}\\s+${MONEY}\\s+${MONEY}\\s+(\\d+) de (\\d+)\\s+([\\d.]+%)$`
  );
  const regularRow = new RegExp(`^${DATE}\\s+${DATE}\\s+(.+?)\\s+([+-])\\s+${MONEY}$`);

  for (const line of lines) {
    if (/^DESGLOSE DE MOVIMIENTOS/.test(line)) {
      inDetail = true;
      continue;
    }
    if (!inDetail) continue;

    const totals = new RegExp(`^Total cargos \\+\\s*${MONEY}`).exec(line);
    if (totals) {
      printedCharges = money(totals[1]);
      section = "none";
      continue;
    }
    const abonos = new RegExp(`^Total abonos -\\s*${MONEY}`).exec(line);
    if (abonos) {
      printedPayments = money(abonos[1]);
      continue;
    }

    if (/^COMPRAS Y CARGOS DIFERIDOS A MESES SIN INTERESES$/.test(line)) {
      section = "installments";
      continue;
    }
    if (/^COMPRAS Y CARGOS DIFERIDOS A MESES CON INTERESES$/.test(line)) {
      section = "installmentsInterest";
      continue;
    }
    if (/^CARGOS, ABONOS Y COMPRAS REGULARES/.test(line)) {
      section = "regular";
      continue;
    }
    if (/^Tarjeta titular:/i.test(line)) {
      holder = "titular";
      continue;
    }
    if (/^Tarjeta digital:/i.test(line)) {
      holder = "digital";
      continue;
    }

    if (section === "installments") {
      const m = installmentRow.exec(line);
      const date = m ? parseSpanishDate(m[1]) : null;
      if (m && date) {
        installments.push({
          date,
          merchant: cleanMerchant(m[2]),
          originalAmount: money(m[3]),
          pendingBalance: money(m[4]),
          requiredPayment: money(m[5]),
          paymentNumber: Number(m[6]),
          totalPayments: Number(m[7]),
          withInterest: false,
          interestRate: null,
        });
      }
    } else if (section === "installmentsInterest") {
      const m = installmentInterestRow.exec(line);
      const date = m ? parseSpanishDate(m[1]) : null;
      if (m && date) {
        installments.push({
          date,
          merchant: cleanMerchant(m[2]),
          originalAmount: money(m[3]),
          pendingBalance: money(m[4]),
          requiredPayment: money(m[7]),
          paymentNumber: Number(m[8]),
          totalPayments: Number(m[9]),
          withInterest: true,
          interestRate: Number(m[10].replace("%", "")),
        });
      }
    } else if (section === "regular") {
      const m = regularRow.exec(line);
      const date = m ? parseSpanishDate(m[1]) : null;
      if (!m || !date) continue;

      const description = m[3];
      const amount = money(m[5]);
      const plan = /\s(\d{1,3}) de (\d{1,3})$/i.exec(description);

      let kind: StatementLine["kind"] = "charge";
      if (m[4] === "-") kind = "payment";
      else if (plan) kind = "installment-payment";
      else if (/^(INTERES|IVA POR INTERESES|COMISION|COM\.)/i.test(description)) kind = "interest";

      movements.push({
        date,
        postedDate: parseSpanishDate(m[2]),
        rawDescription: description,
        merchant: cleanMerchant(description),
        amount,
        kind,
        installmentNumber: plan ? Number(plan[1]) : null,
        installmentTotal: plan ? Number(plan[2]) : null,
        holder,
      });
    }
  }

  if (movements.length === 0 && installments.length === 0) {
    throw new StatementParseError("Encontré el resumen pero ningún movimiento. Puede que el PDF sea una imagen escaneada.");
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  const readCharges = round(movements.filter((l) => l.kind !== "payment").reduce((s, l) => s + l.amount, 0));
  const readPayments = round(movements.filter((l) => l.kind === "payment").reduce((s, l) => s + l.amount, 0));
  const reconciles =
    printedCharges !== null &&
    printedPayments !== null &&
    Math.abs(readCharges - printedCharges) < 0.01 &&
    Math.abs(readPayments - printedPayments) < 0.01;

  return {
    bank: "banamex",
    last4,
    periodStart,
    periodEnd,
    dueDate,
    payToAvoidInterest,
    minimumPayment,
    minimumPlusInstallments,
    totalBalance,
    regularBalance,
    installmentBalance,
    creditLimit,
    availableCredit,
    annualRate: annualRateAfterLabel(lines),
    installments,
    lines: movements,
    printedCharges,
    printedPayments,
    readCharges,
    readPayments,
    reconciles,
  };
}

// Primer pago de un plan a meses, de modo que a la fecha de corte lleve pagadas "paymentNumber" mensualidades.
export function firstPaymentFromStatement(cutoffDate: string, paymentNumber: number): string {
  const [y, m, d] = cutoffDate.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 - (paymentNumber - 1), 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

