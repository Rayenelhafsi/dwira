import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: {
      "/health": "http://127.0.0.1:8090",
      "/hybrid": "http://127.0.0.1:8090",
      "/chat": "http://127.0.0.1:8090",
      "/debug": "http://127.0.0.1:8090",
    },
  },
});
