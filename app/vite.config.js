import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import visualTestPlugin from "./vite-visual-test-plugin.js";

const serverUrl = process.env.VITE_SERVER_URL || "http://localhost:3001";

export default defineConfig({
  plugins: [react(), visualTestPlugin()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: serverUrl,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/ws": {
        target: serverUrl.replace(/^http/, "ws"),
        ws: true,
      },
    },
  },
});
