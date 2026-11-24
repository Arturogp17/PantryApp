import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Snackbar,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import RefreshIcon from "@mui/icons-material/Refresh";
import api from "../api/client";
import BarcodeScanner from "../components/BarcodeScanner";
import ItemDialog, { ItemDraft } from "../components/ItemDialog";
import { useAppTheme } from "../theme/ThemeContext";
import { rowStyle } from "../theme/rowStyle";
import { useCatalog } from "../hooks/useCatalog";
import { useBackToClose } from "../hooks/useBackToClose";
import { useShoppingList } from "../hooks/useShoppingList";
import { PaymentSplit, SplitRow, addSplitRow, endSplit, rowsToParts, startSplit } from "../components/gastos/PaymentSplit";
import NewCategoryDialog from "../components/gastos/NewCategoryDialog";
import { resolveSplit } from "../lib/split";
import { BarcodeLookup, Card, ExpenseCategory, ShoppingListItem } from "../types";
import { CartLine, addLine, cartTotal, lineSavings, lineTotal, removeLine, toPurchaseItems, updateLine } from "../lib/cart";
import { errorMessage } from "../lib/errors";
import { promoLabel } from "../lib/promo";
import { formatMoney, formatQuantity, roundMoney } from "../lib/money";
import { FlushResult, PurchasePayment, enqueuePurchase, flushPending, loadPending, purchaseBody } from "../lib/offlineQueue";
import { readJson, writeJson } from "../lib/storage";
import { unitLabel } from "../lib/units";

const CART_KEY = "pantry.cart";
const LAST_PAYMENT_KEY = "pantry.lastPurchasePayment";
const PAYMENT_OPTIONS_KEY = "pantry.paymentOptions";

// Tarjetas y categorías de gasto. Se guardan la última vez que cargaron bien, para usarlas sin señal.
interface PaymentOptions {
  cards: Card[];
  categories: ExpenseCategory[];
}

interface LastPayment {
  cardId: number | null;
  categoryId: number | null;
}

// Quita acentos y mayúsculas para comparar nombres: "Súper" y "super" son lo mismo.
const plain = (text: string): string =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

const defaultMerchantFor = (category: ExpenseCategory | undefined): string =>
  category && plain(category.name) === "costco" ? "Costco" : "Súper";

const cardLabel = (c: Card): string => {
  const base = c.last4 ? `${c.name} ·${c.last4}` : c.name;
  return c.kind === "voucher" && !plain(c.name).includes("vale") ? `${base} · Vales` : base;
};

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

interface CheckoutDialogProps {
  open: boolean;
  total: number;
  lineCount: number;
  options: PaymentOptions | null;
  onClose: () => void;
  onConfirm: (payment: PurchasePayment) => void;
  onCategoryCreated: (c: ExpenseCategory) => void;
}

// Pregunta con qué se pagó y si se registra como gasto. Recuerda la última elección.
const CheckoutDialog = ({ open, total, lineCount, options, onClose, onConfirm, onCategoryCreated }: CheckoutDialogProps) => {
  const cards = useMemo(() => (options?.cards ?? []).filter((c) => c.isActive), [options]);
  const categories = useMemo(() => options?.categories ?? [], [options]);
  const topLevel = useMemo(() => categories.filter((c) => c.parentId === null), [categories]);
  const expenseAvailable = categories.length > 0;

  // Una fila por método. Sin dividir hay una sola fila, y su monto es el total de la compra.
  const [rows, setRows] = useState<SplitRow[]>([{ cardId: null, amount: "" }]);
  const [split, setSplit] = useState(false);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [merchant, setMerchant] = useState("Súper");
  const [merchantTouched, setMerchantTouched] = useState(false);
  const [createExpense, setCreateExpense] = useState(true);
  const [newOpen, setNewOpen] = useState(false);

  // Solo al abrir: si las opciones se actualizan mientras se elige, no se borra lo que ya eligió la persona.
  useEffect(() => {
    if (!open) return;

    const last = readJson<LastPayment | null>(LAST_PAYMENT_KEY, null);
    const category =
      topLevel.find((c) => c.id === last?.categoryId) ??
      topLevel.find((c) => plain(c.name) === "super") ??
      topLevel[0];

    setRows([{ cardId: cards.find((c) => c.id === last?.cardId)?.id ?? null, amount: "" }]);
    setSplit(false);
    setCategoryId(category?.id ?? null);
    setMerchant(defaultMerchantFor(category));
    setMerchantTouched(false);
    setCreateExpense(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selected = categories.find((c) => c.id === categoryId);

  const pickCategory = (id: number) => {
    setCategoryId(id);
    if (!merchantTouched) setMerchant(defaultMerchantFor(categories.find((c) => c.id === id)));
  };

  // Sin dividir, la única parte es el total. Dividido, la última fila recibe lo que falte.
  const resolved = resolveSplit(total, rowsToParts(rows));
  const error = split ? resolved.error : null;
  const freeAmount = resolved.parts[resolved.parts.length - 1].amount;

  const toggleSplit = () => {
    setRows(split ? endSplit(rows) : startSplit(rows, cards));
    setSplit(!split);
  };

  const changeCard = (index: number, cardId: number | null) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, cardId } : row)));

  const changeAmount = (index: number, amount: string) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, amount } : row)));

  const confirm = () => {
    if (error) return;
    const payment: PurchasePayment = {
      createExpense: createExpense && expenseAvailable && categoryId !== null,
      categoryId,
      merchant: merchant.trim() || defaultMerchantFor(selected),
      parts: resolved.parts,
    };
    if (categoryId !== null) {
      // Se recuerda el método de la primera parte.
      const last: LastPayment = { cardId: resolved.parts[0].cardId, categoryId };
      writeJson(LAST_PAYMENT_KEY, last);
    }
    onConfirm(payment);
  };

  useBackToClose(open, onClose);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>¿Cómo pagaste?</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Compra de {formatMoney(total)} con {lineCount} {lineCount === 1 ? "producto" : "productos"}. Las
          existencias suben y el precio de cada producto queda como el de hoy.
        </DialogContentText>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <PaymentSplit
            split={split}
            allowSplit
            title="Método de pago"
            rows={rows}
            methods={cards}
            labelOf={cardLabel}
            total={total}
            freeAmount={freeAmount}
            error={error}
            onToggle={toggleSplit}
            onAdd={() => setRows(addSplitRow(rows, cards))}
            onCardChange={changeCard}
            onAmountChange={changeAmount}
          />

          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 1 }}>Categoría</Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {topLevel.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  clickable
                  color={categoryId === c.id ? "primary" : "default"}
                  variant={categoryId === c.id ? "filled" : "outlined"}
                  onClick={() => pickCategory(c.id)}
                  sx={{ height: 44 }}
                />
              ))}
              {(() => {
                // Una subcategoría elegida (por ejemplo, recién creada) se muestra como chip propio.
                const sub = categories.find((c) => c.id === categoryId && c.parentId !== null);
                if (!sub) return null;
                const parent = categories.find((c) => c.id === sub.parentId);
                return <Chip label={parent ? `${parent.name} · ${sub.name}` : sub.name} color="primary" sx={{ height: 44 }} />;
              })()}
              <Chip label="+ Nueva" clickable variant="outlined" onClick={() => setNewOpen(true)} sx={{ height: 44 }} />
            </Box>
          </Box>

          <TextField
            label="Tienda (opcional)"
            value={merchant}
            onChange={(e) => {
              setMerchantTouched(true);
              setMerchant(e.target.value);
            }}
            slotProps={{ htmlInput: { maxLength: 120 } }}
          />

          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={createExpense && expenseAvailable}
                  disabled={!expenseAvailable}
                  onChange={(e) => setCreateExpense(e.target.checked)}
                />
              }
              label="Registrar como gasto"
            />
            {!expenseAvailable && (
              <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                Sin conexión: la compra se guarda sin registrar el gasto
              </Typography>
            )}
          </Box>
        </Box>
      </DialogContent>
      <NewCategoryDialog
        open={newOpen}
        parent={null}
        categories={categories}
        onClose={() => setNewOpen(false)}
        onCreated={(c) => {
          setNewOpen(false);
          setCategoryId(c.id);
          onCategoryCreated(c);
        }}
      />
      <DialogActions>
        <Button onClick={onClose}>Todavía no</Button>
        <Button variant="contained" onClick={confirm} disabled={error !== null}>
          Terminar compra
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const Super = () => {
  const { tokens } = useAppTheme();
  const {
    items,
    suggestions,
    offline: listOffline,
    refreshing,
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
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentOptions, setPaymentOptions] = useState<PaymentOptions | null>(() =>
    readJson<PaymentOptions | null>(PAYMENT_OPTIONS_KEY, null)
  );
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
        await api.post("/purchases", purchaseBody(purchase));
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

  // Tarjetas y categorías para el diálogo de pago. Si no hay señal, queda la última copia guardada.
  const loadPaymentOptions = useCallback(async () => {
    try {
      const [cards, categories] = await Promise.all([
        api.get<Card[]>("/cards"),
        api.get<ExpenseCategory[]>("/expense-categories"),
      ]);
      const fresh: PaymentOptions = { cards: cards.data, categories: categories.data };
      writeJson(PAYMENT_OPTIONS_KEY, fresh);
      setPaymentOptions(fresh);
    } catch {
      // Sin conexión: el diálogo usa la copia que ya tiene.
    }
  }, []);

  useEffect(() => {
    void loadPaymentOptions();
  }, [loadPaymentOptions]);

  // Botón de actualizar: trae la lista (y lo que agregó la otra persona) y el catálogo.
  const refreshAll = useCallback(async () => {
    await Promise.all([refreshList(), refreshCatalog()]);
  }, [refreshList, refreshCatalog]);

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
        // Un renglón agregado sin conexión puede no tener producto todavía (id 0): se crea al comprar.
        productId: item.productId > 0 ? item.productId : null,
        barcode: item.barcode,
        name: item.name,
        stockType: item.stockType,
        quantity: item.quantity,
        unitPrice: item.lastPrice > 0 ? item.lastPrice : null,
        imageUrl: item.imageUrl,
        lockProduct: item.productId > 0,
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
  const finishPurchase = async (payment: PurchasePayment) => {
    setPaymentOpen(false);
    if (cart.length === 0) return;

    enqueuePurchase(toPurchaseItems(cart), payment);
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

  // Una categoría nueva entra a la lista del diálogo de pago y a la copia guardada, para usarla sin señal.
  const onPaymentCategoryCreated = (c: ExpenseCategory) => {
    const next: PaymentOptions = {
      cards: paymentOptions?.cards ?? [],
      categories: [...(paymentOptions?.categories ?? []).filter((x) => x.id !== c.id), c],
    };
    writeJson(PAYMENT_OPTIONS_KEY, next);
    setPaymentOptions(next);
  };

  const heroRadius = Math.round(tokens.radius * 1.4);

  return (
    <Box sx={{ position: "relative", zIndex: 1, maxWidth: 520, mx: "auto", px: 2, pt: 2, pb: "150px" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Box>
          <Typography component="h1" variant="h4" sx={{ lineHeight: 1.1 }}>
            Súper
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Lista compartida
          </Typography>
        </Box>
        <IconButton aria-label="Actualizar la lista" onClick={() => void refreshAll()} disabled={refreshing}>
          {refreshing ? <CircularProgress size={22} color="inherit" /> : <RefreshIcon />}
        </IconButton>
      </Box>

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
            onClick={() => {
              setPaymentOpen(true);
              void loadPaymentOptions();
            }}
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

      <CheckoutDialog
        open={paymentOpen}
        total={total}
        lineCount={cart.length}
        options={paymentOptions}
        onClose={() => setPaymentOpen(false)}
        onConfirm={(payment) => void finishPurchase(payment)}
        onCategoryCreated={onPaymentCategoryCreated}
      />

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
