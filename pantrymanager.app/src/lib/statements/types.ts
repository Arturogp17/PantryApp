// Resultado de leer un estado de cuenta. Todo se calcula en el navegador: el PDF no sale del teléfono.
export type StatementBank = "banamex" | "bbva";

// charge: compra o cargo normal. payment: abono a la tarjeta. interest: intereses, comisiones e IVA.
// installment-payment: mensualidad de un plan a meses (ya está en el plan, no es un gasto nuevo).
export type StatementLineKind = "charge" | "payment" | "interest" | "installment-payment";

export interface StatementLine {
  // Fecha de la operación, "2026-11-07".
  date: string;
  // Fecha en que se cargó a la tarjeta, si el estado la trae.
  postedDate: string | null;
  // Texto tal como viene en el estado.
  rawDescription: string;
  // Comercio sin claves de RFC ni números de plan.
  merchant: string;
  amount: number;
  kind: StatementLineKind;
  // Solo en mensualidades: "1 de 3".
  installmentNumber: number | null;
  installmentTotal: number | null;
  // "titular" o "digital" (tarjeta digital o Apple Pay). Null si el estado no distingue.
  holder: "titular" | "digital" | null;
}

export interface StatementInstallment {
  // Fecha del cargo de la mensualidad en este estado.
  date: string;
  merchant: string;
  originalAmount: number;
  pendingBalance: number;
  requiredPayment: number;
  paymentNumber: number;
  totalPayments: number;
  // Plan con intereses (por ejemplo un plan personal). La app solo maneja meses sin intereses.
  withInterest: boolean;
  interestRate: number | null;
}

export interface ParsedStatement {
  bank: StatementBank;
  // Solo los últimos 4 dígitos; el número completo no se conserva.
  last4: string;
  periodStart: string;
  // La fecha de corte es el último día del periodo.
  periodEnd: string;
  dueDate: string;
  payToAvoidInterest: number;
  minimumPayment: number;
  minimumPlusInstallments: number | null;
  totalBalance: number | null;
  regularBalance: number | null;
  installmentBalance: number | null;
  creditLimit: number | null;
  availableCredit: number | null;
  // Tasa de interés ordinaria anual, en porcentaje (50.82). Null si el estado no la trae.
  annualRate: number | null;
  installments: StatementInstallment[];
  lines: StatementLine[];
  // Totales impresos en el estado, para comprobar que se leyó todo.
  printedCharges: number | null;
  printedPayments: number | null;
  readCharges: number;
  readPayments: number;
  // true si lo leído suma lo mismo que los totales del estado.
  reconciles: boolean;
}

export class StatementParseError extends Error {}
