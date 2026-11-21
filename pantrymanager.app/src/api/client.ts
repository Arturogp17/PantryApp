import axios from "axios";

// En Azure se define VITE_API_URL al compilar (por ejemplo https://mi-api.azurewebsites.net/api).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:5163/api",
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  // shortcut: el token vive en localStorage; pasar a cookie httpOnly si la app deja de ser de uso personal.
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  response => response,
  error => {
    const isLogin = String(error.config?.url ?? "").includes("/auth/login");
    if (error.response?.status === 401 && !isLogin) {
      localStorage.removeItem("token");
      window.dispatchEvent(new CustomEvent('unauthorized'));
    }
    return Promise.reject(error);
  }
);

export default api;
