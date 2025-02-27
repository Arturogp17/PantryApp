import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  Avatar,
  Link,
  Alert,
  Container
} from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import api from "../api/client";
import { useAuth } from "../contexts/AuthContext";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await api.post("/auth/login", { username, password });
      login(response.data.token);
      navigate("/dashboard");
    } catch (error) {
      setErrorMessage("Credenciales incorrectas o error de conexión");
    }
  };

  return (
    <Container component="main" maxWidth="lg">
      <Grid container sx={{ minHeight: "100vh", p: 4 }}>
        {/* Sección de imagen */}
        <Grid
          item
          xs={12}
          md={6}
          sx={{
            display: { xs: "none", md: "block" },
            backgroundImage: "url(https://source.unsplash.com/random?office)",
            backgroundSize: "cover",
            backgroundPosition: "center",
            borderRadius: 4,
            mr: { md: 4 }
          }}
        />
        
        {/* Sección del formulario */}
        <Grid
          item
          xs={12}
          md={5}
          component={Paper}
          elevation={6}
          sx={{
            p: 4,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            borderRadius: 4,
            minHeight: { md: "80vh" },
            margin: "auto"
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              maxWidth: 400,
              mx: "auto",
              width: "100%"
            }}
          >
            <Avatar sx={{ m: 2, bgcolor: "primary.main" }}>
              <LockOutlinedIcon />
            </Avatar>
            
            <Typography component="h1" variant="h5" sx={{ mb: 2 }}>
              Iniciar sesión
            </Typography>

            <Box component="form" onSubmit={handleSubmit} sx={{ width: "100%" }}>
              {errorMessage && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {errorMessage}
                </Alert>
              )}

              <TextField
                fullWidth
                margin="normal"
                label="Usuario"
                variant="outlined"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />

              <TextField
                fullWidth
                margin="normal"
                label="Contraseña"
                type="password"
                variant="outlined"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <Button
                fullWidth
                variant="contained"
                size="large"
                type="submit"
                sx={{ mt: 3, mb: 2 }}
              >
                Ingresar
              </Button>

              <Box textAlign="center">
                <Link 
                  onClick={() => navigate("/register")}
                  sx={{ 
                    cursor: "pointer",
                    "&:hover": { color: "primary.main" }
                  }}
                >
                  ¿No tienes cuenta? Regístrate
                </Link>
              </Box>
            </Box>
          </Box>
        </Grid>
      </Grid>
    </Container>
  );
};

export default Login;