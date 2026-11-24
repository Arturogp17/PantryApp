import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useBackToClose } from "../../hooks/useBackToClose";
import api from "../../api/client";
import { Card, Expense, ExpenseCategory, ExpenseInput } from "../../types";
import { errorMessage } from "../../lib/errors";
import { lastForMerchant, todayKey } from "../../lib/expenses";
import { newId } from "../../lib/id";
import { formatMoney } from "../../lib/money";
import { enqueueAction, isOfflineError } from "../../lib/outbox";
import { resolveSplit } from "../../lib/split";
import {
  MAX_SPLIT_PARTS,
  PaymentSplit,
  SplitRow,
  addSplitRow,
  endSplit,
  rowsToParts,
  startSplit,
  toAmount,
} from "./PaymentSplit";
import NewCategoryDialog from "./NewCategoryDialog";

const OFFLINE_CREATED = "Gasto guardado sin conexión. Se subirá solo.";
const OFFLINE_EDIT_OR_DELETE = "Sin conexión. Editar y borrar gastos necesita internet.";

interface Props {
  open: boolean;
  // Con un gasto se edita; sin él se crea uno nuevo.
  expense: Expense | null;
  cards: Card[];
  categories: ExpenseCategory[];
  onClose: () => void;
  // Recibe un aviso opcional para mostrar en la pantalla de gastos.
  onSaved: (notice?: string) => void;
  // Se llama al crear una categoría desde este diálogo, para que la página la recargue.
  onCategoryCreated: (c: ExpenseCategory) => void;
}

const labelOf = (c: Card): string => (c.last4 ? `${c.name} ·${c.last4}` : c.name);

const ExpenseDialog = ({ open, expense, cards, categories, onClose, onSaved, onCategoryCreated }: Props) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

  const [amount, setAmount] = useState("");
  // Una fila por método. Sin dividir hay una sola fila; al editar, siempre es una.
  const [rows, setRows] = useState<SplitRow[]>([{ cardId: null, amount: "" }]);
  const [split, setSplit] = useState(false);
  const [parentId, setParentId] = useState<number | null>(null);
  const [subId, setSubId] = useState<number | null>(null);
  const [merchant, setMerchant] = useState("");
  const [date, setDate] = useState(todayKey());
  const [note, setNote] = useState("");
  const [recent, setRecent] = useState<Expense[]>([]);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  // Partes ya guardadas en este intento. Si se reintenta, solo se envían las que faltan.
  const [doneRows, setDoneRows] = useState<boolean[]>([]);
  // Un id por parte, generado al abrir: reintentar una parte no crea otro gasto.
  const requestIds = useRef<string[]>([]);
  // Tras crear una categoría, la recarga de categorías no debe borrar lo que ya se escribió.
  const skipReset = useRef(false);
  const wasOpen = useRef(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newParent, setNewParent] = useState<ExpenseCategory | null>(null);

  const topLevel = useMemo(() => categories.filter((c) => c.parentId === null), [categories]);
  const childrenOf = (id: number | null) => categories.filter((c) => c.parentId === id && id !== null);

  useEffect(() => {
    const reopened = open && !wasOpen.current;
    wasOpen.current = open;
    if (!open) return;
    if (!reopened && skipReset.current) {
      skipReset.current = false;
      return;
    }
    skipReset.current = false;

    setError("");
    setTouched(false);
    setSaving(false);
    setConfirmDelete(false);
    setCategoryTouched(false);
    setDoneRows([]);
    setSplit(false);
    requestIds.current = Array.from({ length: MAX_SPLIT_PARTS }, () => newId());

    if (expense) {
      const cat = categories.find((c) => c.id === expense.categoryId);
      setAmount(String(expense.amount));
      setRows([{ cardId: expense.cardId, amount: "" }]);
      setParentId(cat?.parentId ?? cat?.id ?? null);
      setSubId(cat?.parentId ? cat.id : null);
      setMerchant(expense.merchant);
      setDate(expense.date);
      setNote(expense.note ?? "");
      setCategoryTouched(true);
    } else {
      setAmount("");
      setRows([{ cardId: null, amount: "" }]);
      setParentId(null);
      setSubId(null);
      setMerchant("");
      setDate(todayKey());
      setNote("");
    }

    // Los últimos gastos sirven para proponer categoría y tarjeta según el comercio.
    api
      .get<Expense[]>("/expenses", { params: { take: 100 } })
      .then((r) => setRecent(r.data))
      .catch(() => setRecent([]));
  }, [open, expense, categories]);

  const amountValue = toAmount(amount);
  const categoryId = subId ?? parentId;
  const amountError = !(amountValue > 0);
  const categoryError = categoryId === null;

  // Tarjetas activas y, al editar, la que ya tenía el gasto aunque se haya desactivado.
  const methods = cards.filter((c) => c.isActive || c.id === expense?.cardId);

  const resolved = resolveSplit(amountValue, rowsToParts(rows));
  const splitError = split ? resolved.error : null;
  const frozen = doneRows.some(Boolean);

  const merchantOptions = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const e of recent) {
      const key = e.merchant.trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        names.push(e.merchant.trim());
      }
    }
    return names;
  }, [recent]);

  const onMerchantChange = (value: string) => {
    setMerchant(value);
    if (expense || categoryTouched) return;

    const match = lastForMerchant(recent, value);
    if (match) {
      const cat = categories.find((c) => c.id === match.categoryId);
      if (cat) {
        setParentId(cat.parentId ?? cat.id);
        setSubId(cat.parentId ? cat.id : null);
      }
      if (!split && (match.cardId === null || cards.some((c) => c.id === match.cardId && c.isActive))) {
        setRows([{ cardId: match.cardId, amount: "" }]);
      }
    }
  };

  const openNewCategory = (parent: ExpenseCategory | null) => {
    setNewParent(parent);
    setNewOpen(true);
  };

  // Queda seleccionada: si es subcategoría, se elige también su principal.
  const onCategoryMade = (c: ExpenseCategory) => {
    skipReset.current = true;
    setCategoryTouched(true);
    if (c.parentId === null) {
      setParentId(c.id);
      setSubId(null);
    } else {
      setParentId(c.parentId);
      setSubId(c.id);
    }
    setNewOpen(false);
    onCategoryCreated(c);
  };

  const pickParent = (id: number) => {
    setCategoryTouched(true);
    setParentId(id);
    setSubId(null);
  };

  const toggleSplit = () => {
    setRows(split ? endSplit(rows) : startSplit(rows, methods));
    setSplit(!split);
  };

  const changeCard = (index: number, cardId: number | null) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, cardId } : row)));

  const changeAmount = (index: number, value: string) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, amount: value } : row)));

  const methodName = (cardId: number | null): string =>
    cardId === null ? "Efectivo" : methods.find((c) => c.id === cardId)?.name ?? "tarjeta";

  const submit = async () => {
    setTouched(true);
    if (amountError || categoryError || splitError) return;

    const shared = {
      date,
      merchant: merchant.trim(),
      note: note.trim() || null,
      categoryId: categoryId!,
    };

    setSaving(true);
    setError("");

    if (expense) {
      try {
        const body: ExpenseInput = { ...shared, amount: amountValue, cardId: rows[0].cardId };
        await api.put(`/expenses/${expense.id}`, body);
        onSaved();
      } catch (err) {
        setError(isOfflineError(err) ? OFFLINE_EDIT_OR_DELETE : errorMessage(err, "No se pudo guardar el gasto"));
        setSaving(false);
      }
      return;
    }

    // Alta: un gasto por parte. Las partes ya guardadas no se vuelven a enviar.
    const parts = split ? resolved.parts : [{ cardId: rows[0].cardId, amount: amountValue }];
    const saved = parts.map((_, i) => doneRows[i] === true);

    for (let i = 0; i < parts.length; i++) {
      if (saved[i]) continue;
      const part = parts[i];
      try {
        const body: ExpenseInput = { ...shared, amount: part.amount, cardId: part.cardId };
        await api.post("/expenses", { ...body, clientRequestId: requestIds.current[i] });
        saved[i] = true;
        setDoneRows([...saved]);
      } catch (err) {
        if (isOfflineError(err)) {
          // Sin señal: lo que falta se encola y se sube solo, como un gasto normal.
          parts.forEach((p, j) => {
            if (saved[j]) return;
            const queued: ExpenseInput = { ...shared, amount: p.amount, cardId: p.cardId };
            enqueueAction({ kind: "expense", body: { ...queued, clientRequestId: requestIds.current[j] } });
          });
          onSaved(OFFLINE_CREATED);
          return;
        }

        const done = parts
          .filter((_, j) => saved[j])
          .map((p) => `${formatMoney(p.amount)} con ${methodName(p.cardId)}`);
        const message = errorMessage(err, "No se pudo guardar el gasto");
        setError(done.length > 0 ? `Ya quedaron guardados: ${done.join(", ")}. ${message}` : message);
        setSaving(false);
        return;
      }
    }

    onSaved();
  };

  const remove = async () => {
    if (!expense) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setSaving(true);
    try {
      await api.delete(`/expenses/${expense.id}`);
      onSaved();
    } catch (err) {
      setError(isOfflineError(err) ? OFFLINE_EDIT_OR_DELETE : errorMessage(err, "No se pudo borrar el gasto"));
      setSaving(false);
    }
  };

  const subs = childrenOf(parentId);

  useBackToClose(open, onClose);

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="xs">
      <DialogTitle>{expense ? "Editar gasto" : "Agregar gasto"}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            label="Monto"
            value={amount}
            autoFocus={!expense}
            disabled={frozen}
            onChange={(e) => setAmount(e.target.value)}
            error={touched && amountError}
            helperText={touched && amountError ? "Escribe un monto mayor a 0" : " "}
            slotProps={{ htmlInput: { inputMode: "decimal", "aria-label": "Monto en pesos" } }}
            sx={{ "& input": { fontSize: 32, fontWeight: 800 } }}
          />

          <PaymentSplit
            split={split}
            allowSplit={!expense}
            title="Con qué pagaste"
            rows={rows}
            methods={methods}
            labelOf={labelOf}
            total={amountValue}
            freeAmount={resolved.parts[resolved.parts.length - 1].amount}
            error={splitError}
            locked={doneRows}
            onToggle={toggleSplit}
            onAdd={() => setRows(addSplitRow(rows, methods))}
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
                  color={parentId === c.id ? "primary" : "default"}
                  variant={parentId === c.id ? "filled" : "outlined"}
                  onClick={() => pickParent(c.id)}
                  sx={{ height: 44 }}
                />
              ))}
              <Chip
                label="+ Nueva"
                clickable
                variant="outlined"
                onClick={() => openNewCategory(null)}
                sx={{ height: 44 }}
              />
            </Box>
            {touched && categoryError && (
              <Typography variant="caption" sx={{ color: "error.main" }}>
                Elige una categoría
              </Typography>
            )}
          </Box>

          {parentId !== null && (
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 1 }}>Subcategoría (opcional)</Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {subs.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.name}
                    clickable
                    color={subId === c.id ? "primary" : "default"}
                    variant={subId === c.id ? "filled" : "outlined"}
                    onClick={() => {
                      setCategoryTouched(true);
                      setSubId(subId === c.id ? null : c.id);
                    }}
                    sx={{ height: 44 }}
                  />
                ))}
                <Chip
                  label="+ Nueva"
                  clickable
                  variant="outlined"
                  onClick={() => openNewCategory(categories.find((c) => c.id === parentId) ?? null)}
                  sx={{ height: 44 }}
                />
              </Box>
            </Box>
          )}

          <Box sx={{ display: "flex", gap: 1.5 }}>
            <TextField
              label="Comercio"
              value={merchant}
              onChange={(e) => onMerchantChange(e.target.value)}
              slotProps={{ htmlInput: { list: "expense-merchants", maxLength: 120 } }}
              sx={{ flex: 1.4 }}
            />
            <TextField
              label="Fecha"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || todayKey())}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ flex: 1 }}
            />
          </Box>
          <datalist id="expense-merchants">
            {merchantOptions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>

          <TextField
            label="Nota (opcional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 300 } }}
          />

          {error && <Alert severity="error">{error}</Alert>}
        </Box>
      </DialogContent>
      <NewCategoryDialog
        open={newOpen}
        parent={newParent}
        categories={categories}
        onClose={() => setNewOpen(false)}
        onCreated={onCategoryMade}
      />
      <DialogActions sx={{ px: 3, pb: 2, gap: 1, justifyContent: expense ? "space-between" : "flex-end" }}>
        {expense && (
          <Button color="error" onClick={remove} disabled={saving}>
            {confirmDelete ? "Toca otra vez para borrar" : "Borrar"}
          </Button>
        )}
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : "Guardar gasto"}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default ExpenseDialog;
