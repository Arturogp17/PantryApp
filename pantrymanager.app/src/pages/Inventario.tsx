import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import SearchIcon from "@mui/icons-material/Search";
import api from "../api/client";
import { Product } from "../types";
import { useAppTheme } from "../theme/ThemeContext";
import { rowStyle } from "../theme/rowStyle";
import { errorMessage } from "../lib/errors";
import { newId } from "../lib/id";
import { enqueueAction, isOfflineError, loadOutbox, removeWhere } from "../lib/outbox";
import { formatQuantity, roundQuantity } from "../lib/money";
import { unitLabel, unitStep } from "../lib/units";

const OFFLINE_SAVED = "Guardado sin conexión. Se subirá solo.";

// Último ajuste de stock pendiente de cada producto según la cola.
const queuedStock = (): Map<number, number> => {
  const pending = new Map<number, number>();
  for (const entry of loadOutbox()) {
    if (entry.action.kind === "stock") pending.set(entry.action.productId, entry.action.quantity);
  }
  return pending;
};

// El stock es un valor absoluto: un ajuste nuevo reemplaza al que siguiera en la cola.
const forgetQueuedStock = (productId: number) => {
  removeWhere((entry) => entry.action.kind === "stock" && entry.action.productId === productId);
};

// Inventario manual: se ajusta a mano, por ejemplo el día antes de ir al súper.
const Inventario = () => {
  const { tokens } = useAppTheme();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await api.get<Product[]>("/products");
      // Los ajustes hechos sin conexión se siguen mostrando hasta que se suban.
      const pending = queuedStock();
      setProducts(
        response.data.map((p) => (pending.has(p.id) ? { ...p, quantity: pending.get(p.id) ?? p.quantity } : p))
      );
    } catch (error) {
      setMessage(errorMessage(error, "No se pudo cargar el inventario"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onSynced = () => {
      void load();
    };
    window.addEventListener("outbox-synced", onSynced);
    return () => window.removeEventListener("outbox-synced", onSynced);
  }, [load]);

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return products
      .filter((p) => (term ? p.name.toLowerCase().includes(term) : true))
      .filter((p) => (onlyLow ? p.quantity <= 0 : true))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [products, filter, onlyLow]);

  // "queued" si quedó en la cola sin conexión. Otros errores revierten el cambio y avisan.
  const setStock = async (product: Product, quantity: number): Promise<"saved" | "queued" | "failed"> => {
    const value = Math.max(0, roundQuantity(quantity));
    const previous = product.quantity;

    // Se actualiza en pantalla de inmediato. Solo se revierte si el servidor responde con un error.
    setProducts((list) => list.map((p) => (p.id === product.id ? { ...p, quantity: value } : p)));

    try {
      await api.patch(`/products/${product.id}/stock`, { quantity: value });
      forgetQueuedStock(product.id);
      return "saved";
    } catch (error) {
      if (isOfflineError(error)) {
        forgetQueuedStock(product.id);
        enqueueAction({ kind: "stock", productId: product.id, quantity: value });
        return "queued";
      }
      setProducts((list) => list.map((p) => (p.id === product.id ? { ...p, quantity: previous } : p)));
      setMessage(errorMessage(error, "No se pudo guardar el cambio"));
      return "failed";
    }
  };

  const applyStock = async (product: Product, quantity: number) => {
    if ((await setStock(product, quantity)) === "queued") setMessage(OFFLINE_SAVED);
  };

  const finishEdit = (product: Product) => {
    if (!editing || editing.id !== product.id) return;

    const parsed = Number(editing.text.replace(",", "."));
    setEditing(null);

    if (editing.text.trim() !== "" && Number.isFinite(parsed) && parsed !== product.quantity) {
      void applyStock(product, parsed);
    }
  };

  // Agrega el producto a la lista. Devuelve true si quedó en la cola sin conexión.
  const sendToList = async (product: Product): Promise<boolean> => {
    const clientRequestId = newId();
    const body = {
      productId: product.id,
      barcode: product.barcode ?? null,
      stockType: product.stockType,
      quantity: 1,
    };

    try {
      await api.post("/shoppinglist", { ...body, clientRequestId });
      return false;
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      enqueueAction({ kind: "list-add", clientRequestId, body });
      return true;
    }
  };

  const markEmpty = async (product: Product) => {
    const stock = await setStock(product, 0);

    try {
      const listQueued = await sendToList(product);
      setMessage(
        stock === "queued" || listQueued ? OFFLINE_SAVED : `${product.name} se acabó y quedó en la lista`
      );
    } catch (error) {
      setMessage(errorMessage(error, "Quedó en 0, pero no se pudo agregar a la lista"));
    }
  };

  const addToList = async (product: Product) => {
    try {
      const queued = await sendToList(product);
      setMessage(queued ? OFFLINE_SAVED : `${product.name} agregado a la lista`);
    } catch (error) {
      setMessage(errorMessage(error, "No se pudo agregar a la lista"));
    }
  };

  return (
    <Box sx={{ position: "relative", zIndex: 1, maxWidth: 520, mx: "auto", px: 2, pt: 2, pb: 6 }}>
      <Typography component="h1" variant="h4" sx={{ lineHeight: 1.1 }}>
        Inventario
      </Typography>
      <Typography variant="body2" sx={{ mb: 2, color: "text.secondary" }}>
        Lo que hay en casa. Se ajusta a mano.
      </Typography>

      <TextField
        fullWidth
        size="small"
        placeholder="Buscar producto"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
        sx={{ bgcolor: tokens.surface, mb: 1 }}
      />

      <Box sx={{ mb: 2 }}>
        <Chip
          label="Solo los que se acabaron"
          clickable
          color={onlyLow ? "primary" : "default"}
          variant={onlyLow ? "filled" : "outlined"}
          onClick={() => setOnlyLow((v) => !v)}
        />
      </Box>

      {loading && <Typography sx={{ color: "text.secondary" }}>Cargando…</Typography>}

      {!loading && visible.length === 0 && (
        <Typography sx={{ color: "text.secondary" }}>
          {products.length === 0
            ? "Todavía no hay productos. Se crean solos al comprar o escanear."
            : "Sin resultados."}
        </Typography>
      )}

      {visible.map((product) => {
        const step = unitStep(product.stockType);
        const isEditing = editing?.id === product.id;
        const empty = product.quantity <= 0;

        return (
          <Box key={product.id} sx={{ py: 1, ...rowStyle(tokens), pr: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  sx={{
                    fontWeight: 700,
                    overflowWrap: "anywhere",
                    textTransform: tokens.uppercaseNames ? "uppercase" : "none",
                  }}
                >
                  {product.name}
                </Typography>
                <Typography variant="caption" sx={{ color: empty ? "error.main" : "text.secondary" }}>
                  {empty ? "Se acabó" : unitLabel(product.stockType)}
                </Typography>
              </Box>

              <IconButton
                aria-label={`Quitar de ${product.name}`}
                onClick={() => void applyStock(product, product.quantity - step)}
                disabled={empty}
                sx={{ width: 44, height: 44 }}
              >
                <RemoveIcon />
              </IconButton>

              <TextField
                size="small"
                value={isEditing ? editing.text : formatQuantity(product.quantity)}
                onFocus={(e) => {
                  setEditing({ id: product.id, text: String(product.quantity) });
                  e.target.select();
                }}
                onChange={(e) => setEditing({ id: product.id, text: e.target.value })}
                onBlur={() => finishEdit(product)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                slotProps={{
                  htmlInput: {
                    inputMode: "decimal",
                    "aria-label": `Cantidad de ${product.name}`,
                    style: { textAlign: "center", fontWeight: 800, width: 52, padding: "8px 4px" },
                  },
                }}
                sx={{ bgcolor: tokens.surface }}
              />

              <IconButton
                aria-label={`Sumar a ${product.name}`}
                onClick={() => void applyStock(product, product.quantity + step)}
                sx={{ width: 44, height: 44 }}
              >
                <AddIcon />
              </IconButton>
            </Box>

            <Box sx={{ display: "flex", gap: 1, mt: 0.5, justifyContent: "flex-end" }}>
              {!empty && (
                <Button size="small" onClick={() => markEmpty(product)}>
                  Se acabó
                </Button>
              )}
              <Button size="small" onClick={() => addToList(product)}>
                A la lista
              </Button>
            </Box>
          </Box>
        );
      })}

      <Snackbar
        open={message !== ""}
        autoHideDuration={4000}
        onClose={() => setMessage("")}
        message={message}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
};

export default Inventario;
