import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { Add, Delete, Edit } from "@mui/icons-material";
import api from "../api/client";
import { Product } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { errorMessage } from "../lib/errors";
import { normalizeBarcode } from "../lib/barcode";
import { formatMoney, formatQuantity } from "../lib/money";
import { STOCK_TYPES } from "../lib/units";

interface Draft {
  id?: number;
  name: string;
  description: string;
  barcode: string;
  quantity: string;
  price: string;
  imageUrl: string;
  stockType: number;
}

const EMPTY: Draft = { name: "", description: "", barcode: "", quantity: "0", price: "0", imageUrl: "", stockType: 0 };

const toDraft = (p: Product): Draft => ({
  id: p.id,
  name: p.name,
  description: p.description ?? "",
  barcode: p.barcode ?? "",
  quantity: String(p.quantity),
  price: String(p.price),
  imageUrl: p.imageUrl ?? "",
  stockType: p.stockType,
});

const ProductsAdmin = () => {
  const { isAdmin } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await api.get<Product[]>("/products");
      setProducts(response.data);
    } catch (error) {
      setMessage(errorMessage(error, "No se pudieron cargar los productos"));
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  if (!isAdmin) {
    return (
      <Box sx={{ position: "relative", zIndex: 1, p: 3 }}>
        <Typography>Acceso no autorizado</Typography>
      </Box>
    );
  }

  const save = async () => {
    if (!draft) return;

    const name = draft.name.trim();
    const quantity = Number(draft.quantity.replace(",", "."));
    const price = Number(draft.price.replace(",", "."));

    if (!name) return setFormError("El nombre es obligatorio");
    if (!Number.isFinite(quantity) || quantity < 0) return setFormError("El stock no es válido");
    if (!Number.isFinite(price) || price < 0) return setFormError("El precio no es válido");

    const payload = {
      id: draft.id,
      name,
      description: draft.description.trim(),
      barcode: normalizeBarcode(draft.barcode),
      quantity,
      price,
      imageUrl: draft.imageUrl.trim(),
      stockType: draft.stockType,
    };

    try {
      if (draft.id) {
        await api.put(`/products/${draft.id}`, payload);
      } else {
        await api.post("/products/CreateProduct", payload);
      }
      setDraft(null);
      setFormError("");
      setMessage(draft.id ? "Producto actualizado" : "Producto creado");
      load();
    } catch (error) {
      setFormError(errorMessage(error, "No se pudo guardar el producto"));
    }
  };

  const remove = async (product: Product) => {
    if (!window.confirm(`¿Eliminar ${product.name}?`)) return;

    try {
      await api.delete(`/products/${product.id}`);
      setMessage("Producto eliminado");
      load();
    } catch (error) {
      setMessage(errorMessage(error, "No se pudo eliminar el producto"));
    }
  };

  const update = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <Box sx={{ position: "relative", zIndex: 1, maxWidth: 960, mx: "auto", p: 2, pb: 6 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Typography component="h1" variant="h4">
          Productos
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => {
            setFormError("");
            setDraft(EMPTY);
          }}
        >
          Nuevo
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nombre</TableCell>
              <TableCell>Código</TableCell>
              <TableCell align="right">Stock</TableCell>
              <TableCell align="right">Precio</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id}>
                <TableCell>{product.name}</TableCell>
                <TableCell>{product.barcode ?? ""}</TableCell>
                <TableCell align="right">
                  {formatQuantity(product.quantity)} {product.unitOfMeasure}
                </TableCell>
                <TableCell align="right">{formatMoney(product.price)}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                  <IconButton
                    aria-label={`Editar ${product.name}`}
                    onClick={() => {
                      setFormError("");
                      setDraft(toDraft(product));
                    }}
                  >
                    <Edit color="primary" />
                  </IconButton>
                  <IconButton aria-label={`Eliminar ${product.name}`} onClick={() => remove(product)}>
                    <Delete color="error" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={draft !== null} onClose={() => setDraft(null)} fullWidth maxWidth="sm">
        <DialogTitle>{draft?.id ? "Editar producto" : "Nuevo producto"}</DialogTitle>
        <DialogContent>
          {formError && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {formError}
            </Alert>
          )}
          <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
            <TextField label="Nombre" value={draft?.name ?? ""} onChange={(e) => update({ name: e.target.value })} />
            <TextField
              label="Código de barras"
              value={draft?.barcode ?? ""}
              onChange={(e) => update({ barcode: e.target.value })}
              slotProps={{ htmlInput: { inputMode: "numeric" } }}
            />
            <TextField
              label="Descripción"
              multiline
              rows={2}
              value={draft?.description ?? ""}
              onChange={(e) => update({ description: e.target.value })}
            />
            <FormControl>
              <InputLabel id="stock-type-label">Se mide en</InputLabel>
              <Select
                labelId="stock-type-label"
                label="Se mide en"
                value={draft?.stockType ?? 0}
                onChange={(e) => update({ stockType: Number(e.target.value) })}
              >
                {STOCK_TYPES.map((t) => (
                  <MenuItem key={t.value} value={t.value}>
                    {t.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Stock"
              value={draft?.quantity ?? ""}
              onChange={(e) => update({ quantity: e.target.value })}
              slotProps={{ htmlInput: { inputMode: "decimal" } }}
            />
            <TextField
              label="Precio"
              value={draft?.price ?? ""}
              onChange={(e) => update({ price: e.target.value })}
              slotProps={{ htmlInput: { inputMode: "decimal" } }}
            />
            <TextField
              label="URL de la imagen"
              value={draft?.imageUrl ?? ""}
              onChange={(e) => update({ imageUrl: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDraft(null)}>Cancelar</Button>
          <Button variant="contained" onClick={save}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

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

export default ProductsAdmin;
