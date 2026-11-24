import type { Card, IncomeSource, InstallmentPlan, RecurringCharge, StatementSummary } from "../types";
import { shiftDays } from "./expenses";
import { roundMoney as r } from "./money";

// Cobro de un ingreso en una fecha concreta.
export interface Inflow {
  date: string;
  amount: number;
  sourceName: string;
}

const pad = (n: number): string => String(n).padStart(2, "0");

// Último día del mes (m de 1 a 12). Date.UTC con día 0 cae en el último día del mes anterior al siguiente.
const lastDay = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

// Día del mes dentro de su largo: 31 en febrero cae el 28 (o 29).
const dateIn = (y: number, m: number, day: number): string =>
  `${y}-${pad(m)}-${pad(Math.min(day, lastDay(y, m)))}`;

// Fechas de cobro de cada fuente activa entre from y to, ambas incluidas ("YYYY-MM-DD"), ordenadas por fecha.
export function expandIncomes(sources: IncomeSource[], from: string, to: string): Inflow[] {
  const out: Inflow[] = [];
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);

  const push = (date: string, s: IncomeSource): void => {
    if (date >= from && date <= to) out.push({ date, amount: s.amount, sourceName: s.name });
  };

  for (const s of sources) {
    if (!s.isActive) continue;
    if (s.kind === "once") {
      if (s.date) push(s.date, s);
      continue;
    }

    let y = fy;
    let m = fm;
    while (y < ty || (y === ty && m <= tm)) {
      if (s.kind === "monthly") {
        if (s.day1 !== null) push(dateIn(y, m, s.day1), s);
      } else {
        if (s.day1 !== null) push(dateIn(y, m, s.day1), s);
        if (s.day2 !== null) push(dateIn(y, m, s.day2), s);
      }
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
  }

  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface PlanCardInput {
  cardId: number;
  name: string;
  dueDate: string;
  payToAvoidInterest: number;
  minimumPayment: number;
  minimumPlusInstallments: number | null;
  annualRate: number | null;
  // Lo ya pagado a la tarjeta desde su último corte; descuenta del mínimo y de lo necesario para no pagar intereses.
  paidSinceCutoff?: number;
}

// full: paga lo que evita intereses. partial: más que el mínimo pero no todo. minimum: solo el mínimo. short: no llega al mínimo.
export type PlanLevel = "full" | "partial" | "minimum" | "short";

export interface PlanLine {
  cardId: number;
  name: string;
  dueDate: string;
  amount: number;
  mustPay: number;
  fullNoInterest: number;
  shortToFull: number;
  alreadyPaid: number;
  level: PlanLevel;
  overdue: boolean;
  estimatedInterest: number | null;
  annualRate: number | null;
}

export interface PaymentPlan {
  lines: PlanLine[];
  funds: number;
  inflowsCounted: number;
  totalAllocated: number;
  leftover: number;
  shortMinimums: number;
  estimatedInterestTotal: number;
  warnings: string[];
}

// Tarjeta con los montos ya calculados y su fecha efectiva (las vencidas cuentan desde hoy).
interface Considered extends PlanCardInput {
  mustPay: number;
  msiPart: number;
  fullNoInterest: number;
  paid: number;
  deadline: string;
  overdue: boolean;
}

// Plan de pagos de tarjetas con el dinero disponible y los cobros que vienen.
export function buildPaymentPlan(input: {
  today: string;
  funds: number;
  inflows: Inflow[];
  cards: PlanCardInput[];
  horizonDays?: number;
}): PaymentPlan {
  const { today, inflows, horizonDays = 45 } = input;
  const funds = r(input.funds);
  const horizonEnd = shiftDays(today, horizonDays);
  const warnings: string[] = [];

  const cards: Considered[] = input.cards
    .filter((c) => c.dueDate <= horizonEnd)
    .map((c) => {
      const minimum = r(c.minimumPayment);
      const fullMust = r(c.minimumPlusInstallments ?? c.minimumPayment);
      const msiPart = r(Math.max(0, fullMust - minimum));
      const paid = r(Math.max(0, c.paidSinceCutoff ?? 0));
      return {
        ...c,
        paid,
        mustPay: r(Math.max(0, r(fullMust - paid))),
        msiPart,
        fullNoInterest: r(Math.max(0, r(r(c.payToAvoidInterest) + msiPart - paid))),
        deadline: c.dueDate < today ? today : c.dueDate,
        overdue: c.dueDate < today,
      };
    })
    .sort((a, b) => (a.dueDate !== b.dueDate ? (a.dueDate < b.dueDate ? -1 : 1) : a.cardId - b.cardId));

  const windowEnd = cards.reduce((max, c) => (c.deadline > max ? c.deadline : max), today);
  const counted = inflows.filter((f) => f.date >= today && f.date <= windowEnd);
  const inflowsCounted = r(counted.reduce((s, f) => s + f.amount, 0));

  // Dinero disponible hasta la fecha d: lo de hoy más los cobros entre hoy y d.
  const availableAt = (d: string): number =>
    r(funds + inflows.filter((f) => f.date >= today && f.date <= d).reduce((s, f) => s + f.amount, 0));

  const deadlines = cards.map((c) => c.deadline);

  const alloc: number[] = cards.map(() => 0);

  // Lo asignado a tarjetas con fecha efectiva <= d.
  const assignedUpTo = (d: string): number =>
    r(cards.reduce((s, c, i) => (c.deadline <= d ? s + alloc[i] : s), 0));

  // Cuánto más se puede asignar a la tarjeta i sin romper ninguna fecha de vencimiento igual o posterior a la suya.
  const margin = (i: number): number => {
    let m = Infinity;
    for (const d of deadlines) {
      if (d >= cards[i].deadline) m = Math.min(m, r(availableAt(d) - assignedUpTo(d)));
    }
    return Math.max(0, r(m));
  };

  // Fase 1: mínimos, en orden de fecha.
  cards.forEach((c, i) => {
    alloc[i] = r(Math.min(c.mustPay, margin(i)));
  });

  // Fase 2: lo que falta para no pagar intereses, primero a la tasa más alta y luego a la fecha más cercana.
  const order = cards
    .map((_, i) => i)
    .filter((i) => r(cards[i].fullNoInterest - alloc[i]) > 0)
    .sort((a, b) => {
      const ra = cards[a].annualRate;
      const rb = cards[b].annualRate;
      if (ra !== rb) {
        if (ra === null) return 1;
        if (rb === null) return -1;
        return rb - ra;
      }
      return cards[a].dueDate < cards[b].dueDate ? -1 : cards[a].dueDate > cards[b].dueDate ? 1 : a - b;
    });

  for (const i of order) {
    const need = r(cards[i].fullNoInterest - alloc[i]);
    alloc[i] = r(alloc[i] + Math.min(need, margin(i)));
  }

  const lines: PlanLine[] = cards.map((c, i) => {
    const amount = alloc[i];
    // Con el mínimo ya cubierto (mustPay 0) no se llama "minimum" a un pago de 0.
    const level: PlanLevel =
      amount >= c.fullNoInterest
        ? "full"
        : amount < c.mustPay
          ? "short"
          : amount === c.mustPay && c.mustPay > 0
            ? "minimum"
            : "partial";
    const estimatedInterest =
      c.annualRate === null
        ? null
        : r((Math.max(0, r(c.payToAvoidInterest) - Math.max(0, r(amount + c.paid - c.msiPart))) * c.annualRate) / 100 / 12);
    return {
      cardId: c.cardId,
      name: c.name,
      dueDate: c.dueDate,
      amount,
      mustPay: c.mustPay,
      fullNoInterest: c.fullNoInterest,
      shortToFull: r(Math.max(0, c.fullNoInterest - amount)),
      alreadyPaid: c.paid,
      level,
      overdue: c.overdue,
      estimatedInterest,
      annualRate: c.annualRate,
    };
  });

  for (const l of lines) {
    if (l.level === "short") {
      warnings.push(`No alcanza para el pago mínimo de ${l.name}: faltan $${r(l.mustPay - l.amount).toFixed(2)}`);
    }
  }
  for (const l of lines) {
    if (l.overdue) warnings.push(`Hay una tarjeta vencida: ${l.name}`);
  }
  for (const l of lines) {
    if (l.level === "minimum" && l.shortToFull > 0) {
      warnings.push(`Pagar solo el mínimo no evita intereses en ${l.name}`);
    }
  }

  const totalAllocated = r(lines.reduce((s, l) => s + l.amount, 0));
  const shortMinimums = r(lines.reduce((s, l) => s + Math.max(0, r(l.mustPay - l.amount)), 0));
  const estimatedInterestTotal = r(lines.reduce((s, l) => s + (l.estimatedInterest ?? 0), 0));

  return {
    lines,
    funds,
    inflowsCounted,
    totalAllocated,
    leftover: Math.max(0, r(funds + inflowsCounted - totalAllocated)),
    shortMinimums,
    estimatedInterestTotal,
    warnings,
  };
}

// Primer cobro a partir de hoy (incluido), o null si no hay.
export function nextInflow(inflows: Inflow[], today: string): Inflow | null {
  let best: Inflow | null = null;
  for (const f of inflows) {
    if (f.date >= today && (best === null || f.date < best.date)) best = f;
  }
  return best;
}

// ---- Flujo de dinero ----

export type CashKind = "income" | "card" | "recurring";

// Movimiento con monto positivo. affectsBalance false quiere decir que no sale del efectivo (p. ej. un cargo a tarjeta).
export interface CashEvent {
  date: string;
  amount: number;
  label: string;
  kind: CashKind;
  affectsBalance: boolean;
}

export interface CashRow extends CashEvent {
  balance: number;
}

export interface Cashflow {
  rows: CashRow[];
  lowestBalance: number;
  lowestDate: string | null;
  firstNegativeDate: string | null;
}

// Saldo día a día desde hoy. Los ingresos del mismo día van antes que los cargos.
export function buildCashflow(input: { today: string; funds: number; inflows: Inflow[]; outflows: CashEvent[] }): Cashflow {
  const { today } = input;
  const incomes: CashEvent[] = input.inflows.map((f) => ({
    date: f.date,
    amount: r(f.amount),
    label: f.sourceName,
    kind: "income",
    affectsBalance: true,
  }));
  const events = [...incomes, ...input.outflows.map((e) => ({ ...e, amount: r(e.amount) }))]
    .filter((e) => e.date >= today)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.kind === "income" ? 0 : 1) - (b.kind === "income" ? 0 : 1);
    });

  let balance = r(input.funds);
  let lowestBalance: number | null = null;
  let lowestDate: string | null = null;
  let firstNegativeDate: string | null = null;
  const rows: CashRow[] = [];

  for (const e of events) {
    if (e.affectsBalance) {
      balance = r(e.kind === "income" ? balance + e.amount : balance - e.amount);
      if (lowestBalance === null || balance < lowestBalance) {
        lowestBalance = balance;
        lowestDate = e.date;
      }
    }
    if (firstNegativeDate === null && balance < 0) firstNegativeDate = e.date;
    rows.push({ ...e, balance });
  }

  return {
    rows,
    lowestBalance: lowestBalance ?? r(input.funds),
    lowestDate,
    firstNegativeDate,
  };
}

// Cargos de cada recurrente activo entre from y to, ambas incluidas. Un cargo con tarjeta no toca el efectivo.
export function expandRecurring(charges: RecurringCharge[], cards: Card[], from: string, to: string): CashEvent[] {
  const out: CashEvent[] = [];
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);

  for (const c of charges) {
    if (!c.isActive) continue;
    if (c.frequency === "yearly" && c.monthOfYear === null) continue;

    const cardName =
      c.cardId === null ? null : (cards.find((k) => k.id === c.cardId)?.name ?? c.cardName ?? "tarjeta");

    let y = fy;
    let m = fm;
    while (y < ty || (y === ty && m <= tm)) {
      const isChargeMonth = c.frequency === "monthly" || m === c.monthOfYear;
      if (isChargeMonth) {
        const date = dateIn(y, m, c.dayOfMonth);
        if (date >= from && date <= to) {
          out.push({
            date,
            amount: r(c.amount),
            label: cardName === null ? c.name : `${c.name} (se carga a ${cardName})`,
            kind: "recurring",
            affectsBalance: cardName === null,
          });
        }
      }
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
  }

  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ---- Salud financiera ----

// Ingreso mensual de las fuentes activas: quincenal cuenta dos veces, mensual una, pago único nada.
export function monthlyIncome(sources: IncomeSource[]): number {
  return r(
    sources.reduce((sum, s) => {
      if (!s.isActive) return sum;
      if (s.kind === "semimonthly") return sum + 2 * s.amount;
      if (s.kind === "monthly") return sum + s.amount;
      return sum;
    }, 0)
  );
}

// Deuda mensual entre ingreso mensual. Puede pasar de 1. Null si no hay ingreso.
export function debtToIncome(monthlyDebt: number, income: number): number | null {
  return income > 0 ? monthlyDebt / income : null;
}

export interface Release {
  name: string;
  cardId: number;
  lastPaymentDate: string;
  monthly: number;
  remainingPayments: number;
}

// Fecha del pago n (0 es el primero) con el mismo día del mes que el primero, ajustado al largo de cada mes.
const paymentDate = (first: string, n: number): string => {
  const [y, m, d] = first.split("-").map(Number);
  const total = m - 1 + n;
  return dateIn(y + Math.floor(total / 12), (total % 12) + 1, d);
};

// Planes que todavía tienen pagos desde hoy, ordenados por el último pago.
export function installmentReleases(plans: InstallmentPlan[], today: string): Release[] {
  const out: Release[] = [];
  for (const p of plans) {
    if (p.months < 1) continue;
    const lastPaymentDate = paymentDate(p.firstPaymentDate, p.months - 1);
    if (lastPaymentDate < today) continue;

    let remainingPayments = 0;
    for (let n = 0; n < p.months; n++) {
      if (paymentDate(p.firstPaymentDate, n) >= today) remainingPayments++;
    }
    out.push({
      name: p.name,
      cardId: p.cardId,
      lastPaymentDate,
      monthly: r(p.totalAmount / p.months),
      remainingPayments,
    });
  }
  return out.sort((a, b) =>
    a.lastPaymentDate !== b.lastPaymentDate
      ? a.lastPaymentDate < b.lastPaymentDate ? -1 : 1
      : a.name.localeCompare(b.name)
  );
}

// ---- Presupuesto y tendencia ----

export type BudgetLevel = "ok" | "warn" | "over";

// Proporción gastada del presupuesto. Desde 0.8 avisa, arriba de 1 se pasó. Sin presupuesto, cualquier gasto es exceso.
export function budgetStatus(spent: number, budget: number): { ratio: number; level: BudgetLevel } {
  const ratio = budget > 0 ? spent / budget : spent > 0 ? Infinity : 0;
  const level: BudgetLevel = ratio > 1 ? "over" : ratio >= 0.8 ? "warn" : "ok";
  return { ratio, level };
}

// Saldo total de los dos periodEnd más recientes con dato. Si una fecha tiene varias tarjetas, se suman sus saldos.
export function balanceTrend(history: StatementSummary[]): { latest: number; previous: number; change: number } | null {
  const byEnd = new Map<string, number>();
  for (const s of history) {
    if (s.totalBalance === null) continue;
    byEnd.set(s.periodEnd, r((byEnd.get(s.periodEnd) ?? 0) + s.totalBalance));
  }
  if (byEnd.size < 2) return null;

  const keys = [...byEnd.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const latest = byEnd.get(keys[0]) ?? 0;
  const previous = byEnd.get(keys[1]) ?? 0;
  return { latest, previous, change: r(latest - previous) };
}
