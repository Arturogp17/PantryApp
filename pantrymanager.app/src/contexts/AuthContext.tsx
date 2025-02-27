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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const navigate = useNavigate();

  const decodeToken = (token: string) => {
    try {
      return jwtDecode<{ exp: number; [key: string]: any }>(token);
    } catch (error) {
      throw new Error("Token inválido");
    }
  };

  const validateToken = useCallback((token: string) => {
    try {
      const decoded = decodeToken(token);
      const isExpired = Date.now() >= decoded.exp * 1000;

      if (isExpired) throw new Error("Token expirado");

      setIsAuthenticated(true);
      setIsAdmin(
        decoded["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"] === "Admin"
      );
    } catch (error) {
      console.error("Error validando token:", error);
      logout();
    }
  }, []);

  const login = useCallback((token: string) => {
    localStorage.setItem("token", token);
    validateToken(token);
  }, [validateToken]);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setIsAuthenticated(false);
    setIsAdmin(false);
    navigate("/login");
  }, [navigate]);

  useEffect(() => {
    const handleUnauthorized = () => logout();
    
    window.addEventListener('unauthorized', handleUnauthorized);
    return () => window.removeEventListener('unauthorized', handleUnauthorized);
  }, [logout]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) validateToken(token);
  }, [validateToken]);

  return (
    <AuthContext.Provider value={{ isAdmin, isAuthenticated, login, logout }}>
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