import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/Auth/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Purchases from "./pages/Purchases";
import ProductsAdmin from "./pages/ProductsAdmin";
import { AuthProvider } from "./contexts/AuthContext";
import Navbar from "./components/navBar";

function App() {
  return (
    <AuthProvider>
      {/* Elimina el <Router> de aquí */}
      <Routes>
        {/* Ruta pública */}
        <Route path="/login" element={<Login />} />

        {/* Rutas protegidas */}
        <Route element={<ProtectedRoute />}>
          <Route
            path="/dashboard"
            element={
              <>
                <Navbar />
                <Dashboard />
              </>
            }
          />
          <Route
            path="/purchases"
            element={
              <>
                <Navbar />
                <Purchases />
              </>
            }
          />
          <Route
            path="/admin/products"
            element={
              <>
                <Navbar />
                <ProductsAdmin />
              </>
            }
          />
        </Route>

        {/* Ruta por defecto para redirigir a /login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;