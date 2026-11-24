import { Box, Tab, Tabs } from "@mui/material";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useAppTheme } from "../theme/ThemeContext";
import SyncBanner from "./SyncBanner";
import { useOutboxSync } from "../hooks/useOutboxSync";

interface NavTab {
  to: string;
  label: string;
}

// Barra de navegación superior. La pantalla Súper dibuja su propia barra inferior,
// por eso la navegación va arriba.
const AppShell = () => {
  const { isAdmin } = useAuth();
  const { tokens } = useAppTheme();
  const { pathname } = useLocation();

  const tabs: NavTab[] = [
    { to: "/super", label: "Súper" },
    { to: "/compras", label: "Compras" },
    { to: "/gastos", label: "Gastos" },
    { to: "/inventario", label: "Inventario" },
    ...(isAdmin ? [{ to: "/admin/products", label: "Productos" }] : []),
    { to: "/ajustes", label: "Ajustes" },
  ];

  const current = tabs.find((t) => pathname.startsWith(t.to))?.to ?? false;
  const outbox = useOutboxSync();

  return (
    <Box sx={{ minHeight: "100dvh" }}>
      <Box
        component="nav"
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          bgcolor: tokens.bg,
          borderBottom: `1px solid ${tokens.line}`,
        }}
      >
        <Tabs
          value={current}
          variant="scrollable"
          scrollButtons={false}
          aria-label="Secciones"
          sx={{ maxWidth: 720, mx: "auto" }}
        >
          {tabs.map((tab) => (
            <Tab
              key={tab.to}
              value={tab.to}
              label={tab.label}
              component={Link}
              nativeButton={false}
              to={tab.to}
              sx={{ textTransform: "none", fontWeight: 800, minHeight: 48 }}
            />
          ))}
        </Tabs>
      </Box>
      <SyncBanner {...outbox} />
      <Outlet />
    </Box>
  );
};

export default AppShell;
