import { ReactNode, useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Snackbar,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import api from "../api/client";
import BarcodeScanner from "../components/BarcodeScanner";
import ItemDialog, { ItemDraft } from "../components/ItemDialog";
import { useAppTheme } from "../theme/ThemeContext";
import { rowStyle } from "../theme/rowStyle";
import { useCatalog } from "../hooks/useCatalog";
import { useShoppingList } from "../hooks/useShoppingList";
import { BarcodeLookup, ShoppingListItem } from "../types";
import { CartLine, addLine, cartTotal, lineSavings, lineTotal, removeLine, toPurchaseItems, updateLine } from "../lib/cart";
import { errorMessage } from "../lib/errors";
import { promoLabel } from "../lib/promo";
import { formatMoney, formatQuantity, roundMoney } from "../lib/money";
import { FlushResult, enqueuePurchase, flushPending, loadPending } from "../lib/offlineQueue";
import { readJson, writeJson } from "../lib/storage";
import { unitLabel } from "../lib/units";

const CART_KEY = "pantry.cart";

interface DialogState {
  mode: "cart" | "list";
  title: string;
  draft: ItemDraft;
  editingKey?: string;
}

interface SnackState {
  severity: "success" | "info" | "error";
  message: string;
}

interface RowProps {
  title: string;
  detail: string;
  amount?: string;
  openLabel: string;
  removeLabel: string;
  dashed?: boolean;
  actionIcon?: ReactNode;
  onOpen: () => void;
  onRemove: () => void;
}

// Un renglón de la pantalla: texto que se puede tocar para abrirlo y un botón para quitarlo.
const Row = ({ title, detail, amount, openLabel, removeLabel, dashed, actionIcon, onOpen, onRemove }: RowProps) => {
  const { tokens } = useAppTheme();

  const style = rowStyle(tokens, dashed);

  return (
    <Box sx={{ display: "flex", alignItems: "center", minHeight: 56, ...style }}>
      <ButtonBase
        onClick={onOpen}
        aria-label={`${openLabel}: ${title}`}
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 56,
          justifyContent: "space-between",
          textAlign: "left",
          gap: 1.5,
          py: 0.5,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontWeight: 700,
              lineHeight: 1.25,
              textTransform: tokens.uppercaseNames ? "uppercase" : "none",
            }}
          >
            {title}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {detail}
          </Typography>
        </Box>
        {amount && <Typography sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>{amount}</Typography>}
      </ButtonBase>
      <IconButton aria-label={removeLabel} onClick={onRemove} size="small">
        {actionIcon ?? <CloseIcon fontSize="small" />}
      </IconButton>
    </Box>
  );
};

const SectionTitle = ({ children, action }: { children: string; action?: ReactNode }) => (
  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 3, mb: 0.5 }}>
    <Typography
      component="h2"
      sx={{ fontSize: "0.8125rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}
    >
      {children}
    </Typography>
    {action}
  </Box>
);

const Super = () => {
  const { tokens } = useAppTheme();
  const {
    items,
    suggestions,
    offline: listOffline,
    refresh: refreshList,
    add: addToList,
    remove: removeFromList,
  } = useShoppingList();
  const { findByBarcode, search, refresh: refreshCatalog } = useCatalog();

  const [cart, setCart] = useState<CartLine[]>(() => readJson<CartLine[]>(CART_KEY, []));
  const [pendingCount, setPendingCount] = useState(() => loadPending().length);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [snack, setSnack] = useState<SnackState | null>(null);

  useEffect(() => {
    writeJson(CART_KEY, cart);
  }, [cart]);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Manda las compras guardadas en el teléfono. Es seguro repetirlo: cada compra lleva un id
  // y el servidor no registra dos veces la misma.
  const sync = useCallback(async (): Promise<FlushResult> => {
    const result = await flushPending(
      async (purchase) => {
        await api.post("/purchases", {
          clientRequestId: purchase.clientRequestId,
          items: purchase.items,
        });
      },
      (error) => errorMessage(error, "Rechazada por el servidor")
    );

    setPendingCount(result.remaining);

    if (result.sent > 0) {
      void refreshList();
      void refreshCatalog();
    }
    if (result.failed > 0) {
      setSnack({
        severity: "error",
        message: `${result.failed} compra(s) fueron rechazadas por el servidor y quedaron guardadas en el teléfono.`,
      });
    }
    return result;
  }, [refreshList, refreshCatalog]);

  useEffect(() => {
    if (online) void sync();
  }, [online, sync]);

  const total = cartTotal(cart);
  const savings = roundMoney(cart.reduce((acc, line) => acc + lineSavings(line), 0));
  const toFind = items.filter((item) => !cart.some((line) => line.productId === item.productId));

  const openDraft = (state: DialogState) => setDialog(state);

  const blankDraft = (barcode: string | null = null): ItemDraft => ({
    productId: null,
    barcode,
    name: "",
    stockType: 0,
    quantity: 1,
    unitPrice: null,
    lockProduct: false,
  });

  const openForListItem = (item: ShoppingListItem) =>
    openDraft({
      mode: "cart",
      title: "Poner en el carrito",
      draft: {
        productId: item.productId,
        barcode: item.barcode,
        name: item.name,
        stockType: item.stockType,
        quantity: item.quantity,
        unitPrice: item.lastPrice > 0 ? item.lastPrice : null,
        imageUrl: item.imageUrl,
        lockProduct: true,
      },
    });

  const openForCartLine = (line: CartLine) =>
    openDraft({
      mode: "cart",
      title: "Editar renglón",
      editingKey: line.key,
      draft: {
        productId: line.productId,
        barcode: line.barcode,
        name: line.name,
        stockType: line.stockType,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        promo: line.promo,
        imageUrl: line.imageUrl,
        lockProduct: true,
      },
    });

  const handleCode = async (code: string) => {
    setScannerOpen(false);

    // Primero en el catálogo guardado en el teléfono (funciona sin señal).
    const known = findByBarcode(code);
    if (known) {
      openDraft({
        mode: "cart",
        title: "Poner en el carrito",
        draft: {
          productId: known.id,
          barcode: code,
          name: known.name,
          stockType: known.stockType,
          quantity: 1,
          unitPrice: known.price > 0 ? known.price : null,
          imageUrl: known.formattedImageUrl,
          lockProduct: true,
        },
      });
      return;
    }

    setLookingUp(true);
    try {
      const { data } = await api.get<BarcodeLookup>(`/barcode/${code}`);
      openDraft({
        mode: "cart",
        title: "Poner en el carrito",
        draft: {
          productId: data.productId,
          barcode: code,
          name: data.name,
          stockType: data.stockType ?? 0,
          quantity: 1,
          unitPrice: data.price && data.price > 0 ? data.price : null,
          imageUrl: data.imageUrl,
          lockProduct: data.source === "catalog",
        },
      });
    } catch {
      openDraft({ mode: "cart", title: "Producto nuevo", draft: blankDraft(code) });
      setSnack({
        severity: "info",
        message: "No encontré ese código. Escribe el nombre una vez y la próxima ya lo reconoce.",
      });
    } finally {
      setLookingUp(false);
    }
  };

  const submitDialog = async (draft: ItemDraft) => {
    if (!dialog) return;

    if (dialog.mode === "list") {
      try {
        await addToList({
          productId: draft.productId,
          name: draft.name,
          barcode: draft.barcode,
          stockType: draft.stockType,
          quantity: draft.quantity,
        });
        setDialog(null);
        setSnack({ severity: "success", message: `${draft.name} agregado a la lista.` });
      } catch (error) {
        setSnack({ severity: "error", message: errorMessage(error, "No se pudo agregar a la lista.") });
      }
      return;
    }

    const price = draft.unitPrice ?? 0;
    const editingKey = dialog.editingKey;

    if (editingKey) {
      setCart((prev) => updateLine(prev, editingKey, { quantity: draft.quantity, unitPrice: price, promo: draft.promo }));
    } else {
      setCart((prev) =>
        addLine(prev, {
          productId: draft.productId,
          name: draft.name,
          barcode: draft.barcode,
          stockType: draft.stockType,
          quantity: draft.quantity,
          unitPrice: price,
          promo: draft.promo,
          imageUrl: draft.imageUrl,
        })
      );
    }
    setDialog(null);
  };

  const removeFromListSafe = async (item: ShoppingListItem) => {
    try {
      await removeFromList(item.id);
    } catch (error) {
      setSnack({ severity: "error", message: errorMessage(error, "No se pudo quitar de la lista.") });
    }
  };

  const addSuggestion = async (productId: number, name: string) => {
    try {
      await addToList({ productId });
      setSnack({ severity: "success", message: `${name} agregado a la lista.` });
    } catch (error) {
      setSnack({ severity: "error", message: errorMessage(error, "No se pudo agregar a la lista.") });
    }
  };

  // La compra se guarda primero en el teléfono y después se envía: si falla la señal
  // o se cierra la app, no se pierde.
  const finishPurchase = async () => {
    setConfirmOpen(false);
    if (cart.length === 0) return;

    enqueuePurchase(toPurchaseItems(cart));
    setCart([]);
    setPendingCount(loadPending().length);

    const result = await sync();
    if (result.remaining === 0 && result.sent > 0) {
      setSnack({ severity: "success", message: "Compra registrada y existencias actualizadas." });
    } else if (result.remaining > 0) {
      setSnack({
        severity: "info",
        message: "No se pudo enviar ahora. La compra quedó guardada en tu teléfono y se reenviará sola.",
      });
    }
  };

  const heroRadius = Math.round(tokens.radius * 1.4);

  return (
    <Box sx={{ position: "relative", zIndex: 1, maxWidth: 520, mx: "auto", px: 2, pt: 2, pb: "150px" }}>
      <Typography component="h1" variant="h4" sx={{ lineHeight: 1.1 }}>
        Súper
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Lista compartida
      </Typography>

      {(!online || listOffline) && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          Sin conexión con el servidor. El carrito se guarda en tu teléfono y la lista puede estar desactualizada.
        </Alert>
      )}
      {pendingCount > 0 && (
        <Alert
          severity="info"
          sx={{ mt: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => void sync()}>
              Enviar
            </Button>
          }
        >
          {pendingCount === 1 ? "Hay 1 compra" : `Hay ${pendingCount} compras`} sin enviar al servidor.
        </Alert>
      )}

      <Box
        sx={{
          mt: 2,
          p: 2.5,
          bgcolor: tokens.heroBg,
          color: tokens.heroText,
          borderRadius: `${heroRadius}px`,
          border: tokens.border,
          boxShadow: tokens.shadow,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: "0.875rem", color: tokens.heroLabel }}>Llevas</Typography>
          <Typography
            component="p"
            aria-live="polite"
            sx={{
              m: 0,
              fontFamily: tokens.fontDisplay,
              fontSize: `${tokens.totalSize / 16}rem`,
              fontWeight: tokens.totalWeight,
              letterSpacing: tokens.totalTracking,
              lineHeight: 1.1,
            }}
          >
            {formatMoney(total)}
          </Typography>
          {savings > 0 && (
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 700, color: tokens.heroLabel }}>
              Ahorras {formatMoney(savings)} con promociones
            </Typography>
          )}
        </Box>
        <Typography sx={{ fontWeight: 800, fontSize: "0.875rem", color: tokens.heroLabel, whiteSpace: "nowrap", pb: 0.5 }}>
          {cart.length} de {cart.length + toFind.length}
        </Typography>
      </Box>

      <SectionTitle>En el carrito</SectionTitle>
      {cart.length === 0 ? (
        <Typography sx={{ py: 1, color: "text.secondary" }}>
          Escanea un producto o toca uno de la lista para ponerlo aquí.
        </Typography>
      ) : (
        <>
          {cart.map((line) => (
            <Row
              key={line.key}
              title={line.name}
              detail={`${formatQuantity(line.quantity)} ${unitLabel(line.stockType)} × ${formatMoney(line.unitPrice)}${
                line.promo ? ` · ${promoLabel(line.promo)}` : ""
              }`}
              amount={formatMoney(lineTotal(line))}
              openLabel="Editar"
              removeLabel={`Quitar ${line.name} del carrito`}
              onOpen={() => openForCartLine(line)}
              onRemove={() => setCart((prev) => removeLine(prev, line.key))}
            />
          ))}
          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={() => setConfirmOpen(true)}
            sx={{ mt: 2, minHeight: 52 }}
          >
            Finalizar compra · {formatMoney(total)}
          </Button>
        </>
      )}

      <SectionTitle
        action={
          <Button
            size="small"
            onClick={() => openDraft({ mode: "list", title: "Agregar a la lista", draft: blankDraft() })}
          >
            Agregar
          </Button>
        }
      >
        Por buscar
      </SectionTitle>
      {toFind.length === 0 ? (
        <Typography sx={{ py: 1, color: "text.secondary" }}>
          No falta nada en la lista.
        </Typography>
      ) : (
        toFind.map((item) => (
          <Row
            key={item.id}
            dashed
            title={item.name}
            detail={`${formatQuantity(item.quantity)} ${unitLabel(item.stockType)}${
              item.lastPrice > 0 ? ` · última vez ${formatMoney(item.lastPrice)}` : ""
            }`}
            openLabel="Poner en el carrito"
            removeLabel={`Quitar ${item.name} de la lista`}
            onOpen={() => openForListItem(item)}
            onRemove={() => void removeFromListSafe(item)}
          />
        ))
      )}

      {suggestions.length > 0 && (
        <>
          <SectionTitle>Sugeridos</SectionTitle>
          {suggestions.map((s) => (
            <Row
              key={s.productId}
              dashed
              title={s.name}
              detail={s.reason}
              openLabel="Agregar a la lista"
              removeLabel={`Agregar ${s.name} a la lista`}
              actionIcon={<AddIcon fontSize="small" />}
              onOpen={() => void addSuggestion(s.productId, s.name)}
              onRemove={() => void addSuggestion(s.productId, s.name)}
            />
          ))}
        </>
      )}

      <Box
        sx={{
          position: "fixed",
          left: tokens.barInset,
          right: tokens.barInset,
          bottom: tokens.barInset > 0 ? "calc(20px + env(safe-area-inset-bottom))" : 0,
          zIndex: 2,
          maxWidth: tokens.barInset > 0 ? 488 : undefined,
          mx: "auto",
          bgcolor: tokens.bar,
          color: tokens.barText,
          borderRadius: `${tokens.barRadius}px`,
          borderTop: tokens.barInset === 0 ? tokens.border : undefined,
          px: 2,
          pt: 1.5,
          pb: tokens.barInset > 0 ? 1.5 : "calc(20px + env(safe-area-inset-bottom))",
          display: "flex",
          alignItems: "center",
          gap: 1.5,
        }}
      >
        <Button
          fullWidth
          variant="contained"
          startIcon={<QrCodeScannerIcon />}
          onClick={() => setScannerOpen(true)}
          sx={{
            minHeight: 56,
            borderRadius: tokens.barRadius > 0 ? "28px" : undefined,
            bgcolor: tokens.scanBg,
            color: tokens.scanFg,
            "&:hover": { bgcolor: tokens.scanBg },
          }}
        >
          Escanear código
        </Button>
        <IconButton
          aria-label="Agregar producto a mano"
          onClick={() => openDraft({ mode: "cart", title: "Producto a mano", draft: blankDraft() })}
          sx={{
            width: 56,
            height: 56,
            borderRadius: tokens.barRadius > 0 ? "50%" : `${tokens.radius}px`,
            bgcolor: tokens.addBg,
            color: tokens.addFg,
            border: tokens.border === "none" ? undefined : tokens.border,
            "&:hover": { bgcolor: tokens.addBg },
          }}
        >
          <AddIcon />
        </IconButton>
      </Box>

      <ItemDialog
        open={dialog !== null}
        mode={dialog?.mode ?? "cart"}
        title={dialog?.title ?? ""}
        draft={dialog?.draft ?? null}
        findMatches={search}
        onClose={() => setDialog(null)}
        onSubmit={(draft) => void submitDialog(draft)}
      />

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(code) => void handleCode(code)}
      />

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Finalizar compra</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Se registra una compra de {formatMoney(total)} con {cart.length}{" "}
            {cart.length === 1 ? "producto" : "productos"}. Las existencias suben y el precio de cada producto
            queda como el de hoy.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Todavía no</Button>
          <Button variant="contained" onClick={() => void finishPurchase()}>
            Registrar
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={lookingUp}
        message="Buscando el código..."
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        sx={{ mb: 12 }}
      />
      <Snackbar
        open={snack !== null}
        autoHideDuration={5000}
        onClose={(_, reason) => {
          if (reason !== "clickaway") setSnack(null);
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        sx={{ mb: 12 }}
      >
        {snack ? (
          <Alert severity={snack.severity} onClose={() => setSnack(null)} sx={{ width: "100%" }}>
            {snack.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
};

export default Super;
