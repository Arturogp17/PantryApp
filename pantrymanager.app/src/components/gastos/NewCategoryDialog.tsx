import { useEffect, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import { useBackToClose } from "../../hooks/useBackToClose";
import api from "../../api/client";
import { ExpenseCategory } from "../../types";
import { errorMessage } from "../../lib/errors";

interface Props {
  open: boolean;
  // Null crea una categoría principal; una categoría crea una subcategoría de esa.
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

  useEffect(() => {
    if (!open) return;
    setName("");
    setTouched(false);
    setSaving(false);
    setError("");
  }, [open]);

  const parentId = parent?.id ?? null;
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
      <DialogTitle>{parent ? `Nueva subcategoría de ${parent.name}` : "Nueva categoría"}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            label={parent ? "Nombre de la subcategoría" : "Nombre de la categoría"}
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
