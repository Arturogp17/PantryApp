import { beforeEach, describe, expect, test, vi, type Mock } from "vitest";
import api from "../api/client";
import {
  discardFailures,
  enqueueAction,
  flushOutbox,
  isOfflineError,
  loadOutbox,
  loadOutboxFailures,
  queuedCardPaid,
  removeWhere,
  subscribeOutbox,
} from "./outbox";

vi.mock("../api/client", () => ({
  default: { post: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

const mockApi = api as unknown as { post: Mock; delete: Mock; patch: Mock };

// Error con la forma de axios: con response cuando el servidor contestó, sin response cuando no hubo red.
function httpError(status: number, data?: unknown): Error {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { status, data },
  });
}

function networkError(): Error {
  return Object.assign(new Error("Network Error"), { isAxiosError: true });
}

const stock = (productId: number) => ({ kind: "stock" as const, productId, quantity: productId * 10 });

beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
});

describe("cola sin conexión", () => {
  test("encola y carga en el mismo orden", () => {
    const first = enqueueAction(stock(1));
    const second = enqueueAction({ kind: "list-remove", itemId: 7 });

    const queue = loadOutbox();
    expect(queue.map((e) => e.id)).toEqual([first.id, second.id]);
    expect(queue[1].action).toEqual({ kind: "list-remove", itemId: 7 });
    expect(loadOutboxFailures()).toEqual([]);
  });

  test("envía en orden y vacía la cola", async () => {
    enqueueAction(stock(1));
    enqueueAction(stock(2));
    enqueueAction(stock(3));
    mockApi.patch.mockResolvedValue({});

    const result = await flushOutbox();

    expect(result).toEqual({ sent: 3, failed: 0, remaining: 0 });
    expect(mockApi.patch.mock.calls.map((call) => call[0])).toEqual([
      "/products/1/stock",
      "/products/2/stock",
      "/products/3/stock",
    ]);
    expect(mockApi.patch.mock.calls[1][1]).toEqual({ quantity: 20 });
    expect(loadOutbox()).toEqual([]);
  });

  test("se detiene en un error de red y conserva el resto", async () => {
    enqueueAction({ kind: "expense", body: { clientRequestId: "a", amount: 10 } });
    enqueueAction(stock(2));
    enqueueAction({ kind: "list-remove", itemId: 5 });
    mockApi.post.mockResolvedValue({});
    mockApi.patch.mockRejectedValue(networkError());

    const result = await flushOutbox();

    expect(result).toEqual({ sent: 1, failed: 0, remaining: 2 });
    expect(mockApi.delete).not.toHaveBeenCalled();
    expect(loadOutbox().map((e) => e.action.kind)).toEqual(["stock", "list-remove"]);
    expect(loadOutboxFailures()).toEqual([]);
  });

  test("un 400 pasa a fallidos y no bloquea a la siguiente", async () => {
    enqueueAction(stock(1));
    enqueueAction({ kind: "list-remove", itemId: 9 });
    mockApi.patch.mockRejectedValue(httpError(400, { message: "Cantidad no válida" }));
    mockApi.delete.mockResolvedValue({});

    const result = await flushOutbox();

    expect(result).toEqual({ sent: 1, failed: 1, remaining: 0 });
    const failures = loadOutboxFailures();
    expect(failures).toHaveLength(1);
    expect(failures[0].entry.action).toEqual(stock(1));
    expect(failures[0].error).toBe("Cantidad no válida");
  });

  test("list-remove con 404 cuenta como enviado", async () => {
    enqueueAction({ kind: "list-remove", itemId: 4 });
    mockApi.delete.mockRejectedValue(httpError(404, "No existe"));

    const result = await flushOutbox();

    expect(result).toEqual({ sent: 1, failed: 0, remaining: 0 });
    expect(loadOutboxFailures()).toEqual([]);
  });

  test("expense con 409 (duplicado) cuenta como enviado", async () => {
    enqueueAction({ kind: "expense", body: { clientRequestId: "dup-1", amount: 99 } });
    mockApi.post.mockRejectedValue(httpError(409, { message: "Ya existe" }));

    const result = await flushOutbox();

    expect(result).toEqual({ sent: 1, failed: 0, remaining: 0 });
    expect(loadOutboxFailures()).toEqual([]);
  });

  test("un 403 con página HTML se reintenta", async () => {
    enqueueAction(stock(1));
    mockApi.patch.mockRejectedValue(httpError(403, "<!DOCTYPE html><html>Forbidden</html>"));

    const result = await flushOutbox();

    expect(result).toEqual({ sent: 0, failed: 0, remaining: 1 });
    expect(loadOutboxFailures()).toEqual([]);
    expect(isOfflineError(httpError(403, "<html></html>"))).toBe(true);
  });

  test("un 403 con message se rechaza", async () => {
    enqueueAction(stock(1));
    mockApi.patch.mockRejectedValue(httpError(403, { message: "Sin permiso" }));

    const result = await flushOutbox();

    expect(result).toEqual({ sent: 0, failed: 1, remaining: 0 });
    expect(loadOutboxFailures()[0].error).toBe("Sin permiso");
    expect(isOfflineError(httpError(403, { message: "Sin permiso" }))).toBe(false);
  });

  test("clasifica los errores que conviene reintentar", () => {
    expect(isOfflineError(networkError())).toBe(true);
    expect(isOfflineError(httpError(401))).toBe(true);
    expect(isOfflineError(httpError(408))).toBe(true);
    expect(isOfflineError(httpError(429))).toBe(true);
    expect(isOfflineError(httpError(503))).toBe(true);
    expect(isOfflineError(httpError(400, { message: "x" }))).toBe(false);
    expect(isOfflineError(httpError(404))).toBe(false);
    expect(isOfflineError(httpError(422))).toBe(false);
  });

  test("removeWhere quita solo las entradas que cumplen el predicado", () => {
    enqueueAction(stock(1));
    enqueueAction({
      kind: "list-add",
      clientRequestId: "req-1",
      body: { productId: 3, barcode: null, stockType: 0, quantity: 1 },
    });
    enqueueAction(stock(2));

    const removed = removeWhere((e) => e.action.kind === "list-add");

    expect(removed).toBe(1);
    expect(loadOutbox().map((e) => e.action.kind)).toEqual(["stock", "stock"]);
    expect(removeWhere(() => false)).toBe(0);
  });

  test("discardFailures vacía los fallidos", async () => {
    enqueueAction(stock(1));
    mockApi.patch.mockRejectedValue(httpError(400, { message: "Mal" }));
    await flushOutbox();
    expect(loadOutboxFailures()).toHaveLength(1);

    discardFailures();

    expect(loadOutboxFailures()).toEqual([]);
  });

  test("dos flush simultáneos no envían dos veces", async () => {
    enqueueAction(stock(1));
    mockApi.patch.mockResolvedValue({});

    const [a, b] = await Promise.all([flushOutbox(), flushOutbox()]);

    expect(mockApi.patch).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(loadOutbox()).toEqual([]);
  });

  test("avisa a los suscriptores y se puede cancelar", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeOutbox(listener);

    enqueueAction(stock(1));
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    enqueueAction(stock(2));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("card-payment se envía a POST /card-payments con su clientRequestId", async () => {
    const body = { cardId: 3, date: "2026-11-20", amount: 500, note: null, clientRequestId: "cp-1", deductFromFunds: true };
    enqueueAction({ kind: "card-payment", body });
    mockApi.post.mockResolvedValue({});

    const result = await flushOutbox();

    expect(result).toEqual({ sent: 1, failed: 0, remaining: 0 });
    expect(mockApi.post).toHaveBeenCalledWith("/card-payments", body);
    expect(loadOutbox()).toEqual([]);
  });

  test("card-payment con 409 (ya registrado) cuenta como enviado", async () => {
    enqueueAction({
      kind: "card-payment",
      body: { cardId: 3, date: "2026-11-20", amount: 500, note: null, clientRequestId: "cp-2", deductFromFunds: false },
    });
    mockApi.post.mockRejectedValue(httpError(409, { message: "Ya existe" }));

    const result = await flushOutbox();

    expect(result).toEqual({ sent: 1, failed: 0, remaining: 0 });
    expect(loadOutboxFailures()).toEqual([]);
  });

  test("card-payment sin conexión se queda en cola para el siguiente envío", async () => {
    enqueueAction({
      kind: "card-payment",
      body: { cardId: 3, date: "2026-11-20", amount: 500, note: null, clientRequestId: "cp-3", deductFromFunds: true },
    });
    mockApi.post.mockRejectedValue(networkError());

    const result = await flushOutbox();

    expect(result).toEqual({ sent: 0, failed: 0, remaining: 1 });
    expect(loadOutbox()[0].action.kind).toBe("card-payment");
    expect(loadOutboxFailures()).toEqual([]);
  });

  test("queuedCardPaid suma solo los pagos de esa tarjeta posteriores al corte", () => {
    const payment = (cardId: number, date: string, amount: number, clientRequestId: string) =>
      enqueueAction({
        kind: "card-payment",
        body: { cardId, date, amount, note: null, clientRequestId, deductFromFunds: false },
      });
    payment(3, "2026-11-20", 100, "a");
    payment(3, "2026-11-10", 50, "b");
    payment(4, "2026-11-25", 70, "c");
    payment(3, "2026-11-15", 25, "d");

    expect(queuedCardPaid(loadOutbox(), 3, "2026-11-15")).toBe(100);
    expect(queuedCardPaid(loadOutbox(), 4, "2026-11-15")).toBe(70);
    expect(queuedCardPaid([], 3, "2026-11-15")).toBe(0);
  });
});
