import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useBackToClose } from "../../hooks/useBackToClose";
import api from "../../api/client";
import { Card, ExpenseCategory, RecurringCharge, RecurringInput } from "../../types";
import { errorMessage } from "../../lib/errors";
import { roundMoney } from "../../lib/money";
import { Dot } from "./charts";
import NewCategoryDialog from "./NewCategoryDialog";

interface Props {
  open: boolean;
  // Con un cargo se edita; sin él se crea uno nuevo.
  item: RecurringCharge | null;
  cards: Card[];
  categories: ExpenseCategory[];
  onClose: () => void;
  onSaved: () => void;
  // Se llama al crear una categoría desde este diálogo, para que la página la recargue.
  onCategoryCreated: (c: ExpenseCategory) => void;
}

const CASH_COLOR = "#E0B13D";
const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const toNumber = (text: string): number => Number(text.replace(/,/g, ""));

const dayValue = (text: string): number | null => {
  const n = Number(text);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
};

const RecurringDialog = ({ open, item, cards, categories, onClose, onSaved, onCategoryCreated }: Props) => {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<"monthly" | "yearly">("monthly");
  const [day, setDay] = useState("");
  const [monthText, setMonthText] = useState("1");
  const [cardId, setCardId] = useState<number | null>(null);
  const [categoryText, setCategoryText] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [active, setActive] = useState(true);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    const now = new Date();
    setTouched(false);
    setSaving(false);
    setConfirmDelete(false);
    setError("");
    setName(item?.name ?? "");
    setAmount(item ? String(item.amount) : "");
    setFrequency(item?.frequency ?? "monthly");
    setDay(item ? String(item.dayOfMonth) : String(now.getDate()));
    setMonthText(item?.monthOfYear ? String(item.monthOfYear) : String(now.getMonth() + 1));
    setCardId(item?.cardId ?? null);
    setCategoryText(item?.categoryId != null ? String(item.categoryId) : "");
    setActive(item?.isActive ?? true);
  }, [open, item]);

  const categoryName = (c: ExpenseCategory): string => {
    const parent = c.parentId === null ? undefined : categories.find((p) => p.id === c.parentId);
    return parent ? `${parent.name} · ${c.name}` : c.name;
  };

  // Tarjetas activas y, al editar, la que ya tenía cargo aunque se haya desactivado. Efectivo es null.
  const methods = cards.filter((c) => c.isActive || c.id === item?.cardId);

  const amountValue = toNumber(amount);
  const dayNumber = dayValue(day);
  const monthNumber = Number(monthText);
  const nameError = name.trim().length === 0;
  const amountError = !(amountValue > 0);
  const dayError = dayNumber === null;
  const invalid = nameError || amountError || dayError;

  const submit = async () => {
    setTouched(true);
    if (invalid || dayNumber === null) return;

    const body: RecurringInput = {
      name: name.trim(),
      amount: roundMoney(amountValue),
      frequency,
      dayOfMonth: dayNumber,
      monthOfYear: frequency === "yearly" ? monthNumber : null,
      cardId,
      categoryId: categoryText ? Number(categoryText) : null,
      isActive: active,
    };

    setSaving(true);
    setError("");
    try {
      if (item) await api.put(`/recurring/${item.id}`, body);
      else await api.post("/recurring", body);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "No se pudo guardar el cargo"));
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!item) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setSaving(true);
    try {
      await api.delete(`/recurring/${item.id}`);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "No se pudo borrar el cargo"));
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  useBackToClose(open, onClose);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{item ? "Editar recurrente" : "Agregar recurrente"}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            label="Nombre"
            value={name}
            autoFocus={!item}
            onChange={(e) => setName(e.target.value)}
            error={touched && nameError}
            helperText={touched && nameError ? "Escribe un nombre" : "Por ejemplo: Netflix"}
            slotProps={{ htmlInput: { maxLength: 80 } }}
          />

          <TextField
            label="Monto"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={touched && amountError}
            helperText={touched && amountError ? "Escribe un monto mayor a 0" : " "}
            slotProps={{ htmlInput: { inputMode: "decimal", "aria-label": "Monto en pesos" } }}
            sx={{ "& input": { fontSize: 28, fontWeight: 800 } }}
          />

          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 1 }}>Frecuencia</Typography>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Chip
                label="Mensual"
                clickable
                color={frequency === "monthly" ? "primary" : "default"}
                variant={frequency === "monthly" ? "filled" : "outlined"}
                onClick={() => setFrequency("monthly")}
                sx={{ height: 44 }}
              />
              <Chip
                label="Anual"
                clickable
                color={frequency === "yearly" ? "primary" : "default"}
                variant={frequency === "yearly" ? "filled" : "outlined"}
                onClick={() => setFrequency("yearly")}
                sx={{ height: 44 }}
              />
            </Box>
          </Box>

          <Box sx={{ display: "flex", gap: 1.5 }}>
            <TextField
              label="Día del mes"
              value={day}
              onChange={(e) => setDay(e.target.value.replace(/\D/g, "").slice(0, 2))}
              error={touched && dayError}
              helperText={touched && dayError ? "De 1 a 31" : " "}
              slotProps={{ htmlInput: { inputMode: "numeric" } }}
              sx={{ flex: 1 }}
            />
            {frequency === "yearly" && (
              <TextField
                select
                label="Mes del cobro"
                value={monthText}
                onChange={(e) => setMonthText(e.target.value)}
                sx={{ flex: 1.4 }}
              >
                {MONTH_NAMES.map((n, i) => (
                  <MenuItem key={n} value={String(i + 1)}>
                    {n}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Box>

          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 1 }}>Con qué pagas</Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              <Chip
                label="Efectivo"
                clickable
                color={cardId === null ? "primary" : "default"}
                variant={cardId === null ? "filled" : "outlined"}
                icon={<Dot color={CASH_COLOR} size={10} />}
                onClick={() => setCardId(null)}
                sx={{ height: 44 }}
              />
              {methods.map((c) => (
                <Chip
                  key={c.id}
                  label={c.last4 ? `${c.name} ·${c.last4}` : c.name}
                  clickable
                  color={cardId === c.id ? "primary" : "default"}
                  variant={cardId === c.id ? "filled" : "outlined"}
                  icon={<Dot color={c.color} size={10} />}
                  onClick={() => setCardId(c.id)}
                  sx={{ height: 44 }}
                />
              ))}
            </Box>
          </Box>

          <TextField
            select
            label="Categoría (opcional)"
            value={categoryText}
            onChange={(e) => setCategoryText(e.target.value)}
          >
            <MenuItem value="">Sin categoría</MenuItem>
            {categories.map((c) => (
              <MenuItem key={c.id} value={String(c.id)}>
                {categoryName(c)}
              </MenuItem>
            ))}
          </TextField>
          <Chip
            label="+ Nueva"
            clickable
            variant="outlined"
            onClick={() => setNewOpen(true)}
            sx={{ height: 44, alignSelf: "flex-start" }}
          />

          <FormControlLabel
            control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />}
            label="Activo (aparece en los próximos cobros)"
          />

          {error && <Alert severity="error">{error}</Alert>}
        </Box>
      </DialogContent>
      <NewCategoryDialog
        open={newOpen}
        parent={null}
        categories={categories}
        onClose={() => setNewOpen(false)}
        onCreated={(c) => {
          setNewOpen(false);
          setCategoryText(String(c.id));
          onCategoryCreated(c);
        }}
      />
      <DialogActions sx={{ px: 3, pb: 2, gap: 1, justifyContent: item ? "space-between" : "flex-end" }}>
        {item && (
          <Button color="error" onClick={remove} disabled={saving}>
            {confirmDelete ? "Toca otra vez para borrar" : "Borrar"}
          </Button>
        )}
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default RecurringDialog;
