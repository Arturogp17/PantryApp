import { useCallback, useEffect, useState } from "react";
import api from "../api/client";
import { Product } from "../types";
import { readJson, writeJson } from "../lib/storage";

const CATALOG_KEY = "pantry.catalog";

// Catálogo de productos guardado también en el teléfono: permite reconocer códigos de barras
// y sugerir nombres aunque no haya señal dentro del súper.
export function useCatalog() {
  const [products, setProducts] = useState<Product[]>(() => readJson<Product[]>(CATALOG_KEY, []));

  const refresh = useCallback(async () => {
    try {
      const response = await api.get<Product[]>("/products");
      setProducts(response.data);
      writeJson(CATALOG_KEY, response.data);
    } catch {
      // Sin conexión: se queda el catálogo guardado.
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const findByBarcode = useCallback(
    (code: string): Product | undefined => products.find((p) => p.barcode === code),
    [products]
  );

  const search = useCallback(
    (text: string, limit = 5): Product[] => {
      const term = text.trim().toLowerCase();
      if (term.length < 2) return [];
      return products.filter((p) => p.name.toLowerCase().includes(term)).slice(0, limit);
    },
    [products]
  );

  return { products, refresh, findByBarcode, search };
}
