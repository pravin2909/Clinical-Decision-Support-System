import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Backend (FastAPI) runs on :8000. Proxy API routes so the frontend can use
// relative URLs (e.g. fetch('/analyze/text/stream')) exactly like before.
const API_TARGET = "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/analyze": { target: API_TARGET, changeOrigin: true },
      "/health": { target: API_TARGET, changeOrigin: true },
      "/models": { target: API_TARGET, changeOrigin: true },
    },
  },
});
