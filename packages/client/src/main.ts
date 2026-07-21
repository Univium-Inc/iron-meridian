// IRON MERIDIAN client entry (M0).
//
// Two things are proven here:
//   1. @iron/shared (the entire simulation) runs unchanged in the browser. We spin up a
//      local Simulation and render its wandering movers to a Canvas 2D context. The same
//      TypeScript executes on the Node server.
//   2. The client <-> server WebSocket round trip works: the status panel shows the
//      authoritative server tick, state hash, and tick timing pushed over /ws.
//
// The real renderer, HUD, input, and interpolation land in M3 and M5. This is a shell.

import "./style.css";
import {
  DEFAULT_SEED,
  SCAFFOLD_WORLD_H,
  SCAFFOLD_WORLD_W,
  Simulation,
  TICK_MS,
} from "@iron/shared";

// ---- DOM ----
const canvas = document.getElementById("game") as HTMLCanvasElement;
const g = canvas.getContext("2d")!;
const el = {
  conn: document.getElementById("conn")!,
  tick: document.getElementById("tick")!,
  movers: document.getElementById("movers")!,
  hash: document.getElementById("hash")!,
  tickms: document.getElementById("tickms")!,
};

let viewW = window.innerWidth;
let viewH = window.innerHeight;
let dpr = window.devicePixelRatio || 1;
function resize(): void {
  dpr = window.devicePixelRatio || 1;
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  canvas.style.width = viewW + "px";
  canvas.style.height = viewH + "px";
}
window.addEventListener("resize", resize);
resize();

// ---- local simulation (visual proof that the shared sim runs in the browser) ----
const sim = new Simulation(DEFAULT_SEED);
let lastMs = performance.now();
let accumulatorMs = 0;

function stepSim(now: number): void {
  accumulatorMs += now - lastMs;
  lastMs = now;
  let ran = 0;
  while (accumulatorMs >= TICK_MS && ran < 5) {
    sim.tick();
    accumulatorMs -= TICK_MS;
    ran++;
  }
}

// ---- render ----
function render(): void {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = "#06090c";
  g.fillRect(0, 0, viewW, viewH);

  // Fit the scaffold world into the viewport with a margin.
  const margin = 80;
  const scale = Math.min(
    (viewW - margin * 2) / SCAFFOLD_WORLD_W,
    (viewH - margin * 2) / SCAFFOLD_WORLD_H,
  );
  const ox = (viewW - SCAFFOLD_WORLD_W * scale) / 2;
  const oy = (viewH - SCAFFOLD_WORLD_H * scale) / 2;

  // World bounds frame.
  g.strokeStyle = "#2a3540";
  g.lineWidth = 1;
  g.strokeRect(ox, oy, SCAFFOLD_WORLD_W * scale, SCAFFOLD_WORLD_H * scale);

  // Movers as brass silhouettes with a heading tick.
  for (const m of sim.world.movers) {
    const x = ox + m.x * scale;
    const y = oy + m.y * scale;
    g.save();
    g.translate(x, y);
    g.rotate(m.heading);
    g.fillStyle = "#e8b84b";
    g.beginPath();
    g.arc(0, 0, 3.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(232,184,75,0.5)";
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(10, 0);
    g.stroke();
    g.restore();
  }
}

function frame(now: number): void {
  requestAnimationFrame(frame);
  stepSim(now);
  render();
}
requestAnimationFrame(frame);

// ---- server WebSocket round trip ----
interface RoomStatus {
  t: "status";
  tick: number;
  hash: number;
  movers: number;
  tickAvgMs: number;
  tickMaxMs: number;
  clients: number;
}

function connect(): void {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.addEventListener("open", () => {
    el.conn.textContent = "online";
    el.conn.className = "v online";
  });
  ws.addEventListener("close", () => {
    el.conn.textContent = "offline";
    el.conn.className = "v offline";
    // Retry after a short delay so the panel recovers when the dev server restarts.
    setTimeout(connect, 1000);
  });
  ws.addEventListener("error", () => ws.close());
  ws.addEventListener("message", (ev) => {
    try {
      const s = JSON.parse(ev.data as string) as RoomStatus;
      if (s.t !== "status") return;
      el.tick.textContent = String(s.tick);
      el.movers.textContent = String(s.movers);
      el.hash.textContent = "0x" + (s.hash >>> 0).toString(16).padStart(8, "0");
      el.tickms.textContent = `${s.tickAvgMs.toFixed(2)} / ${s.tickMaxMs.toFixed(2)} ms`;
    } catch {
      // Ignore malformed frames.
    }
  });
}
connect();
