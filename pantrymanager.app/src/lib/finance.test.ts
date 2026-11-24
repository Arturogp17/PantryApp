import { describe, expect, test } from "vitest";
import {
  balanceTrend,
  budgetStatus,
  buildCashflow,
  buildPaymentPlan,
  debtToIncome,
  expandIncomes,
  expandRecurring,
  installmentReleases,
  monthlyIncome,
  nextInflow,
  type CashEvent,
  type Inflow,
  type PlanCardInput,
} from "./finance";
import type { Card, IncomeSource, InstallmentPlan, RecurringCharge, StatementSummary } from "../types";

const TODAY = "2026-11-24";

const income = (over: Partial<IncomeSource>): IncomeSource => ({
  id: 1,
  name: "Quincena",
  amount: 1000,
  kind: "semimonthly",
  day1: 15,
  day2: 31,
  date: null,
  cardId: null,
  isActive: true,
  ...over,
});

// Tarjeta A vence antes que B. Mínimo 200 y pago para no generar intereses 1000 en A; mínimo 150 y 500 en B.
const azul: PlanCardInput = {
  cardId: 1,
  name: "Azul",
  dueDate: "2026-12-01",
  payToAvoidInterest: 1000,
  minimumPayment: 200,
  minimumPlusInstallments: null,
  annualRate: 50,
};

const oro: PlanCardInput = {
  cardId: 2,
  name: "Oro",
  dueDate: "2026-12-10",
  payToAvoidInterest: 500,
  minimumPayment: 150,
  minimumPlusInstallments: null,
  annualRate: 30,
};

describe("expansión de ingresos", () => {
  test("quincenal con día 31 cae el último día de cada mes, febrero incluido", () => {
    const flows = expandIncomes([income({})], "2026-02-01", "2026-03-31");
    expect(flows.map((f) => f.date)).toEqual(["2026-02-15", "2026-02-28", "2026-03-15", "2026-03-31"]);
    expect(flows[0]).toEqual({ date: "2026-02-15", amount: 1000, sourceName: "Quincena" });
  });

  test("mensual: día mayor al largo del mes cae en el último día", () => {
    const flows = expandIncomes(
      [income({ kind: "monthly", day1: 31, day2: null })],
      "2026-01-01",
      "2026-03-31"
    );
    expect(flows.map((f) => f.date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  test("pago único solo entra si su fecha está en el rango", () => {
    const flows = expandIncomes(
      [income({ kind: "once", date: "2026-02-10", day1: null, day2: null, name: "Bono" }), income({ kind: "once", date: "2026-05-01", day1: null, day2: null, name: "Otro" })],
      "2026-02-01",
      "2026-03-31"
    );
    expect(flows).toEqual([{ date: "2026-02-10", amount: 1000, sourceName: "Bono" }]);
  });

  test("una fuente inactiva no produce cobros y el resultado sale ordenado por fecha", () => {
    const flows = expandIncomes(
      [income({ isActive: false }), income({ kind: "once", date: "2026-02-20", day1: null, day2: null, name: "Bono" }), income({ kind: "monthly", day1: 5, day2: null, name: "Renta" })],
      "2026-02-01",
      "2026-02-28"
    );
    expect(flows.map((f) => `${f.date} ${f.sourceName}`)).toEqual(["2026-02-05 Renta", "2026-02-20 Bono"]);
  });
});

describe("plan de pagos", () => {
  test("con dinero de sobra todas las tarjetas quedan pagadas sin intereses", () => {
    const plan = buildPaymentPlan({ today: TODAY, funds: 100000, inflows: [], cards: [azul, oro] });
    expect(plan.lines.map((l) => [l.amount, l.level])).toEqual([
      [1000, "full"],
      [500, "full"],
    ]);
    expect(plan.totalAllocated).toBe(1500);
    expect(plan.leftover).toBe(98500);
    expect(plan.warnings).toEqual([]);
  });

  test("tarjetas fuera del horizonte de 45 días no entran al plan", () => {
    const lejana = { ...oro, cardId: 3, name: "Lejana", dueDate: "2027-03-01" };
    const plan = buildPaymentPlan({ today: TODAY, funds: 100000, inflows: [], cards: [azul, lejana] });
    expect(plan.lines.map((l) => l.name)).toEqual(["Azul"]);
  });

  test("con el dinero justo solo alcanza el mínimo y avisa de los intereses", () => {
    const plan = buildPaymentPlan({ today: TODAY, funds: 350, inflows: [], cards: [azul, oro] });
    expect(plan.lines.map((l) => [l.amount, l.level])).toEqual([
      [200, "minimum"],
      [150, "minimum"],
    ]);
    expect(plan.leftover).toBe(0);
    expect(plan.shortMinimums).toBe(0);
    expect(plan.warnings).toEqual([
      "Pagar solo el mínimo no evita intereses en Azul",
      "Pagar solo el mínimo no evita intereses en Oro",
    ]);
    // Azul: (1000 - 200) * 50% / 12 = 33.33. Oro: (500 - 150) * 30% / 12 = 8.75.
    expect(plan.lines.map((l) => l.estimatedInterest)).toEqual([33.33, 8.75]);
    expect(plan.estimatedInterestTotal).toBe(42.08);
  });

  test("la tarjeta de tasa mayor recibe el extra antes aunque venza después", () => {
    const plan = buildPaymentPlan({ today: TODAY, funds: 500, inflows: [], cards: [azul, oro] });
    // Mínimos: Azul 200 y Oro 150. Quedan 150 y se van a Azul (tasa 50), no a Oro (tasa 30).
    expect(plan.lines.map((l) => [l.name, l.amount, l.level])).toEqual([
      ["Azul", 350, "partial"],
      ["Oro", 150, "minimum"],
    ]);
    expect(plan.leftover).toBe(0);
  });

  test("un cobro entre dos vencimientos paga la segunda tarjeta pero no la primera", () => {
    const pronto = { ...azul, dueDate: "2026-11-30" };
    const inflows: Inflow[] = [{ date: "2026-12-05", amount: 150, sourceName: "Quincena" }];
    const plan = buildPaymentPlan({ today: TODAY, funds: 0, inflows, cards: [pronto, oro] });
    expect(plan.lines.map((l) => [l.name, l.amount, l.level])).toEqual([
      ["Azul", 0, "short"],
      ["Oro", 150, "minimum"],
    ]);
    expect(plan.shortMinimums).toBe(200);
    expect(plan.inflowsCounted).toBe(150);
    expect(plan.warnings).toContain("No alcanza para el pago mínimo de Azul: faltan $200.00");
  });

  test("una tarjeta vencida cuenta desde hoy y se marca", () => {
    const vieja = { ...oro, cardId: 4, name: "Vieja", dueDate: "2026-11-20", payToAvoidInterest: 900, minimumPayment: 300, annualRate: null };
    const plan = buildPaymentPlan({ today: TODAY, funds: 100, inflows: [], cards: [vieja] });
    expect(plan.lines[0]).toMatchObject({ overdue: true, amount: 100, level: "short", estimatedInterest: null });
    expect(plan.shortMinimums).toBe(200);
    expect(plan.warnings).toEqual(["No alcanza para el pago mínimo de Vieja: faltan $200.00", "Hay una tarjeta vencida: Vieja"]);
  });

  test("los montos se redondean a centavos sin errores de punto flotante", () => {
    const decimal: PlanCardInput = {
      cardId: 5,
      name: "Centavos",
      dueDate: "2026-12-02",
      payToAvoidInterest: 29.985,
      minimumPayment: 0.1,
      minimumPlusInstallments: 0.1 + 0.2,
      annualRate: null,
    };
    const plan = buildPaymentPlan({ today: TODAY, funds: 0.1 + 0.2, inflows: [], cards: [decimal] });
    const [line] = plan.lines;
    expect(line.mustPay).toBe(0.3);
    expect(line.fullNoInterest).toBe(30.19);
    expect(line.amount).toBe(0.3);
    expect(line.level).toBe("minimum");
    expect(plan.totalAllocated).toBe(0.3);
    expect(plan.leftover).toBe(0);
  });
});

describe("próximo cobro", () => {
  test("devuelve el primer cobro desde hoy o nulo", () => {
    const flows: Inflow[] = [
      { date: "2026-11-20", amount: 1, sourceName: "Vieja" },
      { date: "2026-11-30", amount: 2, sourceName: "Quincena" },
      { date: "2026-12-15", amount: 3, sourceName: "Otra" },
    ];
    expect(nextInflow(flows, TODAY)).toEqual({ date: "2026-11-30", amount: 2, sourceName: "Quincena" });
    expect(nextInflow(flows, "2027-01-01")).toBeNull();
  });
});

describe("pagos ya hechos desde el corte", () => {
  test("un pago parcial reduce el mínimo, y si lo cubre no queda nada que pagar", () => {
    const plan = buildPaymentPlan({
      today: TODAY,
      funds: 0,
      inflows: [],
      cards: [{ ...azul, paidSinceCutoff: 250 }],
    });
    const [line] = plan.lines;
    expect(line.mustPay).toBe(0);
    expect(line.alreadyPaid).toBe(250);
    expect(line.shortToFull).toBe(750);
    expect(plan.shortMinimums).toBe(0);
    expect(plan.warnings.some((w) => w.includes("No alcanza"))).toBe(false);
    // Con el mínimo cubierto y sin fondos, el plan no marca "minimum" ni avisa de intereses.
    expect(line.level).toBe("partial");
    expect(plan.warnings).toEqual([]);
  });

  test("un pago parcial ya hecho cuenta en el interés estimado como si fuera parte del pago", () => {
    const plan = buildPaymentPlan({
      today: TODAY,
      funds: 350,
      inflows: [],
      cards: [{ ...azul, paidSinceCutoff: 250 }, oro],
    });
    // Azul recibe 200 (queda por debajo de su necesidad de 750). Interés: (1000 - (200 + 250)) * 50% / 12 = 22.92.
    expect(plan.lines[0]).toMatchObject({ amount: 200, fullNoInterest: 750, level: "partial", estimatedInterest: 22.92 });
  });

  test("un pago total deja la tarjeta en full con 0 y sin avisos", () => {
    const plan = buildPaymentPlan({
      today: TODAY,
      funds: 0,
      inflows: [],
      cards: [{ ...azul, paidSinceCutoff: 1000 }],
    });
    expect(plan.lines[0]).toMatchObject({ amount: 0, mustPay: 0, fullNoInterest: 0, shortToFull: 0, level: "full", estimatedInterest: 0 });
    expect(plan.warnings).toEqual([]);
  });
});

describe("flujo de dinero", () => {
  const ev = (over: Partial<CashEvent>): CashEvent => ({
    date: "2026-12-05",
    amount: 0,
    label: "Cargo",
    kind: "card",
    affectsBalance: true,
    ...over,
  });

  test("un ingreso y un cargo el mismo día: el ingreso va primero", () => {
    const inflows: Inflow[] = [{ date: "2026-12-05", amount: 500, sourceName: "Quincena" }];
    const flow = buildCashflow({
      today: TODAY,
      funds: 100,
      inflows,
      outflows: [ev({ amount: 550, label: "Azul" })],
    });
    expect(flow.rows.map((r) => [r.label, r.balance])).toEqual([
      ["Quincena", 600],
      ["Azul", 50],
    ]);
    expect(flow.lowestBalance).toBe(50);
    expect(flow.lowestDate).toBe("2026-12-05");
    expect(flow.firstNegativeDate).toBeNull();
  });

  test("un saldo que baja de cero marca la primera fecha negativa", () => {
    const flow = buildCashflow({
      today: TODAY,
      funds: 100,
      inflows: [],
      outflows: [ev({ date: "2026-12-02", amount: 300, label: "Renta", kind: "recurring" })],
    });
    expect(flow.rows[0].balance).toBe(-200);
    expect(flow.lowestBalance).toBe(-200);
    expect(flow.lowestDate).toBe("2026-12-02");
    expect(flow.firstNegativeDate).toBe("2026-12-02");
  });

  test("un cargo recurrente a tarjeta no mueve el saldo ni cuenta para el mínimo", () => {
    const flow = buildCashflow({
      today: TODAY,
      funds: 100,
      inflows: [],
      outflows: [ev({ date: "2026-12-03", amount: 50, label: "Netflix (se carga a Azul)", kind: "recurring", affectsBalance: false })],
    });
    expect(flow.rows[0]).toMatchObject({ balance: 100, affectsBalance: false });
    expect(flow.lowestBalance).toBe(100);
    expect(flow.lowestDate).toBeNull();
    expect(flow.firstNegativeDate).toBeNull();
  });

  test("sin movimientos el mínimo es el dinero disponible y no hay fecha", () => {
    const flow = buildCashflow({ today: TODAY, funds: 800, inflows: [], outflows: [] });
    expect(flow).toEqual({ rows: [], lowestBalance: 800, lowestDate: null, firstNegativeDate: null });
  });
});

describe("cargos recurrentes", () => {
  const azulCard: Card = {
    id: 1,
    name: "Azul",
    bank: "Banamex",
    kind: "credit",
    last4: "1234",
    color: "#2F6E94",
    cutoffDay: null,
    dueDay: null,
    annualRate: null,
    isActive: true,
  };

  const charge = (over: Partial<RecurringCharge>): RecurringCharge => ({
    id: 1,
    name: "Netflix",
    amount: 200,
    frequency: "monthly",
    dayOfMonth: 3,
    monthOfYear: null,
    cardId: null,
    cardName: null,
    cardColor: null,
    categoryId: null,
    categoryName: null,
    isActive: true,
    nextDate: "2026-12-03",
    ...over,
  });

  test("expande mensuales y anuales, con tarjeta o en efectivo, y omite los inactivos", () => {
    const charges: RecurringCharge[] = [
      charge({ name: "Netflix", cardId: 1, cardName: "Azul" }),
      charge({ id: 2, name: "Luz", dayOfMonth: 31 }),
      charge({ id: 3, name: "Seguro", frequency: "yearly", dayOfMonth: 10, monthOfYear: 3 }),
      charge({ id: 4, name: "Inactivo", isActive: false }),
    ];
    const events = expandRecurring(charges, [azulCard], "2026-02-01", "2026-03-31");
    expect(events.map((e) => `${e.date} ${e.label} ${e.affectsBalance}`)).toEqual([
      "2026-02-03 Netflix (se carga a Azul) false",
      "2026-02-28 Luz true",
      "2026-03-03 Netflix (se carga a Azul) false",
      "2026-03-10 Seguro true",
      "2026-03-31 Luz true",
    ]);
    expect(events[0]).toMatchObject({ amount: 200, kind: "recurring" });
  });
});

describe("salud financiera", () => {
  const src = (over: Partial<IncomeSource>): IncomeSource => ({
    id: 1,
    name: "Fuente",
    amount: 1000,
    kind: "semimonthly",
    day1: 15,
    day2: 30,
    date: null,
    cardId: null,
    isActive: true,
    ...over,
  });

  test("el ingreso mensual suma quincenas por dos, mensuales por uno, ignora pagos únicos e inactivos", () => {
    const total = monthlyIncome([
      src({}),
      src({ id: 2, kind: "monthly", amount: 500, day1: 1, day2: null }),
      src({ id: 3, kind: "once", amount: 300, day1: null, day2: null, date: "2026-12-01" }),
      src({ id: 4, kind: "monthly", amount: 999, day1: 1, day2: null, isActive: false }),
    ]);
    expect(total).toBe(2500);
  });

  test("la razón deuda a ingreso es nula sin ingreso", () => {
    expect(debtToIncome(1250, 2500)).toBe(0.5);
    expect(debtToIncome(100, 0)).toBeNull();
  });

  test("los planes con pagos pendientes salen ordenados por último pago y clampean el día", () => {
    const plan = (over: Partial<InstallmentPlan>): InstallmentPlan => ({
      id: 1,
      name: "Celular",
      cardId: 1,
      cardName: "Azul",
      cardColor: "#2F6E94",
      totalAmount: 1200,
      months: 6,
      monthlyAmount: 200,
      firstPaymentDate: "2026-10-15",
      categoryId: null,
      note: null,
      paidCount: 1,
      remainingAmount: 1000,
      lastPaymentDate: "2027-03-15",
      isFinished: false,
      monthlyPayment: null,
      interestRate: null,
      ...over,
    });
    const releases = installmentReleases(
      [
        plan({}),
        plan({ id: 2, name: "Vieja", months: 3, firstPaymentDate: "2026-01-31", totalAmount: 900 }),
        plan({ id: 3, name: "Sofá", cardId: 2, totalAmount: 1000, months: 4, firstPaymentDate: "2026-11-30" }),
      ],
      TODAY
    );
    expect(releases).toEqual([
      { name: "Sofá", cardId: 2, lastPaymentDate: "2027-02-28", monthly: 250, remainingPayments: 4 },
      { name: "Celular", cardId: 1, lastPaymentDate: "2027-03-15", monthly: 200, remainingPayments: 4 },
    ]);
  });

  test("un plan con mensualidad fija sale con esa mensualidad, no con total / meses", () => {
    const loan: InstallmentPlan = {
      id: 4,
      name: "Préstamo",
      cardId: 1,
      cardName: "Azul",
      cardColor: "#2F6E94",
      totalAmount: 5000,
      months: 12,
      monthlyAmount: 400,
      firstPaymentDate: "2026-11-18",
      categoryId: null,
      note: null,
      paidCount: 0,
      remainingAmount: 5000,
      lastPaymentDate: "2027-10-18",
      isFinished: false,
      monthlyPayment: 400,
      interestRate: 45,
    };
    expect(installmentReleases([loan], TODAY)).toEqual([
      { name: "Préstamo", cardId: 1, lastPaymentDate: "2027-10-18", monthly: 400, remainingPayments: 11 },
    ]);
  });

  test("el estado del presupuesto avisa desde 0.8 y marca exceso arriba de 1", () => {
    expect(budgetStatus(79, 100)).toEqual({ ratio: 0.79, level: "ok" });
    expect(budgetStatus(80, 100)).toEqual({ ratio: 0.8, level: "warn" });
    expect(budgetStatus(101, 100)).toEqual({ ratio: 1.01, level: "over" });
  });

  test("la tendencia usa los dos periodEnd más recientes con saldo", () => {
    const stmt = (over: Partial<StatementSummary>): StatementSummary => ({
      cardId: 1,
      periodStart: "2026-09-18",
      periodEnd: "2026-10-17",
      dueDate: "2026-11-05",
      payToAvoidInterest: 0,
      minimumPayment: 0,
      minimumPlusInstallments: null,
      totalBalance: 4000,
      regularBalance: null,
      installmentBalance: null,
      creditLimit: null,
      availableCredit: null,
      annualRate: null,
      importedAt: "2026-10-20",
      ...over,
    });
    const trend = balanceTrend([
      stmt({ periodEnd: "2026-09-17", totalBalance: null }),
      stmt({ periodEnd: "2026-11-17", totalBalance: 3500 }),
      stmt({ periodEnd: "2026-10-17", totalBalance: 4000 }),
    ]);
    expect(trend).toEqual({ latest: 3500, previous: 4000, change: -500 });
    expect(balanceTrend([stmt({})])).toBeNull();
  });
});
