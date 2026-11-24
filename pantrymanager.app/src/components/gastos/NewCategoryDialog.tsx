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
  TextField,
  Typography,
} from "@mui/material";
import { useBackToClose } from "../../hooks/useBackToClose";
import api from "../../api/client";
import { ExpenseCategory } from "../../types";
import { errorMessage } from "../../lib/errors";

interface Props {
  open: boolean;
  // Null crea una categoría principal; una categoría crea una subcategoría de esa.
  // Es la elección inicial: el usuario puede cambiarla en el diálogo.
  parent: ExpenseCategory | null;
  categories: ExpenseCategory[];
  onClose: () => void;
  onCreated: (c: ExpenseCategory) => void;
}

// Quita acentos y mayúsculas para comparar: "Súper" y "super" son el mismo nombre.
const plain = (text: string): string => text.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

const NewCategoryDialog = ({ open, parent, categories, onClose, onCreated }: Props) => {
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Principal elegida en "Dentro de"; null significa categoría principal.
  const [chosenId, setChosenId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setTouched(false);
    setSaving(false);
    setError("");
    setChosenId(parent?.id ?? null);
  }, [open]);

  const topLevel = categories
    .filter((c) => c.parentId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const chosen = topLevel.find((c) => c.id === chosenId) ?? null;
  const parentId = chosen?.id ?? null;

  const emptyError = name.trim().length === 0;
  // Se compara con las del mismo nivel: principales entre sí, o subcategorías de la misma principal.
  const repeatError =
    !emptyError && categories.some((c) => c.parentId === parentId && plain(c.name) === plain(name));

  const submit = async () => {
    setTouched(true);
    if (emptyError || repeatError || saving) return;

    setSaving(true);
    setError("");
    try {
      const r = await api.post<ExpenseCategory>("/expense-categories", { name: name.trim(), parentId });
      setSaving(false);
      onCreated(r.data);
    } catch (err) {
      setError(errorMessage(err, "No se pudo crear la categoría"));
      setSaving(false);
    }
  };

  const helper = !touched
    ? " "
    : emptyError
      ? "Escribe un nombre"
      : repeatError
        ? "Ya existe una categoría con ese nombre"
        : " ";

  useBackToClose(open, onClose);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{chosen ? `Nueva subcategoría de ${chosen.name}` : "Nueva categoría"}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            label={chosen ? "Nombre de la subcategoría" : "Nombre de la categoría"}
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            error={touched && (emptyError || repeatError)}
            helperText={helper}
            slotProps={{ htmlInput: { maxLength: 60 } }}
          />
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 1 }}>Dentro de</Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              <Chip
                label="Ninguna (categoría principal)"
                clickable
                color={chosenId === null ? "primary" : "default"}
                variant={chosenId === null ? "filled" : "outlined"}
                onClick={() => setChosenId(null)}
                sx={{ height: 44 }}
              />
              {topLevel.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  clickable
                  color={chosenId === c.id ? "primary" : "default"}
                  variant={chosenId === c.id ? "filled" : "outlined"}
                  onClick={() => setChosenId(c.id)}
                  sx={{ height: 44 }}
                />
              ))}
            </Box>
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={saving}>
          {saving ? "Guardando…" : "Agregar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NewCategoryDialog;
