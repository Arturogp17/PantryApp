import { useCallback, useEffect, useState } from "react";
import api from "../api/client";
import { ShoppingListItem, Suggestion } from "../types";
import { readJson, writeJson } from "../lib/storage";

const LIST_KEY = "pantry.list";

export interface AddToListInput {
  productId?: number | null;
  name?: string;
  barcode?: string | null;
  stockType?: number;
  quantity?: number;
}

// Lista de compras compartida (la guarda el servidor). La última copia se conserva en el teléfono
// para poder verla sin señal; agregar o quitar productos de la lista sí requiere conexión.
export function useShoppingList() {
  const [items, setItems] = useState<ShoppingListItem[]>(() => readJson<ShoppingListItem[]>(LIST_KEY, []));
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [list, suggested] = await Promise.all([
        api.get<ShoppingListItem[]>("/shoppinglist"),
        api.get<Suggestion[]>("/products/suggestions"),
      ]);
      setItems(list.data);
      writeJson(LIST_KEY, list.data);
      setSuggestions(suggested.data);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = useCallback(
    async (input: AddToListInput) => {
      await api.post("/shoppinglist", {
        productId: input.productId ?? null,
        name: input.name,
        barcode: input.barcode ?? null,
        stockType: input.stockType ?? 0,
        quantity: input.quantity ?? 1,
      });
      await refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: number) => {
      await api.delete(`/shoppinglist/${id}`);
      await refresh();
    },
    [refresh]
  );

  return { items, suggestions, loading, offline, refresh, add, remove };
}
