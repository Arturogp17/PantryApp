import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { useBackToClose } from "../../hooks/useBackToClose";
import api from "../../api/client";
import { ExpenseCategory } from "../../types";
import { errorMessage } from "../../lib/errors";
import { Dot } from "./charts";

interface Props {
  open: boolean;
  categories: ExpenseCategory[];
  onClose: () => void;
  onChanged: () => void;
}

// Alta, cambio de nombre y baja de categorías y subcategorías.
const CategoriesDialog = ({ open, categories, onClose, onChanged }: Props) => {
  const [newName, setNewName] = useState("");
  // Dónde se escribe la nueva: null = categoría principal, un id = subcategoría de esa.
  const [addingTo, setAddingTo] = useState<number | null | undefined>(undefined);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const topLevel = categories.filter((c) => c.parentId === null);

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError("");
    try {
      await action();
      onChanged();
      return true;
    } catch (err) {
      setError(errorMessage(err, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const name = newName.trim();
    if (!name || addingTo === undefined) return;
    const ok = await run(
      () => api.post("/expense-categories", { name, parentId: addingTo }),
      "No se pudo crear la categoría"
    );
    if (ok) {
      setNewName("");
      setAddingTo(undefined);
    }
  };

  const rename = async (id: number) => {
    const name = editName.trim();
    if (!name) return;
    const ok = await run(() => api.put(`/expense-categories/${id}`, { name }), "No se pudo cambiar el nombre");
    if (ok) setEditingId(null);
  };

  const remove = (id: number) => run(() => api.delete(`/expense-categories/${id}`), "No se pudo borrar la categoría");

  const row = (c: ExpenseCategory, indent: boolean) => (
    <Box key={c.id} sx={{ display: "flex", alignItems: "center", gap: 1, pl: indent ? 3 : 0, minHeight: 48 }}>
      {!indent && <Dot color={c.color ?? "#A9A56F"} />}
      {editingId === c.id ? (
        <TextField
          size="small"
          value={editName}
          autoFocus
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") rename(c.id);
            if (e.key === "Escape") setEditingId(null);
          }}
          slotProps={{ htmlInput: { maxLength: 60, "aria-label": "Nuevo nombre" } }}
          sx={{ flex: 1 }}
        />
      ) : (
        <Typography sx={{ flex: 1, fontWeight: indent ? 600 : 800, overflowWrap: "anywhere" }}>{c.name}</Typography>
      )}
      {editingId === c.id ? (
        <Button size="small" onClick={() => rename(c.id)} disabled={busy}>
          Guardar
        </Button>
      ) : (
        <>
          <IconButton
            aria-label={`Cambiar nombre de ${c.name}`}
            onClick={() => {
              setEditingId(c.id);
              setEditName(c.name);
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton aria-label={`Borrar ${c.name}`} onClick={() => remove(c.id)} disabled={busy}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </>
      )}
    </Box>
  );

  useBackToClose(open, onClose);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Categorías</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}

        {topLevel.map((parent) => (
          <Box key={parent.id} sx={{ mb: 1 }}>
            {row(parent, false)}
            {categories.filter((c) => c.parentId === parent.id).map((c) => row(c, true))}
            <Button size="small" sx={{ ml: 3 }} onClick={() => setAddingTo(parent.id)}>
              Agregar subcategoría
            </Button>
          </Box>
        ))}

        {addingTo === undefined ? (
          <Button onClick={() => setAddingTo(null)} sx={{ mt: 1 }}>
            Agregar categoría
          </Button>
        ) : (
          <Box sx={{ display: "flex", gap: 1, mt: 2, alignItems: "flex-start" }}>
            <TextField
              label={
                addingTo === null
                  ? "Nueva categoría"
                  : `Subcategoría de ${categories.find((c) => c.id === addingTo)?.name ?? ""}`
              }
              value={newName}
              autoFocus
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
              slotProps={{ htmlInput: { maxLength: 60 } }}
              sx={{ flex: 1 }}
            />
            <Button variant="contained" onClick={add} disabled={busy || newName.trim() === ""} sx={{ mt: 0.5 }}>
              Agregar
            </Button>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
};

export default CategoriesDialog;
