import api from "../api/client";
import type { CardPaymentInput } from "../types";
import { errorMessage } from "./errors";
import { newId } from "./id";
import { roundMoney } from "./money";
import { readJson, writeJson } from "./storage";

// Cola general de acciones sin conexión (gastos, pagos a tarjeta, lista del súper, existencias).
// Cada acción se guarda en el teléfono y se envía en orden cuando vuelve la conexión.
// Las compras del súper tienen su propia cola en offlineQueue.ts.

export type OutboxAction =
  | { kind: "expense"; body: Record<string, unknown> } // body es el JSON de POST /expenses e incluye clientRequestId
  | { kind: "card-payment"; body: CardPaymentInput } // POST /card-payments; el body ya trae clientRequestId
  | { kind: "list-add"; clientRequestId: string; body: { productId: number | null; name?: string; barcode: string | null; stockType: number; quantity: number } } // POST /shoppinglist, el body lleva clientRequestId
  | { kind: "list-remove"; itemId: number } // DELETE /shoppinglist/{id}
  | { kind: "stock"; productId: number; quantity: number }; // PATCH /products/{id}/stock con { quantity }

export interface OutboxEntry {
  id: string;
  action: OutboxAction;
  createdAt: string;
}

export interface OutboxFailure {
  entry: OutboxEntry;
  error: string;
}

export interface OutboxFlushResult {
  sent: number;
  failed: number;
  remaining: number;
}

const OUTBOX_KEY = "pantry.outbox";
const FAILED_KEY = "pantry.outboxFailed";

const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

const saveOutbox = (queue: OutboxEntry[]) => {
  writeJson(OUTBOX_KEY, queue);
  notify();
};

const saveFailures = (failures: OutboxFailure[]) => {
  writeJson(FAILED_KEY, failures);
  notify();
};

export const loadOutbox = (): OutboxEntry[] => readJson<OutboxEntry[]>(OUTBOX_KEY, []);

export const loadOutboxFailures = (): OutboxFailure[] => readJson<OutboxFailure[]>(FAILED_KEY, []);

export function enqueueAction(action: OutboxAction): OutboxEntry {
  const entry: OutboxEntry = {
    id: newId(),
    action,
    createdAt: new Date().toISOString(),
  };
  saveOutbox([...loadOutbox(), entry]);
  return entry;
}

// Quita de la cola las entradas que cumplan el predicado y devuelve cuántas quitó.
export function removeWhere(predicate: (entry: OutboxEntry) => boolean): number {
  const queue = loadOutbox();
  const kept = queue.filter((entry) => !predicate(entry));
  const removed = queue.length - kept.length;
  if (removed > 0) saveOutbox(kept);
  return removed;
}

export function discardFailures(): void {
  saveFailures([]);
}

// Lo que hay en cola para una tarjeta con fecha posterior al corte (periodEnd), en pesos.
export function queuedCardPaid(queue: OutboxEntry[], cardId: number, periodEnd: string): number {
  const total = queue.reduce((sum, entry) => {
    const action = entry.action;
    if (action.kind !== "card-payment") return sum;
    return action.body.cardId === cardId && action.body.date > periodEnd ? sum + action.body.amount : sum;
  }, 0);
  return roundMoney(total);
}

const statusOf = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } } | null | undefined)?.response?.status;

// Un 403 con cuerpo JSON que trae "message" es un rechazo real de la API. Cualquier otro 403
// (por ejemplo la página HTML de Azure cuando se agota la cuota diaria) se reintenta.
const isApiMessage = (data: unknown): boolean =>
  typeof data === "object" && data !== null && "message" in data;

// true: no se pudo hablar con el servidor, así que conviene dejar la acción en la cola y reintentar.
export function isOfflineError(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: unknown } } | null | undefined)?.response;
  // Sin respuesta solo cuenta como falta de conexión si lo reportó axios; un error de código no debe bloquear la cola.
  if (!response) return (error as { isAxiosError?: boolean } | null | undefined)?.isAxiosError === true;

  const { status, data } = response;
  if (status === 403) return !isApiMessage(data);
  return status === 401 || status === 408 || status === 429 || (status !== undefined && status >= 500);
}

// Respuestas que significan que la acción ya estaba aplicada en el servidor.
function alreadyDone(action: OutboxAction, error: unknown): boolean {
  const status = statusOf(error);
  if (action.kind === "list-remove") return status === 404;
  if (action.kind === "expense" || action.kind === "card-payment") return status === 409;
  return false;
}

async function sendAction(action: OutboxAction): Promise<void> {
  switch (action.kind) {
    case "expense":
      await api.post("/expenses", action.body);
      return;
    case "card-payment":
      await api.post("/card-payments", action.body);
      return;
    case "list-add":
      await api.post("/shoppinglist", { ...action.body, clientRequestId: action.clientRequestId });
      return;
    case "list-remove":
      await api.delete(`/shoppinglist/${action.itemId}`);
      return;
    case "stock":
      await api.patch(`/products/${action.productId}/stock`, { quantity: action.quantity });
      return;
  }
}

let flushing: Promise<OutboxFlushResult> | null = null;

async function runFlush(): Promise<OutboxFlushResult> {
  let sent = 0;
  let failed = 0;

  // Siempre se vuelve a leer la cola: mientras se envía pueden agregarse o quitarse entradas.
  for (;;) {
    const head = loadOutbox()[0];
    if (!head) break;

    try {
      await sendAction(head.action);
      sent++;
    } catch (error) {
      if (isOfflineError(error)) break;

      if (alreadyDone(head.action, error)) {
        sent++;
      } else {
        failed++;
        saveFailures([
          ...loadOutboxFailures(),
          { entry: head, error: errorMessage(error, "Rechazada por el servidor") },
        ]);
      }
    }

    saveOutbox(loadOutbox().filter((entry) => entry.id !== head.id));
  }

  const result: OutboxFlushResult = { sent, failed, remaining: loadOutbox().length };
  notify();
  return result;
}

// Envía la cola en orden. Una sola ejecución a la vez: si ya hay una en curso, devuelve la misma.
export function flushOutbox(): Promise<OutboxFlushResult> {
  if (flushing) return flushing;
  flushing = runFlush().finally(() => {
    flushing = null;
  });
  return flushing;
}

// Avisa cuando cambia la cola o los fallidos. Devuelve la función para cancelar la suscripción.
export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
