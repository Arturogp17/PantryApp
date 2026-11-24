import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/client";
import { ShoppingListItem, Suggestion } from "../types";
import { newId } from "../lib/id";
import { enqueueAction, isOfflineError, loadOutbox, removeWhere } from "../lib/outbox";
import { readJson, writeJson } from "../lib/storage";

const LIST_KEY = "pantry.list";
const MIN_AUTO_REFRESH_MS = 5000;
const UNKNOWN_NAME = "Producto sin nombre";

export interface AddToListInput {
  productId?: number | null;
  name?: string;
  barcode?: string | null;
  stockType?: number;
  quantity?: number;
}

// Renglón provisional: se agregó sin conexión y todavía no tiene id del servidor. Su id es negativo
// y el clientRequestId permite quitar el alta de la cola si el usuario lo borra antes de subirse.
type PendingRow = ShoppingListItem & { clientRequestId: string };

const isPendingRow = (item: ShoppingListItem): item is PendingRow =>
  item.id < 0 && typeof (item as Partial<PendingRow>).clientRequestId === "string";

// Id negativo y casi único para cada renglón provisional.
const provisionalId = (): number => -(Date.now() * 1000 + Math.floor(Math.random() * 1000));

// Lista de compras compartida (la guarda el servidor). La última copia se conserva en el teléfono
// para poder verla sin señal. Agregar o quitar sin conexión se guarda en la cola de envíos.
export function useShoppingList() {
  const [items, setItems] = useState<ShoppingListItem[]>(() => readJson<ShoppingListItem[]>(LIST_KEY, []));
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const lastRefresh = useRef(0);

  // La copia del teléfono incluye los renglones provisionales.
  useEffect(() => {
    writeJson(LIST_KEY, items);
  }, [items]);

  const refresh = useCallback(async () => {
    lastRefresh.current = Date.now();
    setRefreshing(true);
    try {
      const [list, suggested] = await Promise.all([
        api.get<ShoppingListItem[]>("/shoppinglist"),
        api.get<Suggestion[]>("/products/suggestions"),
      ]);
      const queue = loadOutbox();
      const queuedAdds = new Set(queue.flatMap((e) => (e.action.kind === "list-add" ? [e.action.clientRequestId] : [])));
      // Lo que se quitó sin conexión no debe reaparecer mientras no se suba.
      const removed = new Set(queue.flatMap((e) => (e.action.kind === "list-remove" ? [e.action.itemId] : [])));

      setItems((prev) => [
        ...list.data.filter((item) => !removed.has(item.id)),
        ...prev.filter((item) => isPendingRow(item) && queuedAdds.has(item.clientRequestId)),
      ]);
      setSuggestions(suggested.data);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // La lista la comparte otra persona, así que se vuelve a pedir al servidor cuando la app
  // regresa a primer plano o vuelve la señal. Se espera un mínimo entre consultas para no
  // repetirlas (cada una despierta la base gratuita).
  useEffect(() => {
    const refreshIfStale = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefresh.current < MIN_AUTO_REFRESH_MS) return;
      void refresh();
    };
    document.addEventListener("visibilitychange", refreshIfStale);
    window.addEventListener("focus", refreshIfStale);
    window.addEventListener("online", refreshIfStale);
    return () => {
      document.removeEventListener("visibilitychange", refreshIfStale);
      window.removeEventListener("focus", refreshIfStale);
      window.removeEventListener("online", refreshIfStale);
    };
  }, [refresh]);

  // Al subirse la cola, el servidor ya tiene los cambios: se vuelve a pedir la lista.
  useEffect(() => {
    const onSynced = () => {
      void refresh();
    };
    window.addEventListener("outbox-synced", onSynced);
    return () => window.removeEventListener("outbox-synced", onSynced);
  }, [refresh]);

  const add = useCallback(
    async (input: AddToListInput) => {
      const clientRequestId = newId();
      const productId = input.productId ?? null;
      const body = {
        productId,
        name: input.name,
        barcode: input.barcode ?? null,
        stockType: input.stockType ?? 0,
        quantity: input.quantity ?? 1,
      };

      try {
        await api.post("/shoppinglist", { ...body, clientRequestId });
      } catch (error) {
        if (!isOfflineError(error)) throw error;

        enqueueAction({ kind: "list-add", clientRequestId, body });

        // Un producto de la sugerencia llega sin nombre: se toma del de la lista o de las sugerencias.
        const known =
          productId === null
            ? undefined
            : [...suggestions, ...items].find((s) => s.productId === productId);
        const row: PendingRow = {
          id: provisionalId(),
          productId: productId ?? 0,
          name: input.name ?? known?.name ?? UNKNOWN_NAME,
          barcode: body.barcode,
          imageUrl: "",
          quantity: body.quantity,
          stockType: body.stockType,
          unitOfMeasure: "",
          lastPrice: 0,
          stock: 0,
          addedBy: "",
          clientRequestId,
        };
        setItems((prev) => [...prev, row]);
        return;
      }

      await refresh();
    },
    [refresh, items, suggestions]
  );

  const remove = useCallback(
    async (id: number) => {
      // Renglón provisional: no hay nada que quitar en el servidor; se saca también su alta de la cola.
      if (id < 0) {
        const row = items.find((item) => item.id === id);
        if (row && isPendingRow(row)) {
          removeWhere((e) => e.action.kind === "list-add" && e.action.clientRequestId === row.clientRequestId);
        }
        setItems((prev) => prev.filter((item) => item.id !== id));
        return;
      }

      try {
        await api.delete(`/shoppinglist/${id}`);
      } catch (error) {
        if (!isOfflineError(error)) throw error;

        enqueueAction({ kind: "list-remove", itemId: id });
        setItems((prev) => prev.filter((item) => item.id !== id));
        return;
      }

      await refresh();
    },
    [refresh, items]
  );

  return { items, suggestions, loading, offline, refreshing, refresh, add, remove };
}
