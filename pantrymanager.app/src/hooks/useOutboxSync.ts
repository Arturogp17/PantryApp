import { useCallback, useEffect, useState } from "react";
import api from "../api/client";
import { errorMessage } from "../lib/errors";
import { flushPending, purchaseBody } from "../lib/offlineQueue";
import {
  flushOutbox,
  loadOutbox,
  loadOutboxFailures,
  subscribeOutbox,
} from "../lib/outbox";

const RETRY_MS = 60_000;

export interface OutboxSync {
  pending: number;
  failures: number;
  syncing: boolean;
  syncNow: () => Promise<void>;
}

// Sincroniza la cola general de acciones sin conexión y después las compras del súper
// (misma cola que usa Super.tsx).
export function useOutboxSync(): OutboxSync {
  const [pending, setPending] = useState(() => loadOutbox().length);
  const [failures, setFailures] = useState(() => loadOutboxFailures().length);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setPending(loadOutbox().length);
      setFailures(loadOutboxFailures().length);
    };
    refresh();
    return subscribeOutbox(refresh);
  }, []);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      // Primero la cola general: un ajuste de stock es un valor absoluto calculado sin saber de las compras
      // pendientes, y debe aplicarse antes de que la compra sume lo comprado.
      const result = await flushOutbox();
      // Mismo envío que Super.tsx: cada compra lleva su clientRequestId, así que reenviarla es seguro.
      const purchases = await flushPending(
        async (purchase) => {
          await api.post("/purchases", purchaseBody(purchase));
        },
        (error) => errorMessage(error, "Rechazada por el servidor")
      );

      if (purchases.sent > 0 || result.sent > 0) {
        window.dispatchEvent(new CustomEvent("outbox-synced"));
      }
    } catch {
      // Los errores de envío ya quedan en la cola; aquí no hay nada más que hacer.
    } finally {
      setSyncing(false);
    }
  }, []);

  // Al montar, al volver la señal y al volver a primer plano.
  useEffect(() => {
    void syncNow();

    const onOnline = () => void syncNow();
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncNow();
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [syncNow]);

  // Mientras haya pendientes, reintenta cada minuto con la pestaña visible.
  useEffect(() => {
    if (pending === 0) return;

    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void syncNow();
    }, RETRY_MS);
    return () => window.clearInterval(id);
  }, [pending, syncNow]);

  return { pending, failures, syncing, syncNow };
}
