import { PurchaseItemInput } from "../types";
import { itemsTotal } from "./cart";
import { newId } from "./id";
import { readJson, writeJson } from "./storage";

// Compras terminadas sin señal. Se guardan en el teléfono y se mandan al volver la conexión.
// Cada una lleva un clientRequestId: si el servidor ya la guardó, reenviarla no la duplica.

// Cómo se pagó la compra y si también se registra como gasto. Cada parte es un método
// (cardId null = efectivo) con su monto; el servidor crea un gasto por parte.
export interface PurchasePayment {
  createExpense: boolean;
  categoryId: number | null;
  merchant: string;
  parts: { cardId: number | null; amount: number }[];
}

// Formato anterior: un solo método, sin montos. Se manda con el total de la compra.
export interface LegacyPurchasePayment {
  createExpense: boolean;
  cardId: number | null;
  categoryId: number | null;
  merchant: string;
}

export interface PendingPurchase {
  clientRequestId: string;
  items: PurchaseItemInput[];
  createdAt: string;
  // Las compras guardadas antes de este campo no lo traen y se mandan como efectivo, sin gasto.
  payment: PurchasePayment | LegacyPurchasePayment | null;
}

// Cuerpo de POST /purchases.
export interface PurchaseBody {
  clientRequestId: string;
  items: PurchaseItemInput[];
  purchasedAt: string;
  createExpense: boolean;
  payments: PurchasePayment["parts"];
  expenseCategoryId?: number;
  merchant?: string;
}

export interface FailedPurchase {
  purchase: PendingPurchase;
  error: string;
}

export interface FlushResult {
  sent: number;
  failed: number;
  remaining: number;
}

const PENDING_KEY = "pantry.pendingPurchases";
const FAILED_KEY = "pantry.failedPurchases";

export const loadPending = (): PendingPurchase[] =>
  readJson<PendingPurchase[]>(PENDING_KEY, []);

const savePending = (queue: PendingPurchase[]) => writeJson(PENDING_KEY, queue);

const isLegacy = (payment: PurchasePayment | LegacyPurchasePayment): payment is LegacyPurchasePayment =>
  !("parts" in payment);

// Arma el cuerpo del POST. Los pagos siempre van en payments. Sin gasto no se mandan los
// campos de gasto; con una categoría faltante nunca se pide crear el gasto, porque el servidor lo rechazaría.
export function purchaseBody(p: PendingPurchase): PurchaseBody {
  const total = itemsTotal(p.items);
  const stored = p.payment;

  const payment: PurchasePayment = !stored
    ? { createExpense: false, categoryId: null, merchant: "", parts: [{ cardId: null, amount: total }] }
    : isLegacy(stored)
      ? {
          createExpense: stored.createExpense,
          categoryId: stored.categoryId,
          merchant: stored.merchant,
          parts: [{ cardId: stored.cardId, amount: total }],
        }
      : stored;

  const body: PurchaseBody = {
    clientRequestId: p.clientRequestId,
    items: p.items,
    purchasedAt: p.createdAt,
    createExpense: payment.createExpense && payment.categoryId !== null,
    payments: payment.parts,
  };

  if (payment.categoryId !== null) body.expenseCategoryId = payment.categoryId;
  if (stored) body.merchant = payment.merchant;

  return body;
}

export function enqueuePurchase(items: PurchaseItemInput[], payment: PurchasePayment | null = null): PendingPurchase {
  const purchase: PendingPurchase = {
    clientRequestId: newId(),
    items,
    createdAt: new Date().toISOString(),
    payment,
  };
  savePending([...loadPending(), purchase]);
  return purchase;
}

// Un error que no depende de la compra: sin red, sesión vencida o servidor con problemas.
// En esos casos se conserva en la cola y se reintenta después.
export function shouldRetry(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: unknown } } | null)?.response;
  const status = response?.status;
  if (status === undefined) return true;
  // Un 403 sin JSON con "message" no es de la API: es la página de Azure cuando la app agota su cuota diaria.
  if (status === 403) return !(typeof response?.data === "object" && response.data !== null && "message" in response.data);
  return status === 401 || status === 408 || status === 429 || status >= 500;
}

let flushing: Promise<FlushResult> | null = null;

// Envía las compras pendientes en orden. Se detiene en el primer error que merece reintento.
// Si el servidor rechaza una compra (por ejemplo, datos no válidos) se aparta en otra lista
// para que no bloquee a las demás y no se pierda.
export function flushPending(
  send: (purchase: PendingPurchase) => Promise<void>,
  describeError: (error: unknown) => string = () => "Rechazada por el servidor"
): Promise<FlushResult> {
  if (flushing) return flushing;

  flushing = (async () => {
    let queue = loadPending();
    let sent = 0;
    let failed = 0;

    while (queue.length > 0) {
      const next = queue[0];
      try {
        await send(next);
        queue = queue.slice(1);
        sent++;
        savePending(queue);
      } catch (error) {
        if (shouldRetry(error)) break;

        queue = queue.slice(1);
        failed++;
        savePending(queue);
        writeJson(FAILED_KEY, [
          ...readJson<FailedPurchase[]>(FAILED_KEY, []),
          { purchase: next, error: describeError(error) },
        ]);
      }
    }

    return { sent, failed, remaining: queue.length };
  })().finally(() => {
    flushing = null;
  });

  return flushing;
}
