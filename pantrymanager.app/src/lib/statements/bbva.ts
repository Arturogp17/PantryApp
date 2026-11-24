import {
  DATE_VALUE,
  MASKED_TITULAR,
  MONEY_VALUE,
  PERIOD_VALUE,
  annualRateAfterLabel,
  cleanMerchant,
  findCardLast4,
  parseSpanishDate,
  valueNearLabel,
} from "./banamex";
import type { ParsedStatement, StatementInstallment, StatementLine } from "./types";
import { StatementParseError } from "./types";

const DATE = "(\\d{1,2}-[a-zA-Z]{3}-\\d{4})";
const MONEY = "\\$\\s*([\\d,]+\\.\\d{2})";

const money = (text: string): number => Number(text.replace(/,/g, ""));
const normalizeLine = (line: string): string => line.normalize("NFC").replace(/\s+/g, " ").trim();

type Section = "none" | "installments" | "regular";

export function isBbvaStatement(rawLines: string[]): boolean {
  const text = rawLines.join("\n");
  return /BBVA/i.test(text) && /Pago para no generar intereses/i.test(text) && /DESGLOSE DE MOVIMIENTOS/i.test(text);
}

// BBVA repite en los cargos regulares la compra original de un plan a meses ("AMAZON A MESES A 06 MESES S/I")
// y después cada mensualidad ("02 DE 03 AMAZON A MESES"). Ninguna de las dos es un gasto nuevo.
const PLAN_PURCHASE = /\bA MESES A \d{1,2} MESES\b/i;
const PLAN_PAYMENT = /^(\d{1,3}) DE (\d{1,3})\s+(.+)$/i;

export function parseBbvaStatement(rawLines: string[]): ParsedStatement {
  const lines = rawLines.map(normalizeLine).filter((l) => l.length > 0);

  if (!isBbvaStatement(lines)) {
    throw new StatementParseError("Este PDF no parece un estado de cuenta de BBVA.");
  }

  // El monto va después de la etiqueta, o en una línea vecina si pdf.js lo separó (ver valueNearLabel).
  const moneyAfter = (label: RegExp): number | null => {
    const m = valueNearLabel(lines, label, MONEY_VALUE);
    return m === null ? null : money(m[1]);
  };

  // Solo se guardan los últimos 4 dígitos del número de tarjeta. Si no aparece, se usa la tarjeta o cuenta enmascarada.
  const last4 = findCardLast4(lines, [MASKED_TITULAR, /NUMERO DE CUENTA:?\s*[X*\s]*(\d{4})\b/]);
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
  const installmentBalance = moneyAfter(/Saldo cargos? a meses:/);
  const creditLimit = moneyAfter(/L[íi]mite de cr[ée]dito:/);
  const availableCredit = moneyAfter(/Cr[ée]dito disponible:/);

  const installments: StatementInstallment[] = [];
  const movements: StatementLine[] = [];
  let section: Section = "none";
  let printedCharges: number | null = null;
  let printedPayments: number | null = null;
  let inDetail = false;

  // 31-ago-2026 AMAZON A MESES ; Tarjeta Digital ***1020 $1,738.43 $578.43 $580.00 2 de 3 0.00%
  const installmentRow = new RegExp(
    `^${DATE}\\s+(.+?)\\s+${MONEY}\\s+${MONEY}\\s+${MONEY}\\s+(\\d+) de (\\d+)\\s+([\\d.]+%|NA)$`
  );
  // 06-oct-2026 07-oct-2026 TOTAL PLAY CR + $549.00
  const regularRow = new RegExp(`^${DATE}\\s+${DATE}\\s+(.+?)\\s+([+-])\\s*${MONEY}$`);

  for (const line of lines) {
    if (/^DESGLOSE DE MOVIMIENTOS/.test(line)) {
      inDetail = true;
      continue;
    }
    if (!inDetail) continue;

    const totals = new RegExp(`Total cargos\\s*\\+?\\s*${MONEY}`).exec(line);
    if (totals) {
      printedCharges = money(totals[1]);
      const abonosSame = new RegExp(`Total abonos\\s*-\\s*${MONEY}`).exec(line);
      if (abonosSame) printedPayments = money(abonosSame[1]);
      section = "none";
      continue;
    }
    const abonos = new RegExp(`^Total abonos\\s*-\\s*${MONEY}`).exec(line);
    if (abonos) {
      printedPayments = money(abonos[1]);
      continue;
    }

    if (/^COMPRAS Y CARGOS DIFERIDOS A MESES SIN INTERESES/.test(line)) {
      section = "installments";
      continue;
    }
    if (/^CARGOS,\s*COMPRAS Y ABONOS REGULARES/.test(line)) {
      section = "regular";
      continue;
    }

    if (section === "installments") {
      const m = installmentRow.exec(line);
      const date = m ? parseSpanishDate(m[1]) : null;
      if (m && date) {
        installments.push({
          date,
          merchant: cleanBbvaMerchant(m[2]),
          originalAmount: money(m[3]),
          pendingBalance: money(m[4]),
          requiredPayment: money(m[5]),
          paymentNumber: Number(m[6]),
          totalPayments: Number(m[7]),
          withInterest: false,
          interestRate: null,
        });
      }
    } else if (section === "regular") {
      const m = regularRow.exec(line);
      const date = m ? parseSpanishDate(m[1]) : null;
      if (!m || !date) continue;

      const description = m[3];
      const amount = money(m[5]);
      const planPayment = PLAN_PAYMENT.exec(description);

      let kind: StatementLine["kind"] = "charge";
      if (m[4] === "-") kind = "payment";
      else if (planPayment || PLAN_PURCHASE.test(description)) kind = "installment-payment";
      else if (/^(INTERES|IVA|COMISION|COM\.)/i.test(description)) kind = "interest";

      movements.push({
        date,
        postedDate: parseSpanishDate(m[2]),
        rawDescription: description,
        merchant: cleanBbvaMerchant(planPayment ? planPayment[3] : description),
        amount,
        kind,
        installmentNumber: planPayment ? Number(planPayment[1]) : null,
        installmentTotal: planPayment ? Number(planPayment[2]) : null,
        holder: /Tarjeta Digital/i.test(description) ? "digital" : "titular",
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
    bank: "bbva",
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

// Quita "; Tarjeta Digital ***1020", la leyenda "A 06 MESES S/I" y la clave de pasarela ("MERPAGO*", "STRIPE *").
export function cleanBbvaMerchant(raw: string): string {
  let text = raw.replace(/\s*;\s*Tarjeta Digital\s*\*+\d+/i, "");
  text = text.replace(/\s+A \d{1,2} MESES S\/I$/i, "");
  text = text.replace(/^(?:MERPAGO|MERCADO PAGO|STRIPE|TCONE|BMOVIL)\s*\*\s*/i, "");
  return cleanMerchant(text);
}
