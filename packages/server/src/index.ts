// IRON MERIDIAN server entry point.
//
// One process, one port: an HTTP server that serves the built client and hosts a
// WebSocket endpoint at /ws. M0 runs a single demo room ticking the shared simulation
// at a fixed 20Hz and streaming a status message to connected clients. Rooms, lobby,
// and the binary snapshot protocol arrive in M5.

import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WebSocketServer } from "ws";
import type { Command } from "@iron/shared";
import { Room } from "./room";
import { makeStaticHandler } from "./static";

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? "0.0.0.0";

// packages/server/{src,dist}/index.js -> packages/client/dist
const here = dirname(fileURLToPath(import.meta.url));
const clientDist = join(here, "..", "..", "client", "dist");

const serveStatic = makeStaticHandler(clientDist);
const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  serveStatic(req, res);
});

// Demo room (M0). One shared authoritative simulation.
const room = new Room();
room.start();

const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
wss.on("connection", (ws) => {
  room.addClient(ws);
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(String(data)) as { t?: string } & Partial<Command>;
      if (msg.t === "spawnMover" || msg.t === "nudgeMover") {
        room.handleCommand(msg as Command);
      }
    } catch {
      // Ignore malformed messages in the M0 demo protocol.
    }
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[iron] server listening on http://${HOST}:${PORT} (ws at /ws)`);
});

// Periodic tick-timing report to the console so the budget is visible.
setInterval(() => {
  console.log(
    `[iron] tick ${room.sim.world.tick} | avg ${room.profiler.avg.toFixed(3)}ms | max ${room.profiler.max.toFixed(3)}ms | hash ${room.sim.hash()}`,
  );
}, 5000);

function shutdown(): void {
  room.stop();
  wss.close();
  httpServer.close(() => process.exit(0));
  // Failsafe if close hangs.
  setTimeout(() => process.exit(0), 1000);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
