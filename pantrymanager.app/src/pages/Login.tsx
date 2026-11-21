import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Alert, Box, Button, TextField, Typography } from "@mui/material";
import api from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useAppTheme } from "../theme/ThemeContext";
import { FishMascot, ToastMascot } from "../components/Mascots";
import axios from "axios";
import { errorMessage } from "../lib/errors";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const { tokens } = useAppTheme();

  if (isAuthenticated) return <Navigate to="/super" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await api.post<{ token: string }>("/auth/login", { username, password });
      login(response.data.token);
      navigate("/super", { replace: true });
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        setError("Demasiados intentos. Espera unos minutos.");
      } else {
        setError(errorMessage(err, "Usuario o contraseña incorrectos"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      sx={{
        position: "relative",
        zIndex: 1,
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
      }}
    >
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          width: "100%",
          maxWidth: 380,
          p: 3,
          bgcolor: tokens.surface,
          borderRadius: `${tokens.radius}px`,
          border: tokens.border === "none" ? `1px solid ${tokens.line}` : tokens.border,
          boxShadow: tokens.shadow,
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "center", gap: 2, mb: 1 }}>
          <FishMascot size={84} />
          <ToastMascot size={84} />
        </Box>

        <Typography component="h1" variant="h5" sx={{ textAlign: "center", mb: 2 }}>
          PantryApp
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}

        <TextField
          fullWidth
          margin="normal"
          id="username"
          name="username"
          label="Usuario"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoFocus
          slotProps={{ htmlInput: { spellCheck: false, enterKeyHint: "next" } }}
        />
        <TextField
          fullWidth
          margin="normal"
          id="password"
          name="password"
          label="Contraseña"
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          slotProps={{ htmlInput: { enterKeyHint: "done" } }}
        />

        <Button
          fullWidth
          type="submit"
          variant="contained"
          size="large"
          disabled={busy || username === "" || password === ""}
          sx={{ mt: 2 }}
        >
          Entrar
        </Button>
      </Box>
    </Box>
  );
};

export default Login;
