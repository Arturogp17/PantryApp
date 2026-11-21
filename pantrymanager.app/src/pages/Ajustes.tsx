import { FormEvent, useState } from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import api from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useAppTheme } from "../theme/ThemeContext";
import { THEME_LIST } from "../theme/themes";
import { errorMessage } from "../lib/errors";

const Ajustes = () => {
  const { isAdmin, logout } = useAuth();
  const { themeId, setThemeId, tokens } = useAppTheme();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const createUser = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setResult(null);

    try {
      await api.post("/auth/users", { username: username.trim(), password, isAdmin: makeAdmin });
      setResult({ ok: true, text: `Usuario ${username.trim()} creado` });
      setUsername("");
      setPassword("");
      setMakeAdmin(false);
    } catch (error) {
      setResult({ ok: false, text: errorMessage(error, "No se pudo crear el usuario") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ position: "relative", zIndex: 1, maxWidth: 520, mx: "auto", px: 2, pt: 2, pb: 6 }}>
      <Typography component="h1" variant="h4" sx={{ lineHeight: 1.1, mb: 2 }}>
        Ajustes
      </Typography>

      <Typography component="h2" variant="h6" sx={{ mb: 1 }}>
        Diseño
      </Typography>
      <Typography variant="body2" sx={{ mb: 1.5, color: "text.secondary" }}>
        Se guarda en este teléfono.
      </Typography>

      <Box sx={{ display: "grid", gap: 1.25, mb: 4 }}>
        {THEME_LIST.map((theme) => {
          const selected = theme.id === themeId;

          return (
            <ButtonBase
              key={theme.id}
              onClick={() => setThemeId(theme.id)}
              aria-pressed={selected}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                p: 1.5,
                textAlign: "left",
                justifyContent: "flex-start",
                bgcolor: theme.bg,
                color: theme.text,
                fontFamily: theme.fontBody,
                borderRadius: `${Math.min(theme.radius, 20)}px`,
                border: selected ? `3px solid ${tokens.primary}` : `2px solid ${tokens.line}`,
              }}
            >
              <Box
                aria-hidden="true"
                sx={{
                  width: 56,
                  height: 56,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: theme.heroBg,
                  color: theme.heroText,
                  borderRadius: `${Math.min(theme.radius, 16)}px`,
                  fontFamily: theme.fontDisplay,
                  fontWeight: theme.totalWeight,
                  fontSize: 18,
                }}
              >
                $0
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800, fontFamily: theme.fontDisplay, color: theme.text }}>
                  {theme.name}
                </Typography>
                <Typography variant="body2" sx={{ color: theme.muted }}>
                  {theme.description}
                </Typography>
              </Box>
              {selected && <CheckCircleIcon sx={{ color: tokens.primary }} aria-label="Elegido" />}
            </ButtonBase>
          );
        })}
      </Box>

      {isAdmin && (
        <Box component="form" onSubmit={createUser} sx={{ mb: 4 }}>
          <Typography component="h2" variant="h6" sx={{ mb: 1 }}>
            Crear usuario
          </Typography>
          <Typography variant="body2" sx={{ mb: 1.5, color: "text.secondary" }}>
            La app no tiene registro abierto: las cuentas las crea el administrador.
          </Typography>

          {result && (
            <Alert severity={result.ok ? "success" : "error"} sx={{ mb: 1.5 }}>
              {result.text}
            </Alert>
          )}

          <TextField
            fullWidth
            label="Usuario"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            margin="dense"
            sx={{ bgcolor: tokens.surface }}
          />
          <TextField
            fullWidth
            label="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            margin="dense"
            helperText="Mínimo 8 caracteres"
            sx={{ bgcolor: tokens.surface }}
          />
          <FormControlLabel
            control={<Switch checked={makeAdmin} onChange={(e) => setMakeAdmin(e.target.checked)} />}
            label="Administrador"
          />
          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={saving || username.trim() === "" || password.length < 8}
            sx={{ mt: 1 }}
          >
            Crear usuario
          </Button>
        </Box>
      )}

      <Button variant="outlined" fullWidth onClick={logout}>
        Cerrar sesión
      </Button>
    </Box>
  );
};

export default Ajustes;
