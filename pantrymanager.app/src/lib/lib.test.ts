import { beforeEach, describe, expect, test } from "vitest";
import { addLine, cartTotal, lineSavings, lineTotal, removeLine, toPurchaseItems, updateLine } from "./cart";
import { Promo, isValidPromo, promoLabel, promoTotal } from "./promo";
import { isValidBarcode, normalizeBarcode } from "./barcode";
import { roundMoney, roundQuantity } from "./money";
import { enqueuePurchase, flushPending, loadPending, shouldRetry } from "./offlineQueue";

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
