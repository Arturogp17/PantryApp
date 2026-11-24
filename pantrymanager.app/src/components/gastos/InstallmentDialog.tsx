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
import { Card, ExpenseCategory, InstallmentInput, InstallmentPlan } from "../../types";
import { errorMessage } from "../../lib/errors";
import { installmentAmount, todayKey } from "../../lib/expenses";
import { formatMoney, roundMoney } from "../../lib/money";
import { Dot } from "./charts";
import NewCategoryDialog from "./NewCategoryDialog";

interface Props {
  open: boolean;
  // Con un plan se edita; sin él se crea uno nuevo.
  plan: InstallmentPlan | null;
  cards: Card[];
  categories: ExpenseCategory[];
  onClose: () => void;
  onSaved: () => void;
  // Se llama al crear una categoría desde este diálogo, para que la página la recargue.
  onCategoryCreated: (c: ExpenseCategory) => void;
}

const MONTH_OPTIONS = [3, 6, 9, 12, 18, 24];
const MIN_MONTHS = 2;
const MAX_MONTHS = 60;

const toNumber = (text: string): number => Number(text.replace(/,/g, ""));

const InstallmentDialog = ({ open, plan, cards, categories, onClose, onSaved, onCategoryCreated }: Props) => {
  const [name, setName] = useState("");
  const [cardId, setCardId] = useState<number | null>(null);
  const [totalText, setTotalText] = useState("");
  const [monthsText, setMonthsText] = useState("");
  const [firstDate, setFirstDate] = useState(todayKey());
  const [categoryText, setCategoryText] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [note, setNote] = useState("");
  const [hasInterest, setHasInterest] = useState(false);
  const [monthlyText, setMonthlyText] = useState("");
  const [rateText, setRateText] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    setTouched(false);
    setSaving(false);
    setConfirmDelete(false);
    setError("");
    setName(plan?.name ?? "");
    setCardId(plan?.cardId ?? null);
    setTotalText(plan ? String(plan.totalAmount) : "");
    setMonthsText(plan ? String(plan.months) : "");
    setFirstDate(plan?.firstPaymentDate ?? todayKey());
    setCategoryText(plan?.categoryId != null ? String(plan.categoryId) : "");
    setNote(plan?.note ?? "");
    setHasInterest(plan != null && (plan.monthlyPayment != null || plan.interestRate != null));
    setMonthlyText(plan?.monthlyPayment != null ? String(plan.monthlyPayment) : "");
    setRateText(plan?.interestRate != null ? String(plan.interestRate) : "");
  }, [open, plan]);

  const categoryName = (c: ExpenseCategory): string => {
    const parent = c.parentId === null ? undefined : categories.find((p) => p.id === c.parentId);
    return parent ? `${parent.name} · ${c.name}` : c.name;
  };

  // Solo tarjetas de crédito activas y, al editar, la del plan aunque se haya desactivado.
  const choices = cards.filter((c) => c.kind === "credit" && (c.isActive || c.id === plan?.cardId));

  const totalValue = toNumber(totalText);
  const monthsValue = Number(monthsText);
  const monthsValid = Number.isInteger(monthsValue) && monthsValue >= MIN_MONTHS && monthsValue <= MAX_MONTHS;
  const nameError = name.trim().length === 0;
  const cardError = cardId === null;
  const totalError = !(totalValue > 0);
  const monthsError = !monthsValid;
  const dateError = !/^\d{4}-\d{2}-\d{2}$/.test(firstDate);
  const monthlyValue = toNumber(monthlyText);
  const rateValue = toNumber(rateText);
  const monthlyError = hasInterest && !(monthlyValue > 0);
  const rateError = hasInterest && !(rateValue > 0);
  const invalid = nameError || cardError || totalError || monthsError || dateError || monthlyError || rateError;
  const perMonth =
    monthsValid && totalValue > 0 && (!hasInterest || monthlyValue > 0)
      ? installmentAmount(
          { totalAmount: totalValue, months: monthsValue, monthlyPayment: hasInterest ? monthlyValue : null },
          0
        )
      : null;

  const submit = async () => {
    setTouched(true);
    if (invalid || cardId === null) return;

    const body: InstallmentInput = {
      name: name.trim(),
      cardId,
      totalAmount: roundMoney(totalValue),
      months: monthsValue,
      firstPaymentDate: firstDate,
      categoryId: categoryText ? Number(categoryText) : null,
      note: note.trim() || null,
      monthlyPayment: hasInterest ? roundMoney(monthlyValue) : null,
      interestRate: hasInterest ? rateValue : null,
    };

    setSaving(true);
    setError("");
    try {
      if (plan) await api.put(`/installments/${plan.id}`, body);
      else await api.post("/installments", body);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "No se pudo guardar el plan"));
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!plan) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setSaving(true);
    try {
      await api.delete(`/installments/${plan.id}`);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "No se pudo borrar el plan"));
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  useBackToClose(open, onClose);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{plan ? "Editar plan" : "Agregar plan a meses"}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            label="Nombre"
            value={name}
            autoFocus={!plan}
            onChange={(e) => setName(e.target.value)}
            error={touched && nameError}
            helperText={touched && nameError ? "Escribe un nombre" : "Por ejemplo: Laptop nueva"}
            slotProps={{ htmlInput: { maxLength: 80 } }}
          />

          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 1 }}>Con qué tarjeta</Typography>
            {choices.length === 0 ? (
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                No hay tarjetas de crédito activas. Agrega una en Tarjetas.
              </Typography>
            ) : (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {choices.map((c) => (
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
            )}
            {touched && cardError && (
              <Typography variant="caption" sx={{ color: "error.main" }}>
                Elige una tarjeta
              </Typography>
            )}
          </Box>

          <TextField
            label="Monto total"
            value={totalText}
            onChange={(e) => setTotalText(e.target.value)}
            error={touched && totalError}
            helperText={touched && totalError ? "Escribe un monto mayor a 0" : " "}
            slotProps={{ htmlInput: { inputMode: "decimal", "aria-label": "Monto total en pesos" } }}
            sx={{ "& input": { fontSize: 28, fontWeight: 800 } }}
          />

          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 1 }}>Meses</Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {MONTH_OPTIONS.map((n) => (
                <Chip
                  key={n}
                  label={String(n)}
                  clickable
                  color={monthsValue === n ? "primary" : "default"}
                  variant={monthsValue === n ? "filled" : "outlined"}
                  onClick={() => setMonthsText(String(n))}
                  sx={{ height: 44, minWidth: 52 }}
                />
              ))}
            </Box>
            <TextField
              label="Otros meses"
              value={monthsText}
              onChange={(e) => setMonthsText(e.target.value.replace(/\D/g, "").slice(0, 2))}
              error={touched && monthsError}
              helperText={touched && monthsError ? `De ${MIN_MONTHS} a ${MAX_MONTHS} meses` : " "}
              slotProps={{ htmlInput: { inputMode: "numeric" } }}
              sx={{ mt: 1 }}
            />
            <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
              {perMonth !== null ? `${monthsValue} mensualidades de ${formatMoney(perMonth)}` : " "}
            </Typography>
          </Box>

          <FormControlLabel
            control={<Switch checked={hasInterest} onChange={(e) => setHasInterest(e.target.checked)} />}
            label="Tiene intereses"
          />

          {hasInterest && (
            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField
                label="Mensualidad"
                value={monthlyText}
                onChange={(e) => setMonthlyText(e.target.value)}
                error={touched && monthlyError}
                helperText={touched && monthlyError ? "Escribe un monto mayor a 0" : " "}
                slotProps={{ htmlInput: { inputMode: "decimal", "aria-label": "Mensualidad en pesos" } }}
                sx={{ flex: 1 }}
              />
              <TextField
                label="Tasa anual (%)"
                value={rateText}
                onChange={(e) => setRateText(e.target.value)}
                error={touched && rateError}
                helperText={touched && rateError ? "Escribe una tasa mayor a 0" : " "}
                slotProps={{ htmlInput: { inputMode: "decimal" } }}
                sx={{ flex: 1 }}
              />
            </Box>
          )}

          <TextField
            label="Fecha del primer pago"
            type="date"
            value={firstDate}
            onChange={(e) => setFirstDate(e.target.value)}
            error={touched && dateError}
            helperText={touched && dateError ? "Elige una fecha" : " "}
            slotProps={{ inputLabel: { shrink: true } }}
          />

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
        parent={null}
        categories={categories}
        onClose={() => setNewOpen(false)}
        onCreated={(c) => {
          setNewOpen(false);
          setCategoryText(String(c.id));
          onCategoryCreated(c);
        }}
      />
      <DialogActions sx={{ px: 3, pb: 2, gap: 1, justifyContent: plan ? "space-between" : "flex-end" }}>
        {plan && (
          <Button color="error" onClick={remove} disabled={saving}>
            {confirmDelete ? "Toca otra vez para borrar" : "Borrar"}
          </Button>
        )}
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : "Guardar plan"}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default InstallmentDialog;
