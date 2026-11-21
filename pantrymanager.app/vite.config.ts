import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// El puerto 3000 es el origen que el API permite en Development (Cors:AllowedOrigins).
export default defineConfig({
  plugins: [react()],
  server: { port: 3000, strictPort: true },
  build: { outDir: "dist" },
  test: {
    environment: "node",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.ts"],
  },
});
