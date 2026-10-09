import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Frontend and backend run as two separate services on two ports.
// The frontend talks to the backend directly via VITE_API_BASE_URL
// (see .env / .env.example), so no dev proxy is needed.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      port: Number(env.FRONTEND_PORT ?? 5173),
      strictPort: true,
    },
    preview: {
      port: Number(env.FRONTEND_PORT ?? 5173),
      strictPort: true,
    },
  };
});
