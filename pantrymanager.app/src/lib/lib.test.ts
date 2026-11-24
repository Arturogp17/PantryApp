import { beforeEach, describe, expect, test } from "vitest";
import { addLine, cartTotal, lineSavings, lineTotal, removeLine, toPurchaseItems, updateLine } from "./cart";
import { Promo, isValidPromo, promoLabel, promoTotal } from "./promo";
import { isValidBarcode, normalizeBarcode } from "./barcode";
import { roundMoney, roundQuantity } from "./money";
import {
  buildCommitmentChart,
  buildMonthChart,
  dateLabel,
  dayLabel,
  dayMonthLabel,
  daysUntil,
  donutGradient,
  installmentAmount,
  lastForMerchant,
  monthRange,
  shiftDays,
  shiftMonth,
} from "./expenses";
import type { CommitmentMonth } from "../types";
import { PendingPurchase, enqueuePurchase, flushPending, loadPending, purchaseBody, shouldRetry } from "./offlineQueue";
import { resolveSplit } from "./split";

const base = { productId: null, barcode: null, stockType: 0 };

describe("barcode", () => {
  test("deja solo dígitos", () => {
    expect(normalizeBarcode(" 7501-0000 1234567 ")).toBe("750100001234567");
  });

  test("UPC-A de 12 dígitos pasa a EAN-13", () => {
    expect(normalizeBarcode("036000291452")).toBe("0036000291452");
  });

  test("vacío o demasiado largo es nulo", () => {
    expect(normalizeBarcode("")).toBeNull();
    expect(normalizeBarcode("abc")).toBeNull();
    expect(normalizeBarcode("1".repeat(33))).toBeNull();
  });

  test("valida longitud mínima", () => {
    expect(isValidBarcode("1234")).toBe(false);
    expect(isValidBarcode("12345678")).toBe(true);
  });
});

describe("dinero", () => {
  test("redondea a centavos sin errores de punto flotante", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(1.005)).toBe(1.01);
  });

  test("redondea cantidades a gramos", () => {
    expect(roundQuantity(0.1 + 0.2)).toBe(0.3);
  });
});

describe("carrito", () => {
  test("el total suma cantidad por precio", () => {
    let cart = addLine([], { ...base, name: "Leche", quantity: 2, unitPrice: 24.5 });
    cart = addLine(cart, { ...base, name: "Pan", quantity: 1, unitPrice: 38 });
    expect(cartTotal(cart)).toBe(87);
  });

  test("un mismo producto suma cantidad y toma el último precio", () => {
    let cart = addLine([], { ...base, name: "Leche", quantity: 1, unitPrice: 24 });
    cart = addLine(cart, { ...base, name: "leche ", quantity: 2, unitPrice: 26 });
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(3);
    expect(cart[0].unitPrice).toBe(26);
  });

  test("actualiza y quita renglones", () => {
    let cart = addLine([], { ...base, name: "Arroz", quantity: 1, unitPrice: 30 });
    const key = cart[0].key;
    cart = updateLine(cart, key, { quantity: 3 });
    expect(lineTotal(cart[0])).toBe(90);
    expect(removeLine(cart, key)).toHaveLength(0);
  });

  test("convierte a renglones de compra", () => {
    const cart = addLine([], { ...base, name: "Arroz", barcode: "7501", quantity: 2, unitPrice: 30 });
    expect(toPurchaseItems(cart)[0]).toMatchObject({ name: "Arroz", quantity: 2, unitPrice: 30 });
  });
});

describe("cola de compras", () => {
  beforeEach(() => localStorage.clear());

  const items = [{ productId: null, name: "Leche", barcode: null, stockType: 0, quantity: 1, unitPrice: 24 }];

  test("guarda la compra con un identificador", () => {
    const purchase = enqueuePurchase(items);
    expect(purchase.clientRequestId).toBeTruthy();
    expect(loadPending()).toHaveLength(1);
  });

  test("al enviar bien se vacía la cola", async () => {
    enqueuePurchase(items);
    const result = await flushPending(async () => {});
    expect(result).toEqual({ sent: 1, failed: 0, remaining: 0 });
    expect(loadPending()).toHaveLength(0);
  });

  test("sin red la compra se queda en la cola", async () => {
    enqueuePurchase(items);
    const result = await flushPending(async () => {
      throw new Error("sin red");
    });
    expect(result.remaining).toBe(1);
    expect(loadPending()).toHaveLength(1);
  });

  test("una compra rechazada se aparta y no bloquea a las demás", async () => {
    enqueuePurchase(items);
    enqueuePurchase(items);
    let calls = 0;
    const result = await flushPending(async () => {
      calls++;
      if (calls === 1) throw { response: { status: 400 } };
    });
    expect(result).toEqual({ sent: 1, failed: 1, remaining: 0 });
  });

  test("decide qué errores se reintentan", () => {
    expect(shouldRetry({})).toBe(true);
    expect(shouldRetry({ response: { status: 503 } })).toBe(true);
    expect(shouldRetry({ response: { status: 401 } })).toBe(true);
    expect(shouldRetry({ response: { status: 400 } })).toBe(false);
    expect(shouldRetry({ response: { status: 403, data: "<html>stopped</html>" } })).toBe(true);
    expect(shouldRetry({ response: { status: 403, data: { message: "No autorizado" } } })).toBe(false);
  });
});

describe("cuerpo de la compra", () => {
  beforeEach(() => localStorage.clear());

  const items = [{ productId: null, name: "Leche", barcode: null, stockType: 0, quantity: 1, unitPrice: 24 }];
  const createdAt = "2026-11-24T15:30:00.000Z";

  test("una compra guardada sin pago se manda en efectivo y no pide gasto", () => {
    const old = { clientRequestId: "abc", items, createdAt } as PendingPurchase;
    expect(purchaseBody(old)).toEqual({
      clientRequestId: "abc",
      items,
      purchasedAt: createdAt,
      createExpense: false,
      payments: [{ cardId: null, amount: 24 }],
    });
  });

  test("con tarjeta manda el gasto, la categoría, el comercio y las partes", () => {
    const purchase = {
      clientRequestId: "abc",
      items,
      createdAt,
      payment: { createExpense: true, categoryId: 5, merchant: "Costco", parts: [{ cardId: 3, amount: 24 }] },
    };
    expect(purchaseBody(purchase)).toEqual({
      clientRequestId: "abc",
      items,
      purchasedAt: createdAt,
      createExpense: true,
      payments: [{ cardId: 3, amount: 24 }],
      expenseCategoryId: 5,
      merchant: "Costco",
    });
  });

  test("un pago dividido manda una parte por método, en efectivo incluido", () => {
    const parts = [
      { cardId: 3, amount: 10 },
      { cardId: null, amount: 14 },
    ];
    const purchase = { clientRequestId: "abc", items, createdAt, payment: { createExpense: true, categoryId: 5, merchant: "Súper", parts } };
    const body = purchaseBody(purchase);
    expect(body.payments).toEqual(parts);
    expect(body.createExpense).toBe(true);
  });

  test("sin registrar el gasto no manda categoría", () => {
    const purchase = {
      clientRequestId: "abc",
      items,
      createdAt,
      payment: { createExpense: false, categoryId: null, merchant: "Súper", parts: [{ cardId: null, amount: 24 }] },
    };
    const body = purchaseBody(purchase);
    expect(body.createExpense).toBe(false);
    expect(body).not.toHaveProperty("expenseCategoryId");
    expect(body.payments).toEqual([{ cardId: null, amount: 24 }]);
  });

  test("sin categoría no pide gasto aunque el interruptor esté encendido", () => {
    const purchase = {
      clientRequestId: "abc",
      items,
      createdAt,
      payment: { createExpense: true, categoryId: null, merchant: "Súper", parts: [{ cardId: 2, amount: 24 }] },
    };
    expect(purchaseBody(purchase).createExpense).toBe(false);
  });

  test("una compra con el formato anterior se manda con el total en una parte", () => {
    const twoLines = [...items, { productId: null, name: "Pan", barcode: null, stockType: 0, quantity: 1, unitPrice: 38 }];
    const legacy = {
      clientRequestId: "abc",
      items: twoLines,
      createdAt,
      payment: { createExpense: true, cardId: 3, categoryId: 5, merchant: "Costco" },
    } as PendingPurchase;
    expect(purchaseBody(legacy)).toEqual({
      clientRequestId: "abc",
      items: twoLines,
      purchasedAt: createdAt,
      createExpense: true,
      payments: [{ cardId: 3, amount: 62 }],
      expenseCategoryId: 5,
      merchant: "Costco",
    });
  });

  test("el formato anterior sin categoría no pide gasto", () => {
    const legacy = {
      clientRequestId: "abc",
      items,
      createdAt,
      payment: { createExpense: true, cardId: null, categoryId: null, merchant: "Súper" },
    } as PendingPurchase;
    const body = purchaseBody(legacy);
    expect(body.createExpense).toBe(false);
    expect(body.payments).toEqual([{ cardId: null, amount: 24 }]);
  });

  test("enqueuePurchase guarda el pago y las compras sin pago quedan en null", () => {
    const parts = [{ cardId: 2, amount: 24 }];
    enqueuePurchase(items, { createExpense: true, categoryId: 4, merchant: "Súper", parts });
    enqueuePurchase(items);
    const [withPayment, withoutPayment] = loadPending();
    expect(withPayment.payment).toEqual({ createExpense: true, categoryId: 4, merchant: "Súper", parts });
    expect(withoutPayment.payment).toBeNull();
  });
});

describe("pagos divididos", () => {
  test("una sola parte sin monto recibe todo el total", () => {
    expect(resolveSplit(100, [{ cardId: null, amount: null }])).toEqual({
      parts: [{ cardId: null, amount: 100 }],
      remaining: 0,
      error: null,
    });
  });

  test("la parte libre recibe lo que falta, redondeado a centavos", () => {
    expect(resolveSplit(100, [{ cardId: 1, amount: 30.333 }, { cardId: null, amount: null }])).toEqual({
      parts: [
        { cardId: 1, amount: 30.33 },
        { cardId: null, amount: 69.67 },
      ],
      remaining: 0,
      error: null,
    });
  });

  test("redondea los montos antes de comparar con el total", () => {
    const result = resolveSplit(19.99, [{ cardId: 1, amount: 9.995 }, { cardId: null, amount: null }]);
    expect(result.parts).toEqual([
      { cardId: 1, amount: 10 },
      { cardId: null, amount: 9.99 },
    ]);
    expect(result.error).toBeNull();
  });

  test("dos montos que suman el total cuadran sin parte libre", () => {
    const result = resolveSplit(100, [{ cardId: 1, amount: 40 }, { cardId: 2, amount: 60 }]);
    expect(result).toEqual({
      parts: [
        { cardId: 1, amount: 40 },
        { cardId: 2, amount: 60 },
      ],
      remaining: 0,
      error: null,
    });
  });

  test("si falta dinero y no hay parte libre, dice cuánto falta", () => {
    const result = resolveSplit(100, [{ cardId: 1, amount: 60 }, { cardId: 2, amount: 30 }]);
    expect(result.remaining).toBe(10);
    expect(result.error).toMatch(/^Faltan .*10\.00 por asignar$/);
  });

  test("si los pagos suman más que el total, lo dice", () => {
    expect(resolveSplit(100, [{ cardId: 1, amount: 60 }, { cardId: 2, amount: 50 }]).error).toBe(
      "Los pagos suman más que el total"
    );
  });

  test("no deja repetir el mismo método", () => {
    expect(resolveSplit(100, [{ cardId: 1, amount: 50 }, { cardId: 1, amount: 50 }]).error).toBe(
      "Elegiste el mismo método dos veces"
    );
  });

  test("solo una parte puede quedar sin monto", () => {
    expect(resolveSplit(100, [{ cardId: 1, amount: null }, { cardId: 2, amount: null }]).error).toBe(
      "Solo una parte puede quedar sin monto"
    );
  });

  test("un pago en cero o una parte libre en cero no cuadran", () => {
    expect(resolveSplit(100, [{ cardId: 1, amount: 0 }, { cardId: null, amount: null }]).error).not.toBeNull();
    expect(resolveSplit(100, [{ cardId: 1, amount: 100 }, { cardId: null, amount: null }]).error).not.toBeNull();
  });
});

describe("promociones", () => {
  const dosPorUno: Promo = { type: "nxm", buy: 2, value: 1 };
  const tresPorDos: Promo = { type: "nxm", buy: 3, value: 2 };
  const dosPor50: Promo = { type: "pack", buy: 2, value: 50 };
  const segundoAl50: Promo = { type: "second", buy: 2, value: 50 };
  const veintePorCiento: Promo = { type: "percent", value: 20 };

  test("2x1 cobra uno de cada dos", () => {
    expect(promoTotal(2, 10, dosPorUno)).toBe(10);
    expect(promoTotal(3, 10, dosPorUno)).toBe(20);
    expect(promoTotal(1, 10, dosPorUno)).toBe(10);
    expect(promoTotal(4, 10, dosPorUno)).toBe(20);
  });

  test("3x2", () => {
    expect(promoTotal(3, 10, tresPorDos)).toBe(20);
    expect(promoTotal(5, 10, tresPorDos)).toBe(40);
  });

  test("N por un precio", () => {
    expect(promoTotal(2, 30, dosPor50)).toBe(50);
    expect(promoTotal(3, 30, dosPor50)).toBe(80);
    expect(promoTotal(1, 30, dosPor50)).toBe(30);
  });

  test("segundo con descuento", () => {
    expect(promoTotal(2, 10, segundoAl50)).toBe(15);
    expect(promoTotal(3, 10, segundoAl50)).toBe(25);
    // 19.99 + 9.995 = 29.985: la mitad redondea hacia arriba, igual que el servidor
    expect(promoTotal(2, 19.99, segundoAl50)).toBe(29.99);
  });

  test("porcentaje de descuento", () => {
    expect(promoTotal(2, 10, veintePorCiento)).toBe(16);
  });

  test("sin promoción o con una inválida cobra precio normal", () => {
    expect(promoTotal(3, 10)).toBe(30);
    expect(promoTotal(3, 10, { type: "nxm", buy: 2, value: 2 })).toBe(30);
    expect(promoTotal(3, 10, { type: "percent", value: 100 })).toBe(30);
  });

  test("valida los números", () => {
    expect(isValidPromo(dosPorUno)).toBe(true);
    expect(isValidPromo({ type: "nxm", buy: 1, value: 1 })).toBe(false);
    expect(isValidPromo({ type: "pack", buy: 2, value: 0 })).toBe(false);
    expect(isValidPromo({ type: "second", value: 0 })).toBe(false);
  });

  test("texto de la promoción", () => {
    expect(promoLabel(dosPorUno)).toBe("2x1");
    expect(promoLabel(dosPor50)).toBe("2 por $50");
    expect(promoLabel(segundoAl50)).toBe("2º al 50%");
    expect(promoLabel(veintePorCiento)).toBe("20% menos");
  });

  test("el carrito usa la promoción en el total y calcula el ahorro", () => {
    let cart = addLine([], { productId: null, barcode: null, stockType: 0, name: "Yogurt", quantity: 3, unitPrice: 10, promo: dosPorUno });
    cart = addLine(cart, { productId: null, barcode: null, stockType: 0, name: "Pan", quantity: 1, unitPrice: 38 });
    expect(lineTotal(cart[0])).toBe(20);
    expect(lineSavings(cart[0])).toBe(10);
    expect(cartTotal(cart)).toBe(58);
  });

  test("al sumar otra pieza sin promoción se conserva la promoción del renglón", () => {
    let cart = addLine([], { productId: 1, barcode: null, stockType: 0, name: "Yogurt", quantity: 1, unitPrice: 10, promo: dosPorUno });
    cart = addLine(cart, { productId: 1, barcode: null, stockType: 0, name: "Yogurt", quantity: 1, unitPrice: 10 });
    expect(cart[0].quantity).toBe(2);
    expect(lineTotal(cart[0])).toBe(10);
  });

  test("la promoción viaja en la compra", () => {
    const cart = addLine([], { productId: null, barcode: null, stockType: 0, name: "Yogurt", quantity: 2, unitPrice: 10, promo: dosPorUno });
    expect(toPurchaseItems(cart)[0].promo).toEqual(dosPorUno);
  });
});

describe("gastos: fechas", () => {
  test("mueve el mes cruzando el año", () => {
    expect(shiftMonth("2026-11", 1)).toBe("2026-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  test("el rango de un mes termina el día 1 del siguiente", () => {
    expect(monthRange("2026-12")).toEqual({ from: "2026-12-01", to: "2027-01-01" });
  });

  test("etiqueta de día", () => {
    expect(dayLabel("2026-11-21")).toBe("sáb 21 nov");
  });
});

describe("gastos: gráficas", () => {
  const categories = [
    { id: 1, name: "Súper", parentId: null, color: "#111111", sortOrder: 0 },
    { id: 2, name: "Gasolina", parentId: null, color: "#222222", sortOrder: 1 },
    { id: 3, name: "Ropa", parentId: null, color: "#333333", sortOrder: 2 },
  ];
  const months = [
    { month: "2026-10", total: 350, byCategory: [{ id: 1, total: 200 }, { id: 2, total: 100 }, { id: 3, total: 50 }] },
    { month: "2026-11", total: 120, byCategory: [{ id: 1, total: 120 }] },
  ];

  test("deja las de mayor gasto y junta el resto", () => {
    const chart = buildMonthChart(months, categories, 2);
    expect(chart.series.map((s) => s.name)).toEqual(["Súper", "Gasolina", "Resto"]);
    expect(chart.months[0].segments.map((s) => s.value)).toEqual([200, 100, 50]);
    expect(chart.months[1].segments).toEqual([{ color: "#111111", value: 120 }]);
  });

  test("sin resto no agrega la serie", () => {
    const chart = buildMonthChart(months, categories, 3);
    expect(chart.series.some((s) => s.id === "rest")).toBe(false);
  });

  test("la dona reparte el 100 %", () => {
    const g = donutGradient([{ color: "#a", total: 75 }, { color: "#b", total: 25 }]);
    expect(g).toBe("conic-gradient(#a 0.00% 75.00%, #b 75.00% 100.00%)");
  });

  test("propone lo último usado en un comercio", () => {
    const recent = [
      { merchant: "Gasolinera Norte", categoryId: 2 },
      { merchant: "Costco", categoryId: 9 },
    ];
    expect(lastForMerchant(recent, " costco ")?.categoryId).toBe(9);
    expect(lastForMerchant(recent, "c")).toBeUndefined();
  });
});

describe("gastos: compromisos", () => {
  const card = (cardId: number, cardName: string, color: string, total: number) => ({ cardId, cardName, color, total });
  const months: CommitmentMonth[] = [
    {
      month: "2026-12",
      installmentsTotal: 450,
      recurringTotal: 80,
      total: 530,
      byCard: [card(1, "Azul", "#2F6E94", 300), card(2, "Oro", "#D9822B", 150)],
    },
    { month: "2027-01", installmentsTotal: 0, recurringTotal: 0, total: 0, byCard: [] },
    {
      month: "2027-02",
      installmentsTotal: 100,
      recurringTotal: 0,
      total: 100,
      byCard: [card(2, "Oro", "#D9822B", 100)],
    },
  ];

  test("una serie por tarjeta, con su color, de mayor a menor total", () => {
    const chart = buildCommitmentChart(months);
    expect(chart.series).toEqual([
      { id: 1, name: "Azul", color: "#2F6E94" },
      { id: 2, name: "Oro", color: "#D9822B" },
    ]);
  });

  test("cada mes lleva sus segmentos por tarjeta y su etiqueta", () => {
    const chart = buildCommitmentChart(months);
    expect(chart.months.map((m) => m.key)).toEqual(["2026-12", "2027-01", "2027-02"]);
    expect(chart.months.map((m) => m.label)).toEqual(["dic", "ene", "feb"]);
    // La barra suma solo los pagos de planes, que son los que tienen tarjeta.
    expect(chart.months.map((m) => m.total)).toEqual([450, 0, 100]);
    expect(chart.months[0].segments).toEqual([
      { color: "#2F6E94", value: 300 },
      { color: "#D9822B", value: 150 },
    ]);
    expect(chart.months[2].segments).toEqual([{ color: "#D9822B", value: 100 }]);
  });

  test("un mes sin pagos queda vacío y no rompe las series", () => {
    const chart = buildCommitmentChart(months);
    expect(chart.months[1]).toEqual({ key: "2027-01", label: "ene", total: 0, segments: [] });
  });

  test("el orden de las series no depende del orden de byCard", () => {
    const reversed = months.map((m) => ({ ...m, byCard: [...m.byCard].reverse() }));
    expect(buildCommitmentChart(reversed).series).toEqual(buildCommitmentChart(months).series);
  });

  test("sin meses regresa listas vacías", () => {
    expect(buildCommitmentChart([])).toEqual({ months: [], series: [] });
  });
});

describe("gastos: fechas de estados de cuenta", () => {
  test("suma días sin correrse de mes ni de año", () => {
    expect(shiftDays("2026-11-18", -3)).toBe("2026-11-15");
    expect(shiftDays("2026-12-31", 4)).toBe("2027-01-04");
  });

  test("cuenta los días que faltan, con signo", () => {
    const today = new Date(2026, 10, 21);
    expect(daysUntil("2026-12-08", today)).toBe(17);
    expect(daysUntil("2026-11-21", today)).toBe(0);
    expect(daysUntil("2026-11-18", today)).toBe(-3);
  });

  test("etiquetas de fecha corta y con año", () => {
    expect(dayMonthLabel("2026-12-08")).toBe("8 dic");
    expect(dateLabel("2026-11-18")).toBe("18 nov 2026");
  });
});

describe("gastos: mensualidad de un plan", () => {
  const plan = { totalAmount: 1000, months: 3, monthlyPayment: null as number | null };

  test("sin monthlyPayment es total / meses, redondeado a centavos", () => {
    expect(installmentAmount(plan, 0)).toBe(333.33);
    expect(installmentAmount({ ...plan, totalAmount: 900, months: 3 }, 2)).toBe(300);
  });

  test("con monthlyPayment cada mensualidad es esa cantidad, aunque no sea total / meses", () => {
    const loan = { totalAmount: 5000, months: 12, monthlyPayment: 400 };
    expect(installmentAmount(loan, 0)).toBe(400);
    expect(installmentAmount(loan, 11)).toBe(400);
    expect(loan.totalAmount / loan.months).not.toBe(400);
  });

  test("fuera de 0..months-1 no hay mensualidad", () => {
    expect(installmentAmount(plan, -1)).toBe(0);
    expect(installmentAmount(plan, 3)).toBe(0);
    expect(installmentAmount({ totalAmount: 100, months: 0, monthlyPayment: null }, 0)).toBe(0);
  });
});
