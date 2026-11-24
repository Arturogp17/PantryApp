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

const normalizeLine = (line: string): string => line.replace(/\s+/g, " ").trim();

// Tasa anual del estado: la etiqueta "TASA DE INTERES ANUAL" va en una línea y el valor en las siguientes,
// en una línea con "Sin IVA" que termina con la tasa (por ejemplo "71.5% Sin IVA 55.52%"). Se toma el último porcentaje.
export function annualRateAfterLabel(lines: string[]): number | null {
  const label = /TASA DE INTER[ÉE]S ANUAL/i;
  for (let i = 0; i < lines.length; i++) {
    if (!label.test(lines[i])) continue;
    for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
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

  const first = (re: RegExp): string | null => {
    for (const line of lines) {
      const m = re.exec(line);
      if (m) return m[1];
    }
    return null;
  };

  const moneyAfter = (label: RegExp): number | null => {
    const v = first(new RegExp(`${label.source}\\s*\\d{0,2}\\s*${MONEY}`));
    return v === null ? null : money(v);
  };

  // Solo se guardan los últimos 4 dígitos del número de tarjeta.
  const cardNumber = first(/N[úu]mero de tarjeta\s+((?:\d[\d ]{14,22}\d))/i);
  const last4 = cardNumber ? cardNumber.replace(/\D/g, "").slice(-4) : null;
  if (!last4) throw new StatementParseError("No encontré el número de tarjeta en el estado.");

  const period = /Periodo:\s*(\d{1,2}-[a-zA-Z]{3}-\d{4})\s+al\s+(\d{1,2}-[a-zA-Z]{3}-\d{4})/i.exec(text);
  const periodStart = period ? parseSpanishDate(period[1]) : null;
  const periodEnd = period ? parseSpanishDate(period[2]) : null;
  if (!periodStart || !periodEnd) throw new StatementParseError("No encontré el periodo del estado.");

  const dueRaw = first(new RegExp(`Fecha l[íi]mite de pago:?\\s*\\d?\\s*(?:[a-zA-Záéíóú]+,\\s*)?${DATE}`, "i"));
  const dueDate = dueRaw ? parseSpanishDate(dueRaw) : null;
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

