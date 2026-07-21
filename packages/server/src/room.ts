// A room owns one authoritative simulation and the clients watching it.
//
// M0 is deliberately minimal: a single demo room that ticks a Simulation at a fixed
// 20Hz using a time accumulator, and pushes a small JSON status to every connected
// client each tick so the browser can prove the round trip. Real lobby, multiple
// rooms, fog filtering, and the binary snapshot protocol arrive in M5. The tick loop
// shape (accumulator, catch up, profile) is what stays.

import { WebSocket } from "ws";
import { DEFAULT_SEED, Simulation, TICK_MS, type Command } from "@iron/shared";
import { TickProfiler } from "./profiler";

export interface RoomStatus {
  t: "status";
  tick: number;
  hash: number;
  movers: number;
  tickAvgMs: number;
  tickMaxMs: number;
  clients: number;
}

export class Room {
  readonly sim: Simulation;
  readonly profiler = new TickProfiler();
  private clients = new Set<WebSocket>();
  private timer: NodeJS.Timeout | null = null;
  private accumulatorMs = 0;
  private lastMs: number;

  constructor(seed: number = DEFAULT_SEED) {
    this.sim = new Simulation(seed);
    this.lastMs = performance.now();
  }

  start(): void {
    if (this.timer) return;
    this.lastMs = performance.now();
    // Poll a little faster than the tick rate; the accumulator decides how many fixed
    // ticks actually run, so the sim rate stays exactly 20Hz regardless of jitter.
    this.timer = setInterval(() => this.pump(), Math.floor(TICK_MS / 2));
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
    ws.on("close", () => this.clients.delete(ws));
  }

  handleCommand(cmd: Command): void {
    this.sim.applyCommand(cmd);
  }

  private pump(): void {
    const now = performance.now();
    this.accumulatorMs += now - this.lastMs;
    this.lastMs = now;

    let ran = 0;
    // Cap catch-up so a long pause cannot spiral the loop.
    while (this.accumulatorMs >= TICK_MS && ran < 5) {
      const t0 = performance.now();
      this.sim.tick();
      this.profiler.add(performance.now() - t0);
      this.accumulatorMs -= TICK_MS;
      ran++;
    }
    if (ran > 0) this.broadcastStatus();
  }

  private broadcastStatus(): void {
    if (this.clients.size === 0) return;
    const status: RoomStatus = {
      t: "status",
      tick: this.sim.world.tick,
      hash: this.sim.hash(),
      movers: this.sim.world.movers.length,
      tickAvgMs: Math.round(this.profiler.avg * 1000) / 1000,
      tickMaxMs: Math.round(this.profiler.max * 1000) / 1000,
      clients: this.clients.size,
    };
    const payload = JSON.stringify(status);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }
}
