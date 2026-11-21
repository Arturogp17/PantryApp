import { createContext, useContext, ReactNode, useEffect, useState, useCallback } from "react";
import { jwtDecode } from "jwt-decode";
import { useNavigate } from "react-router-dom";

interface AuthContextType {
  isAdmin: boolean;
  isAuthenticated: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isAdmin: false,
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
});

const ROLE_CLAIM = "http://schemas.microsoft.com/ws/2008/06/identity/claims/role";

interface AuthState {
  isAuthenticated: boolean;
  isAdmin: boolean;
}

const LOGGED_OUT: AuthState = { isAuthenticated: false, isAdmin: false };

// Lee el estado de sesión a partir del token guardado. Se calcula al crear el contexto
// para que una recarga en /super no pase antes por /login.
const stateFromToken = (token: string | null): AuthState => {
  if (!token) return LOGGED_OUT;

  try {
    const decoded = jwtDecode<{ exp: number; [key: string]: unknown }>(token);
    if (Date.now() >= decoded.exp * 1000) return LOGGED_OUT;

    return { isAuthenticated: true, isAdmin: decoded[ROLE_CLAIM] === "Admin" };
  } catch {
    return LOGGED_OUT;
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [auth, setAuth] = useState<AuthState>(() => stateFromToken(localStorage.getItem("token")));
  const navigate = useNavigate();

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setAuth(LOGGED_OUT);
    navigate("/login");
  }, [navigate]);

  const login = useCallback((token: string) => {
    localStorage.setItem("token", token);
    setAuth(stateFromToken(token));
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => logout();

    window.addEventListener("unauthorized", handleUnauthorized);
    return () => window.removeEventListener("unauthorized", handleUnauthorized);
  }, [logout]);

  // Si el token guardado ya venció, se limpia.
  useEffect(() => {
    if (!auth.isAuthenticated && localStorage.getItem("token")) {
      localStorage.removeItem("token");
    }
  }, [auth.isAuthenticated]);

  return (
    <AuthContext.Provider value={{ ...auth, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe usarse dentro de un AuthProvider");
  }
  return context;
};
