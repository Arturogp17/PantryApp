import type { Card, Expense } from "../../types";
import { firstPaymentFromStatement } from "./banamex";
import type { ParsedStatement, StatementLine } from "./types";

// Lo que se propone importar de un estado. La pantalla de revisión deja quitar renglones y elegir categoría.
export interface ExpenseDraft {
  importKey: string;
  date: string;
  amount: number;
  merchant: string;
  note: string | null;
  // true si es el renglón único que junta intereses, comisiones e IVA.
  isInterest: boolean;
  line: StatementLine | null;
}

export interface InstallmentDraft {
  importKey: string;
  name: string;
  totalAmount: number;
  months: number;
  firstPaymentDate: string;
  paidCount: number;
  pendingBalance: number;
  monthlyAmount: number;
  // Mensualidad fija con intereses; null en meses sin intereses.
  monthlyPayment: number | null;
  // Tasa anual en porcentaje; null en meses sin intereses.
  interestRate: number | null;
}

export interface ImportDraft {
  expenses: ExpenseDraft[];
  installments: InstallmentDraft[];
  // Planes que no se importan, con el motivo, para mostrarlos en la revisión.
  skippedInstallments: { name: string; reason: string }[];
  // Mensualidades y abonos que no se importan como gasto.
  skippedLineCount: number;
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function buildImportDraft(statement: ParsedStatement): ImportDraft {
  const prefix = `${statement.bank}:${statement.last4}:${statement.periodEnd}`;

  const expenses: ExpenseDraft[] = [];
  let index = 0;
  for (const line of statement.lines) {
    if (line.kind !== "charge") continue;
    expenses.push({
      importKey: `${prefix}:${index}`,
      date: line.date,
      amount: line.amount,
      merchant: line.merchant,
      note: null,
      isInterest: false,
      line,
    });
    index += 1;
  }

  // Intereses, comisiones e IVA se juntan en un solo gasto con fecha de corte.
  const interestTotal = round2(statement.lines.filter((l) => l.kind === "interest").reduce((s, l) => s + l.amount, 0));
  if (interestTotal > 0) {
    expenses.push({
      importKey: `${prefix}:interest`,
      date: statement.periodEnd,
      amount: interestTotal,
      merchant: "Intereses y comisiones",
      note: `Estado con corte ${statement.periodEnd}`,
      isInterest: true,
      line: null,
    });
  }

  const installments: InstallmentDraft[] = [];
  const skippedInstallments: { name: string; reason: string }[] = [];
  for (const p of statement.installments) {
    if (p.totalPayments < 2) {
      skippedInstallments.push({ name: p.merchant, reason: "Tiene menos de dos mensualidades" });
      continue;
    }
    if (p.pendingBalance <= 0 && p.paymentNumber < p.totalPayments) {
      skippedInstallments.push({ name: p.merchant, reason: "El saldo ya está en cero antes de la última mensualidad" });
      continue;
    }
    installments.push({
      // Sin el número de pago, para que el mismo plan en el estado del mes siguiente no se duplique.
      importKey: `${statement.bank}:${statement.last4}:plan:${slug(p.merchant)}:${p.originalAmount}:${p.totalPayments}`,
      name: p.merchant,
      totalAmount: p.originalAmount,
      months: p.totalPayments,
      firstPaymentDate: firstPaymentFromStatement(statement.periodEnd, p.paymentNumber),
      paidCount: p.paymentNumber,
      pendingBalance: p.pendingBalance,
      monthlyAmount: p.requiredPayment,
      monthlyPayment: p.withInterest ? p.requiredPayment : null,
      interestRate: p.withInterest ? p.interestRate : null,
    });
  }

  return {
    expenses,
    installments,
    skippedInstallments,
    skippedLineCount: statement.lines.filter((l) => l.kind === "payment" || l.kind === "installment-payment").length,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const dayDiff = (a: string, b: string): number => Math.abs((Date.parse(a) - Date.parse(b)) / DAY_MS);

// Para cada borrador, busca un gasto ya capturado con el mismo monto, fecha cercana (hasta 3 días) y la misma
// tarjeta (o sin tarjeta asignada). Cada gasto existente se usa una sola vez: dos cargos iguales el mismo
// día solo marcan como capturado a uno si solo hay un gasto existente.
export function matchExistingExpenses(drafts: ExpenseDraft[], existing: Expense[], card: Card): Map<string, Expense> {
  const used = new Set<number>();
  const matches = new Map<string, Expense>();

  for (const draft of drafts) {
    const found = existing.find(
      (e) =>
        !used.has(e.id) &&
        Math.abs(e.amount - draft.amount) < 0.005 &&
        dayDiff(e.date, draft.date) <= 3 &&
        (e.cardId === card.id)
    );
    if (found) {
      used.add(found.id);
      matches.set(draft.importKey, found);
    }
  }

  return matches;
}
