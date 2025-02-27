// src/components/Navbar.tsx
import { AppBar, Toolbar, Button, Box } from "@mui/material";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const Navbar = () => {
  const { isAdmin, logout } = useAuth();

  return (
    <AppBar position="static">
      <Toolbar>
        <Box sx={{ flexGrow: 1 }}>
          <Button color="inherit" component={Link} to="/dashboard">
            Inicio
          </Button>
          <Button color="inherit" component={Link} to="/purchases">
            Compras
          </Button>
          {isAdmin && (
            <Button color="inherit" component={Link} to="/admin/products">
              Administración
            </Button>
          )}
        </Box>
        <Button color="inherit" onClick={logout}>
          Cerrar sesión
        </Button>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;