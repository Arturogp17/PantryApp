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
import { useBackToClose } from "../../hooks/useBackToClose";
import api from "../../api/client";
import { Card, IncomeInput, IncomeSource } from "../../types";
import { errorMessage } from "../../lib/errors";
import { dateLabel, todayKey } from "../../lib/expenses";
import { formatMoney, roundMoney } from "../../lib/money";
import { Dot } from "./charts";

interface Props {
  open: boolean;
  sources: IncomeSource[];
  cards: Card[];
  onClose: () => void;
  // Se llama después de crear, editar o borrar; la página vuelve a pedir la lista.
  onChanged: () => void;
}

type Kind = IncomeSource["kind"];

const KINDS: Kind[] = ["semimonthly", "monthly", "once"];
const KIND_LABEL: Record<Kind, string> = { semimonthly: "Quincenal", monthly: "Mensual", once: "Una vez" };

const dayValue = (text: string): number | null => {
  const n = Number(text);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
};

const toNumber = (text: string): number => Number(text.replace(/,/g, ""));

const dayWord = (day: number): string => (day === 31 ? "último" : String(day));

// "Días 15 y último de cada mes", "Día 5 de cada mes", "30 nov 2026"
const scheduleLabel = (s: IncomeSource): string => {
  if (s.kind === "once") return s.date ? dateLabel(s.date) : "Sin fecha";
  if (s.day1 === null) return "Sin día";
  if (s.kind === "monthly" || s.day2 === null) {
    return s.day1 === 31 ? "Último día de cada mes" : `Día ${s.day1} de cada mes`;
  }
  return `Días ${dayWord(s.day1)} y ${dayWord(s.day2)} de cada mes`;
};

const cardLabel = (card: Card): string => (card.last4 ? `${card.name} ·${card.last4}` : card.name);

const IncomeDialog = ({ open, sources, cards, onClose, onChanged }: Props) => {
  const [mode, setMode] = useState<"list" | "form">("list");
  const [editing, setEditing] = useState<IncomeSource | null>(null);
  const [name, setName] = useState("");
  const [amountText, setAmountText] = useState("");
  const [kind, setKind] = useState<Kind>("semimonthly");
  const [day1Text, setDay1Text] = useState("");
  const [day2Text, setDay2Text] = useState("");
  const [dateText, setDateText] = useState("");
  // null es dinero disponible; un id es la tarjeta de vales donde se deposita.
  const [cardId, setCardId] = useState<number | null>(null);
  const [active, setActive] = useState(true);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode("list");
    setEditing(null);
    setTouched(false);
    setSaving(false);
    setConfirmDelete(false);
    setError("");
  }, [open]);

  // Con una fuente se edita; sin ella se crea una nueva con quincena 15 y último día como valores de partida.
  const openForm = (source: IncomeSource | null) => {
    setEditing(source);
    setName(source?.name ?? "");
    setAmountText(source ? String(source.amount) : "");
    setKind(source?.kind ?? "semimonthly");
    setDay1Text(source && source.day1 !== null ? String(source.day1) : source ? "" : "15");
    setDay2Text(source && source.day2 !== null ? String(source.day2) : source ? "" : "31");
    setDateText(source?.date ?? todayKey());
    setCardId(source?.cardId ?? null);
    setActive(source?.isActive ?? true);
    setTouched(false);
    setConfirmDelete(false);
    setError("");
    setMode("form");
  };

  // Tarjetas de vales activas y, al editar, la que ya recibía el ingreso aunque se haya desactivado.
  const depositCards = cards.filter((c) => c.kind === "voucher" && (c.isActive || c.id === editing?.cardId));

  // Una fuente nueva en vales suele ser el sueldo mensual del día 1.
  const pickCard = (card: Card) => {
    setCardId(card.id);
    if (!editing) {
      setKind("monthly");
      setDay1Text("1");
    }
  };

  const amountValue = toNumber(amountText);
  const day1 = dayValue(day1Text);
  const day2 = dayValue(day2Text);
  const nameError = name.trim().length === 0;
  const amountError = !(amountValue > 0);
  const dayError = kind !== "once" && day1 === null;
  const day2Error = kind === "semimonthly" && day2 === null;
  const dateError = kind === "once" && !/^\d{4}-\d{2}-\d{2}$/.test(dateText);
  const invalid = nameError || amountError || dayError || day2Error || dateError;

  const submit = async () => {
    setTouched(true);
    if (invalid) return;

    const body: IncomeInput = {
      name: name.trim(),
      amount: roundMoney(amountValue),
      kind,
      day1: kind === "once" ? null : day1,
      day2: kind === "semimonthly" ? day2 : null,
      date: kind === "once" ? dateText : null,
      cardId,
      isActive: active,
    };

    setSaving(true);
    setError("");
    try {
      if (editing) await api.put(`/income/${editing.id}`, body);
      else await api.post("/income", body);
      setMode("list");
      onChanged();
    } catch (err) {
      setError(errorMessage(err, "No se pudo guardar el ingreso"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setSaving(true);
    setError("");
    try {
      await api.delete(`/income/${editing.id}`);
      setMode("list");
      onChanged();
    } catch (err) {
      setError(errorMessage(err, "No se pudo borrar el ingreso"));
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  };

  // Un solo hook para las dos vistas (lista y formulario) porque comparten open.
  useBackToClose(open, onClose);

  if (mode === "list") {
    return (
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
        <DialogTitle>Ingresos</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1, pt: 1 }}>
            {sources.length === 0 && (
              <Typography sx={{ color: "text.secondary" }}>Todavía no hay ingresos. Agrega tu nómina u otra entrada de dinero.</Typography>
            )}
            {sources.map((s) => (
              <ButtonBase
                key={s.id}
                onClick={() => openForm(s)}
                aria-label={`Editar ${s.name}`}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 1.5,
                  width: "100%",
                  textAlign: "left",
                  py: 1.25,
                  px: 1,
                  borderRadius: "14px",
                  opacity: s.isActive ? 1 : 0.6,
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 800, overflowWrap: "anywhere" }}>{s.name}</Typography>
                  <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                    {s.cardId !== null ? `Vales · ${cards.find((c) => c.id === s.cardId)?.name ?? "tarjeta"} · ` : ""}
                    {scheduleLabel(s)}
                    {s.isActive ? "" : " · desactivado"}
                  </Typography>
                </Box>
                <Typography sx={{ flex: "0 0 auto", fontWeight: 800 }}>{formatMoney(s.amount)}</Typography>
              </ButtonBase>
            ))}
            <Button fullWidth variant="contained" onClick={() => openForm(null)} sx={{ mt: 1 }}>
              Agregar ingreso
            </Button>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{editing ? "Editar ingreso" : "Agregar ingreso"}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            label="Nombre"
            value={name}
            autoFocus={!editing}
            onChange={(e) => setName(e.target.value)}
            error={touched && nameError}
            helperText={touched && nameError ? "Escribe un nombre" : "Por ejemplo: Nómina"}
            slotProps={{ htmlInput: { maxLength: 80 } }}
          />

          <TextField
            label="Monto"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            error={touched && amountError}
            helperText={touched && amountError ? "Escribe un monto mayor a 0" : " "}
            slotProps={{ htmlInput: { inputMode: "decimal", "aria-label": "Monto en pesos" } }}
            sx={{ "& input": { fontSize: 28, fontWeight: 800 } }}
          />

          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 1 }}>Se deposita en</Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              <Chip
                label="Dinero disponible"
                clickable
                color={cardId === null ? "primary" : "default"}
                variant={cardId === null ? "filled" : "outlined"}
                onClick={() => setCardId(null)}
                sx={{ height: 44 }}
              />
              {depositCards.map((c) => (
                <Chip
                  key={c.id}
                  label={cardLabel(c)}
                  clickable
                  color={cardId === c.id ? "primary" : "default"}
                  variant={cardId === c.id ? "filled" : "outlined"}
                  icon={<Dot color={c.color} size={10} />}
                  onClick={() => pickCard(c)}
                  sx={{ height: 44 }}
                />
              ))}
            </Box>
          </Box>

          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 1 }}>Frecuencia</Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {KINDS.map((k) => (
                <Chip
                  key={k}
                  label={KIND_LABEL[k]}
                  clickable
                  color={kind === k ? "primary" : "default"}
                  variant={kind === k ? "filled" : "outlined"}
                  onClick={() => setKind(k)}
                  sx={{ height: 44 }}
                />
              ))}
            </Box>
          </Box>

          {kind === "once" ? (
            <TextField
              label="Fecha de cobro"
              type="date"
              value={dateText}
              onChange={(e) => setDateText(e.target.value)}
              error={touched && dateError}
              helperText={touched && dateError ? "Elige una fecha" : " "}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          ) : (
            <Box>
              <Box sx={{ display: "flex", gap: 1.5 }}>
                <TextField
                  label={kind === "semimonthly" ? "Primer día" : "Día del mes"}
                  value={day1Text}
                  onChange={(e) => setDay1Text(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  error={touched && dayError}
                  helperText={touched && dayError ? "De 1 a 31" : " "}
                  slotProps={{ htmlInput: { inputMode: "numeric" } }}
                  sx={{ flex: 1 }}
                />
                {kind === "semimonthly" && (
                  <TextField
                    label="Segundo día"
                    value={day2Text}
                    onChange={(e) => setDay2Text(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    error={touched && day2Error}
                    helperText={touched && day2Error ? "De 1 a 31" : " "}
                    slotProps={{ htmlInput: { inputMode: "numeric" } }}
                    sx={{ flex: 1 }}
                  />
                )}
              </Box>
              <Typography sx={{ fontSize: 13, color: "text.secondary" }}>31 = último día del mes</Typography>
            </Box>
          )}

          <FormControlLabel
            control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />}
            label="Activo (aparece en los próximos cobros)"
          />

          {error && <Alert severity="error">{error}</Alert>}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1, justifyContent: editing ? "space-between" : "flex-end" }}>
        {editing && (
          <Button color="error" onClick={remove} disabled={saving}>
            {confirmDelete ? "Toca otra vez para borrar" : "Borrar"}
          </Button>
        )}
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button onClick={() => setMode("list")} disabled={saving}>
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

export default IncomeDialog;
