import { defineConfig } from "vite";

// In dev, Vite serves the client and proxies the WebSocket endpoint to the Node
// server, so the browser always talks to /ws on its own origin (same as production,
// where the Node server serves both the static client and /ws on one port).
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/ws": {
        target: "ws://localhost:8080",
        ws: true,
        changeOrigin: true,
      },
      "/health": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
  },
});
