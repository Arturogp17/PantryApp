import { useEffect, useMemo, useState } from "react";
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
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import api from "../../api/client";
import { Card, CardPayment, CardPaymentInput } from "../../types";
import { errorMessage } from "../../lib/errors";
import { dateLabel, todayKey } from "../../lib/expenses";
import { newId } from "../../lib/id";
import { formatMoney, roundMoney } from "../../lib/money";
import { enqueueAction, isOfflineError } from "../../lib/outbox";
import { Dot } from "./charts";

// Sin conexión el pago se guarda en la cola y se sube solo. Borrar pagos sigue necesitando señal.
const OFFLINE_SAVED = "Pago guardado sin conexión. Se subirá solo.";
const OFFLINE_DELETE = "Sin conexión. Borrar pagos necesita internet.";
const RECENT_COUNT = 5;

interface Props {
  open: boolean;
  cards: Card[];
  cardId?: number | null;
  suggestedAmount?: number | null;
  onClose: () => void;
  // Recibe un aviso opcional cuando el pago se quedó en la cola.
  onSaved: (notice?: string) => void;
  // Se avisa al borrar un pago para que la pantalla que lo muestra se actualice.
  onDeleted?: () => void;
}

const toNumber = (text: string): number => Number(text.replace(/,/g, ""));

// Más reciente primero: por fecha de pago y, dentro del mismo día, por hora de registro.
const newestFirst = (a: CardPayment, b: CardPayment): number => {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return b.id - a.id;
};

const PaymentDialog = ({ open, cards, cardId = null, suggestedAmount = null, onClose, onSaved, onDeleted }: Props) => {
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayKey());
  const [note, setNote] = useState("");
  const [deduct, setDeduct] = useState(true);
  const [recent, setRecent] = useState<CardPayment[]>([]);
  const [recentError, setRecentError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  // Un id por apertura: si el envío se repite tras un corte de red, el servidor no registra el pago dos veces.
  const [requestId, setRequestId] = useState(() => newId());

  const eligible = useMemo(() => cards.filter((c) => c.kind === "credit" && c.isActive), [cards]);

  useEffect(() => {
    if (!open) return;

    setSelectedCard(cardId);
    setAmount(suggestedAmount !== null ? String(suggestedAmount) : "");
    setDate(todayKey());
    setNote("");
    setDeduct(true);
    setTouched(false);
    setSaving(false);
    setError("");
    setConfirmingId(null);
    setRequestId(newId());
  }, [open, cardId, suggestedAmount]);

  // Últimos pagos de la tarjeta elegida. Se vuelve a pedir al borrar uno.
  useEffect(() => {
    if (!open || selectedCard === null) {
      setRecent([]);
      return;
    }

    let cancelled = false;
    setRecentError("");
    api
      .get<CardPayment[]>("/card-payments", { params: { cardId: selectedCard } })
      .then((r) => {
        if (!cancelled) setRecent([...r.data].sort(newestFirst).slice(0, RECENT_COUNT));
      })
      .catch((err) => {
        if (!cancelled) setRecentError(errorMessage(err, "No se pudieron cargar los pagos"));
      });
    return () => {
      cancelled = true;
    };
  }, [open, selectedCard, reloadKey]);

  const amountValue = toNumber(amount);
  const amountError = !(amountValue > 0);
  const cardError = selectedCard === null;

  const submit = async () => {
    setTouched(true);
    if (amountError || selectedCard === null) return;

    const body: CardPaymentInput = {
      cardId: selectedCard,
      date,
      amount: roundMoney(amountValue),
      note: note.trim() || null,
      clientRequestId: requestId,
      deductFromFunds: deduct,
    };

    setSaving(true);
    setError("");
    try {
      await api.post<CardPayment>("/card-payments", body);
      onSaved();
    } catch (err) {
      if (isOfflineError(err)) {
        enqueueAction({ kind: "card-payment", body });
        onSaved(OFFLINE_SAVED);
        return;
      }
      setError(errorMessage(err, "No se pudo registrar el pago"));
      setSaving(false);
    }
  };

  const remove = async (payment: CardPayment) => {
    if (confirmingId !== payment.id) {
      setConfirmingId(payment.id);
      return;
    }

    setSaving(true);
    setError("");
    try {
      await api.delete(`/card-payments/${payment.id}`);
      setConfirmingId(null);
      setReloadKey((k) => k + 1);
      onDeleted?.();
    } catch (err) {
      setError(isOfflineError(err) ? OFFLINE_DELETE : errorMessage(err, "No se pudo borrar el pago"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Registrar pago</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            label="Monto"
            value={amount}
            autoFocus
            onChange={(e) => setAmount(e.target.value)}
            error={touched && amountError}
            helperText={touched && amountError ? "Escribe un monto mayor a 0" : " "}
            slotProps={{ htmlInput: { inputMode: "decimal", "aria-label": "Monto en pesos" } }}
            sx={{ "& input": { fontSize: 32, fontWeight: 800 } }}
          />

          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 1 }}>Tarjeta</Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {eligible.map((c) => (
                <Chip
                  key={c.id}
                  label={c.last4 ? `${c.name} ·${c.last4}` : c.name}
                  clickable
                  color={selectedCard === c.id ? "primary" : "default"}
                  variant={selectedCard === c.id ? "filled" : "outlined"}
                  icon={<Dot color={c.color} size={10} />}
                  onClick={() => setSelectedCard(c.id)}
                  sx={{ height: 44 }}
                />
              ))}
            </Box>
            {eligible.length === 0 && (
              <Typography sx={{ fontSize: 14, color: "text.secondary" }}>No hay tarjetas de crédito activas.</Typography>
            )}
            {touched && cardError && (
              <Typography variant="caption" sx={{ color: "error.main" }}>
                Elige una tarjeta
              </Typography>
            )}
          </Box>

          <Box sx={{ display: "flex", gap: 1.5 }}>
            <TextField
              label="Fecha"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || todayKey())}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ flex: 1 }}
            />
          </Box>

          <TextField
            label="Nota (opcional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 300 } }}
          />

          <FormControlLabel
            control={<Switch checked={deduct} onChange={(e) => setDeduct(e.target.checked)} />}
            label="Descontar del dinero disponible"
          />

          {selectedCard !== null && (
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 0.5 }}>Últimos pagos de esta tarjeta</Typography>
              {recentError && <Typography sx={{ fontSize: 14, color: "error.main" }}>{recentError}</Typography>}
              {!recentError && recent.length === 0 && (
                <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Sin pagos registrados.</Typography>
              )}
              {recent.map((p) => (
                <Box
                  key={p.id}
                  sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, py: 1, borderBottom: 1, borderColor: "divider" }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700 }}>{`${formatMoney(p.amount)} · ${dateLabel(p.date)}`}</Typography>
                    {p.note && <Typography sx={{ fontSize: 13, color: "text.secondary", overflowWrap: "anywhere" }}>{p.note}</Typography>}
                  </Box>
                  <Button color="error" size="small" onClick={() => remove(p)} disabled={saving}>
                    {confirmingId === p.id ? "Toca otra vez para borrar" : "Borrar"}
                  </Button>
                </Box>
              ))}
            </Box>
          )}

          {error && <Alert severity="error">{error}</Alert>}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1, justifyContent: "flex-end" }}>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={submit} disabled={saving}>
          {saving ? "Guardando…" : "Guardar pago"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PaymentDialog;
