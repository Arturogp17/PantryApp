import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/Auth/ProtectedRoute";
import AppShell from "./components/AppShell";
import { MascotBackground } from "./components/Mascots";
import { AuthProvider } from "./contexts/AuthContext";
import { AppThemeProvider } from "./theme/ThemeContext";
import Login from "./pages/Login";
import Super from "./pages/Super";
import Inventario from "./pages/Inventario";
import Compras from "./pages/Compras";
import Ajustes from "./pages/Ajustes";
import ProductsAdmin from "./pages/ProductsAdmin";

function App() {
  return (
    <AppThemeProvider>
      <AuthProvider>
        <MascotBackground />
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/super" element={<Super />} />
              <Route path="/compras" element={<Compras />} />
              <Route path="/inventario" element={<Inventario />} />
              <Route path="/admin/products" element={<ProductsAdmin />} />
              <Route path="/ajustes" element={<Ajustes />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/super" replace />} />
        </Routes>
      </AuthProvider>
    </AppThemeProvider>
  );
}

export default App;
