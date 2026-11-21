import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import { Product } from "../types";
import { STOCK_TYPES, unitLabel, unitStep } from "../lib/units";
import { formatMoney } from "../lib/money";
import { PROMO_OPTIONS, Promo, PromoType, isValidPromo, promoLabel, promoTotal } from "../lib/promo";

// Un producto que se va a poner en el carrito o en la lista.
export interface ItemDraft {
  productId: number | null;
  barcode: string | null;
  name: string;
  stockType: number;
  quantity: number;
  unitPrice: number | null;
  imageUrl?: string | null;
  promo?: Promo;
  // Cuando el producto ya está definido (viene de la lista o del catálogo) no se puede cambiar el nombre.
  lockProduct: boolean;
}

interface ItemDialogProps {
  open: boolean;
  // "cart" pide precio (se pone en el carrito); "list" solo nombre y cantidad (se agrega a la lista).
  mode: "cart" | "list";
  title: string;
  draft: ItemDraft | null;
  findMatches: (text: string) => Product[];
  onClose: () => void;
  onSubmit: (draft: ItemDraft) => void;
}

const toNumber = (text: string): number => Number(text.replace(",", "."));

const ItemDialog = ({ open, mode, title, draft, findMatches, onClose, onSubmit }: ItemDialogProps) => {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [stockType, setStockType] = useState(0);
  const [productId, setProductId] = useState<number | null>(null);
  const [barcode, setBarcode] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null | undefined>(null);
  const [touched, setTouched] = useState(false);
  const [promoType, setPromoType] = useState<PromoType | "">("");
  const [promoBuy, setPromoBuy] = useState("");
  const [promoValue, setPromoValue] = useState("");

  useEffect(() => {
    if (!open || !draft) return;
    setName(draft.name);
    setQuantity(String(draft.quantity));
    setPrice(draft.unitPrice && draft.unitPrice > 0 ? String(draft.unitPrice) : "");
    setStockType(draft.stockType);
    setProductId(draft.productId);
    setBarcode(draft.barcode);
    setImageUrl(draft.imageUrl);
    setPromoType(draft.promo?.type ?? "");
    setPromoBuy(draft.promo?.buy ? String(draft.promo.buy) : "");
    setPromoValue(draft.promo ? String(draft.promo.value) : "");
    setTouched(false);
  }, [open, draft]);

  if (!draft) return null;

  const locked = draft.lockProduct;
  const matches = !locked && productId === null ? findMatches(name) : [];

  const qtyValue = toNumber(quantity);
  const priceValue = toNumber(price);
  const nameError = name.trim().length === 0;
  const qtyError = !(qtyValue > 0);
  const priceError = mode === "cart" && !(priceValue > 0);

  const promo: Promo | undefined =
    promoType === ""
      ? undefined
      : {
          type: promoType,
          buy: promoType === "nxm" || promoType === "pack" ? toNumber(promoBuy) : promoType === "second" ? 2 : undefined,
          value: toNumber(promoValue),
        };
  const promoError = promo !== undefined && !isValidPromo(promo);
  const invalid = nameError || qtyError || priceError || promoError;

  const applyPreset = (type: PromoType, buy: number | undefined, value: number) => {
    setPromoType(type);
    setPromoBuy(buy ? String(buy) : "");
    setPromoValue(String(value));
  };

  const pick = (product: Product) => {
    setName(product.name);
    setProductId(product.id);
    setBarcode(product.barcode ?? barcode);
    setStockType(product.stockType);
    setImageUrl(product.formattedImageUrl);
    if (product.price > 0) setPrice(String(product.price));
  };

  const submit = () => {
    setTouched(true);
    if (invalid) return;

    onSubmit({
      productId,
      barcode,
      name: name.trim(),
      stockType,
      quantity: qtyValue,
      unitPrice: mode === "cart" ? priceValue : null,
      promo: mode === "cart" ? promo : undefined,
      imageUrl,
      lockProduct: locked,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            label="Producto"
            value={name}
            disabled={locked}
            autoFocus={!locked}
            onChange={(e) => {
              setName(e.target.value);
              // Al escribir de nuevo se suelta el producto elegido.
              if (productId !== null && !locked) setProductId(null);
            }}
            error={touched && nameError}
            helperText={touched && nameError ? "Escribe el nombre" : barcode ? `Código ${barcode}` : undefined}
            fullWidth
          />

          {matches.length > 0 && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {matches.map((product) => (
                <Chip key={product.id} label={product.name} onClick={() => pick(product)} />
              ))}
            </Box>
          )}

          <Box sx={{ display: "flex", gap: 2 }}>
            <TextField
              label={`Cantidad (${unitLabel(stockType)})`}
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              slotProps={{ htmlInput: { min: 0, step: unitStep(stockType) === 1 ? 1 : 0.1, inputMode: "decimal" } }}
              error={touched && qtyError}
              helperText={touched && qtyError ? "Mayor a 0" : undefined}
              fullWidth
            />
            {mode === "cart" && (
              <TextField
                label="Precio unitario"
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                slotProps={{ htmlInput: { min: 0, step: 0.01, inputMode: "decimal" } }}
                error={touched && priceError}
                helperText={touched && priceError ? "Mayor a 0" : undefined}
                fullWidth
              />
            )}
          </Box>

          {!locked && productId === null && (
            <TextField
              select
              label="Se mide en"
              value={stockType}
              onChange={(e) => setStockType(Number(e.target.value))}
              fullWidth
            >
              {STOCK_TYPES.map((type) => (
                <MenuItem key={type.value} value={type.value}>
                  {type.label}
                </MenuItem>
              ))}
            </TextField>
          )}

          {mode === "cart" && (
            <>
              <TextField
                select
                label="Promoción"
                value={promoType}
                onChange={(e) => {
                  setPromoType(e.target.value as PromoType | "");
                  setPromoBuy("");
                  setPromoValue("");
                }}
                fullWidth
              >
                <MenuItem value="">Sin promoción</MenuItem>
                {PROMO_OPTIONS.map((option) => (
                  <MenuItem key={option.type} value={option.type}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>

              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                <Chip label="2x1" onClick={() => applyPreset("nxm", 2, 1)} />
                <Chip label="3x2" onClick={() => applyPreset("nxm", 3, 2)} />
                <Chip label="2º al 50%" onClick={() => applyPreset("second", undefined, 50)} />
              </Box>

              {(promoType === "nxm" || promoType === "pack") && (
                <Box sx={{ display: "flex", gap: 2 }}>
                  <TextField
                    label={promoType === "nxm" ? "Lleva" : "Cantidad"}
                    value={promoBuy}
                    onChange={(e) => setPromoBuy(e.target.value)}
                    slotProps={{ htmlInput: { inputMode: "numeric" } }}
                    fullWidth
                  />
                  <TextField
                    label={promoType === "nxm" ? "Paga" : "Precio total"}
                    value={promoValue}
                    onChange={(e) => setPromoValue(e.target.value)}
                    slotProps={{ htmlInput: { inputMode: "decimal" } }}
                    fullWidth
                  />
                </Box>
              )}

              {(promoType === "second" || promoType === "percent") && (
                <TextField
                  label="% de descuento"
                  value={promoValue}
                  onChange={(e) => setPromoValue(e.target.value)}
                  slotProps={{ htmlInput: { inputMode: "decimal" } }}
                  fullWidth
                />
              )}

              {touched && promoError && (
                <Typography variant="body2" sx={{ color: "error.main" }}>
                  La promoción no es válida. Revisa los números.
                </Typography>
              )}

              {!qtyError && !priceError && (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  Subtotal: {formatMoney(promoTotal(qtyValue, priceValue, promoError ? undefined : promo))}
                  {promo && !promoError ? ` (${promoLabel(promo)})` : ""}
                </Typography>
              )}
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button onClick={submit} variant="contained">
          {mode === "cart" ? "Al carrito" : "A la lista"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ItemDialog;
