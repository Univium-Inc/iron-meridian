// IRON MERIDIAN client entry (M1).
//
// Runs the shared simulation locally (proving @iron/shared is isomorphic) on the real
// generated map, and renders a fitted overview: baked terrain, objectives with sector
// labels, and the path-following movers. The status panel still reflects the
// authoritative server tick, state hash, and tick timing over the WebSocket. The full
// camera-driven renderer and HUD arrive in M3.

import "./style.css";
import { DEFAULT_SEED, Simulation, TICK_MS, type GameMap } from "@iron/shared";
import { bakeTerrain, type BakedTerrain } from "./terrain";

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

// ---- local simulation on the real map ----
const sim = new Simulation(DEFAULT_SEED, "large");
const map: GameMap = sim.world.map;
const baked: BakedTerrain = bakeTerrain(map);

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

// Fit the whole map into the viewport (overview). Returns the transform.
function fit(): { scale: number; ox: number; oy: number } {
  const margin = 70;
  const scale = Math.min(
    (viewW - margin * 2) / map.worldW,
    (viewH - margin * 2) / map.worldH,
  );
  const ox = (viewW - map.worldW * scale) / 2;
  const oy = (viewH - map.worldH * scale) / 2;
  return { scale, ox, oy };
}

function render(): void {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = "#06090c";
  g.fillRect(0, 0, viewW, viewH);

  const { scale, ox, oy } = fit();

  // Baked terrain, scaled to fit.
  g.imageSmoothingEnabled = false;
  g.drawImage(baked.canvas, ox, oy, map.worldW * scale, map.worldH * scale);

  // Objectives: brass diamonds with name and sector.
  g.textAlign = "center";
  for (const o of map.objectives) {
    const x = ox + o.x * scale;
    const y = oy + o.y * scale;
    g.save();
    g.translate(x, y);
    g.strokeStyle = "rgba(232,184,75,0.7)";
    g.setLineDash([4, 4]);
    g.beginPath();
    g.arc(0, 0, o.r * scale, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.rotate(Math.PI / 4);
    g.fillStyle = "#e8b84b";
    g.fillRect(-4, -4, 8, 8);
    g.restore();
    g.fillStyle = "#dce6ec";
    g.font = "bold 10px ui-sans-serif";
    g.fillText(o.name, x, y - 8);
  }

  // Movers: brass dots with a heading tick.
  for (const m of sim.world.movers) {
    const x = ox + m.x * scale;
    const y = oy + m.y * scale;
    g.save();
    g.translate(x, y);
    g.rotate(m.heading);
    g.fillStyle = m.inf ? "#8ec7ff" : "#ffd257";
    g.beginPath();
    g.arc(0, 0, 3, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.4)";
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(8, 0);
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
