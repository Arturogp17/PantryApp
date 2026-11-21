import { PurchaseItemInput } from "../types";
import { newId } from "./id";
import { readJson, writeJson } from "./storage";

// Compras terminadas sin señal. Se guardan en el teléfono y se mandan al volver la conexión.
// Cada una lleva un clientRequestId: si el servidor ya la guardó, reenviarla no la duplica.
export interface PendingPurchase {
  clientRequestId: string;
  items: PurchaseItemInput[];
  createdAt: string;
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

export function enqueuePurchase(items: PurchaseItemInput[]): PendingPurchase {
  const purchase: PendingPurchase = {
    clientRequestId: newId(),
    items,
    createdAt: new Date().toISOString(),
  };
  savePending([...loadPending(), purchase]);
  return purchase;
}

// Un error que no depende de la compra: sin red, sesión vencida o servidor con problemas.
// En esos casos se conserva en la cola y se reintenta después.
export function shouldRetry(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  if (status === undefined) return true;
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
