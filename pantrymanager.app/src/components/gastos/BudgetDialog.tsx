import { useEffect, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, TextField, Typography } from "@mui/material";
import { useBackToClose } from "../../hooks/useBackToClose";
import api from "../../api/client";
import { CategoryBudget, ExpenseCategory } from "../../types";
import { errorMessage } from "../../lib/errors";
import { roundMoney } from "../../lib/money";

interface Props {
  open: boolean;
  categories: ExpenseCategory[];
  budgets: CategoryBudget[];
  onClose: () => void;
  onSaved: () => void;
}

const toNumber = (text: string): number => Number(text.replace(/,/g, ""));

// Monto mensual por categoría principal. Vacío = sin presupuesto.
const BudgetDialog = ({ open, categories, budgets, onClose, onSaved }: Props) => {
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  // Lo que hay guardado en el servidor, para mandar solo lo que cambió.
  const [saved, setSaved] = useState<Record<number, number>>({});
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const parents = categories.filter((c) => c.parentId === null);

  useEffect(() => {
    if (!open) return;
    const current: Record<number, number> = {};
    for (const b of budgets) current[b.categoryId] = b.monthlyAmount;
    const texts: Record<number, string> = {};
    for (const c of categories) {
      if (c.parentId === null) texts[c.id] = current[c.id] !== undefined ? String(current[c.id]) : "";
    }
    setSaved(current);
    setAmounts(texts);
    setTouched(false);
    setSaving(false);
    setError("");
  }, [open, budgets, categories]);

  const isInvalid = (text: string): boolean => text.trim() !== "" && !(toNumber(text.trim()) > 0);
  const hasInvalid = parents.some((c) => isInvalid(amounts[c.id] ?? ""));

  const submit = async () => {
    setTouched(true);
    if (hasInvalid) return;

    setSaving(true);
    setError("");
    const base: Record<number, number> = { ...saved };
    try {
      for (const c of parents) {
        const text = (amounts[c.id] ?? "").trim();
        const before = base[c.id];
        if (text === "") {
          if (before !== undefined) {
            await api.delete(`/budgets/${c.id}`);
            delete base[c.id];
            setSaved({ ...base });
          }
          continue;
        }
        const value = roundMoney(toNumber(text));
        if (before === value) continue;
        await api.put<CategoryBudget>(`/budgets/${c.id}`, { monthlyAmount: value });
        base[c.id] = value;
        setSaved({ ...base });
      }
    } catch (err) {
      setError(errorMessage(err, "No se pudieron guardar los presupuestos"));
      setSaving(false);
      return;
    }
    setSaving(false);
    onSaved();
  };

  useBackToClose(open, onClose);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Presupuestos del mes</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          {parents.length === 0 ? (
            <Typography sx={{ color: "text.secondary" }}>Todavía no hay categorías principales.</Typography>
          ) : (
            <>
              <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
                Monto mensual por categoría. Déjalo vacío para no tener presupuesto.
              </Typography>
              {parents.map((c) => {
                const text = amounts[c.id] ?? "";
                const invalid = isInvalid(text);
                return (
                  <TextField
                    key={c.id}
                    label={c.name}
                    value={text}
                    onChange={(e) => setAmounts((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    error={touched && invalid}
                    helperText={touched && invalid ? "Escribe un monto mayor a 0" : " "}
                    slotProps={{
                      input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
                      htmlInput: { inputMode: "decimal" },
                    }}
                  />
                );
              })}
            </>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1, justifyContent: "flex-end" }}>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={submit} disabled={saving || parents.length === 0}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BudgetDialog;
