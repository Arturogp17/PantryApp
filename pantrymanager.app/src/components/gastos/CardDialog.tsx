import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import api from "../../api/client";
import { Card } from "../../types";
import { errorMessage } from "../../lib/errors";
import { CARD_COLORS } from "../../lib/expenses";

interface Props {
  open: boolean;
  card: Card | null;
  onClose: () => void;
  onSaved: () => void;
}

const dayValue = (text: string): number | null => {
  const n = Number(text);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
};

// Vacío es null (sin tasa). Acepta decimales con punto, de 0 a 200.
const rateValue = (text: string): number | null => {
  if (!/^\d+(\.\d*)?$/.test(text)) return null;
  const n = Number(text);
  return n <= 200 ? n : null;
};

const CardDialog = ({ open, card, onClose, onSaved }: Props) => {
  const [name, setName] = useState("");
  const [bank, setBank] = useState("");
  const [kind, setKind] = useState<Card["kind"]>("credit");
  const [last4, setLast4] = useState("");
  const [color, setColor] = useState(CARD_COLORS[0]);
  const [cutoff, setCutoff] = useState("");
  const [due, setDue] = useState("");
  const [rate, setRate] = useState("");
  const [active, setActive] = useState(true);
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
    setName(card?.name ?? "");
    setBank(card?.bank ?? "");
    setKind(card?.kind ?? "credit");
    setLast4(card?.last4 ?? "");
    setColor(card?.color ?? CARD_COLORS[0]);
    setCutoff(card?.cutoffDay ? String(card.cutoffDay) : "");
    setDue(card?.dueDay ? String(card.dueDay) : "");
    setRate(card && card.annualRate !== null ? String(card.annualRate) : "");
    setActive(card?.isActive ?? true);
  }, [open, card]);

  const nameError = name.trim().length === 0;
  const last4Error = last4 !== "" && !/^[0-9]{4}$/.test(last4);
  const cutoffError = kind === "credit" && cutoff !== "" && dayValue(cutoff) === null;
  const dueError = kind === "credit" && due !== "" && dayValue(due) === null;
  const rateError = kind === "credit" && rate !== "" && rateValue(rate) === null;
  const invalid = nameError || last4Error || cutoffError || dueError || rateError;

  const submit = async () => {
    setTouched(true);
    if (invalid) return;

    const body = {
      name: name.trim(),
      bank: bank.trim(),
      kind,
      last4: last4 || null,
      color,
      cutoffDay: kind === "credit" ? dayValue(cutoff) : null,
      dueDay: kind === "credit" ? dayValue(due) : null,
      annualRate: kind === "credit" ? rateValue(rate) : null,
      isActive: active,
    };

    setSaving(true);
    setError("");
    try {
      if (card) await api.put(`/cards/${card.id}`, body);
      else await api.post("/cards", body);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "No se pudo guardar la tarjeta"));
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!card) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setSaving(true);
    try {
      await api.delete(`/cards/${card.id}`);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "No se pudo borrar la tarjeta"));
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{card ? "Editar tarjeta" : "Agregar tarjeta"}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            label="Nombre"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            error={touched && nameError}
            helperText={touched && nameError ? "Escribe un nombre" : "Por ejemplo: BBVA Azul"}
            slotProps={{ htmlInput: { maxLength: 80 } }}
          />
          <TextField label="Banco" value={bank} onChange={(e) => setBank(e.target.value)} slotProps={{ htmlInput: { maxLength: 40 } }} />

          <Box sx={{ display: "flex", gap: 1 }}>
            <Chip
              label="Crédito"
              clickable
              color={kind === "credit" ? "primary" : "default"}
              variant={kind === "credit" ? "filled" : "outlined"}
              onClick={() => setKind("credit")}
              sx={{ height: 44 }}
            />
            <Chip
              label="Débito"
              clickable
              color={kind === "debit" ? "primary" : "default"}
              variant={kind === "debit" ? "filled" : "outlined"}
              onClick={() => setKind("debit")}
              sx={{ height: 44 }}
            />
            <Chip
              label="Vales"
              clickable
              color={kind === "voucher" ? "primary" : "default"}
              variant={kind === "voucher" ? "filled" : "outlined"}
              onClick={() => setKind("voucher")}
              sx={{ height: 44 }}
            />
          </Box>

          <TextField
            label="Últimos 4 dígitos"
            value={last4}
            onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
            error={touched && last4Error}
            helperText={touched && last4Error ? "Son 4 números" : "Opcional. Solo se usan para distinguir tarjetas."}
            slotProps={{ htmlInput: { inputMode: "numeric" } }}
          />

          {kind === "credit" && (
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <TextField
                label="Día de corte"
                value={cutoff}
                onChange={(e) => setCutoff(e.target.value.replace(/\D/g, "").slice(0, 2))}
                error={touched && cutoffError}
                helperText={touched && cutoffError ? "De 1 a 31" : " "}
                slotProps={{ htmlInput: { inputMode: "numeric" } }}
              />
              <TextField
                label="Día de pago"
                value={due}
                onChange={(e) => setDue(e.target.value.replace(/\D/g, "").slice(0, 2))}
                error={touched && dueError}
                helperText={touched && dueError ? "De 1 a 31" : " "}
                slotProps={{ htmlInput: { inputMode: "numeric" } }}
              />
            </Box>
          )}

          {kind === "credit" && (
            <TextField
              label="Tasa de interés anual (%)"
              value={rate}
              onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, "").slice(0, 6))}
              error={touched && rateError}
              helperText={touched && rateError ? "Escribe un porcentaje, por ejemplo 50.82" : "La toma el estado de cuenta al importarlo. Puedes corregirla aquí."}
              slotProps={{ htmlInput: { inputMode: "decimal" } }}
            />
          )}

          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 1 }}>Color en las gráficas</Typography>
            <Box role="radiogroup" aria-label="Color" sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {CARD_COLORS.map((c) => (
                <ButtonBase
                  key={c}
                  role="radio"
                  aria-checked={color === c}
                  aria-label={c}
                  onClick={() => setColor(c)}
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    bgcolor: c,
                    outline: color === c ? "3px solid" : "none",
                    outlineColor: "text.primary",
                    outlineOffset: "2px",
                  }}
                />
              ))}
            </Box>
          </Box>

          {card && (
            <FormControlLabel
              control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />}
              label="Activa (aparece al agregar gastos)"
            />
          )}

          {error && <Alert severity="error">{error}</Alert>}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1, justifyContent: card ? "space-between" : "flex-end" }}>
        {card && (
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

export default CardDialog;
