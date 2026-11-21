import axios from "axios";

// El servidor no respondió: sin señal, sin internet o servidor caído.
export const isNetworkError = (error: unknown): boolean =>
  axios.isAxiosError(error) && !error.response;

// Texto para mostrar al usuario a partir de un error de axios.
export function errorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return "Sin conexión con el servidor";

    const data = error.response.data as
      | { message?: string; errors?: Record<string, string[]> }
      | string
      | undefined;

    if (typeof data === "string" && data.length > 0 && data.length < 200) return data;

    if (data && typeof data === "object") {
      if (data.errors) {
        const first = Object.values(data.errors).flat()[0];
        if (first) return first;
      }
      if (data.message) return data.message;
    }
  }

  return fallback;
}
