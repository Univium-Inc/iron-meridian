# CLAUDE.md: IRON MERIDIAN

IRON MERIDIAN is a 2D top-down combined-arms RTS with server-authoritative online
multiplayer. The player is a commander: most of the army runs on group-level automation
(standing orders plus an aggressiveness posture) while the player steps into the two or
three fights that matter. Pacing is the headline requirement: battles must run 20 to 45
minutes.

This repo is the production rebuild of the single-file mockup at
`reference/iron-meridian.html` (read it before touching combat, map gen, or the HUD; it
is the source of the visual identity and the combat model to port and retune).

## Current status

- Milestone: **M1 (World) complete.** Next: M2 (Combat core).
- All tests green (22 tests). `pnpm dev`, `pnpm build`, `pnpm typecheck` all working.
- Pathfinding budget met with margin: 2000 random Large routes averaged 0.39ms, max
  2.65ms (well under the 10ms/route requirement). No unreachable land tiles on any size.

Milestone map (do not advance until the current one's acceptance criteria pass and all
tests are green):

- M0 Scaffold: monorepo, TS, Vite, vitest, ws, shared sim skeleton, fixed tick, seeded
  RNG, determinism hash test. DONE.
- M1 World: map gen (3 sizes) with rivers, roads, towns, forests, elevation, objectives,
  cover points; hierarchical A*, flow fields, spatial hash. DONE.
- M2 Combat core: vehicles, 5-man squads, cover micro, physical projectiles, suppression,
  morale and routs, stamina, dodging, smoke, facing armor, hull-down, elevation LOS, fog;
  balance harness v1.
- M3 Command layer: selection, groups, Manual/Auto, standing orders, aggressiveness, group
  AI, event feed and pings, enemy commander bot (same system), playable single player.
- M4 Operations: objectives/sectors, tickets scaled to army value, reinforcements, win
  conditions, deployment phase; tune to the 20-45 min / 45-55% win-rate band.
- M5 Multiplayer: rooms/lobby, binary snapshot protocol (delta + interpolation), fog
  filtering, reconnect, pause; headless two-client + Playwright two-tab tests.
- M6 Ship: Dockerfile, fly.toml, deploy script, production smoke test, README.
- M7 Polish: WebAudio, minimap drag nav, camera bookmarks, perf pass, settings, stats.
- M8 Stretch: co-op vs AI, replay viewer, patrol orders, second biome.

## Architecture

pnpm monorepo, TypeScript everywhere.

- `packages/shared` (`@iron/shared`): the entire simulation (map gen, pathfinding, combat,
  AI, config). **Zero DOM dependencies.** Runs identically in Node and the browser. This
  is where almost all game logic lives.
- `packages/server` (`@iron/server`): Node, `ws` WebSockets, authoritative sim at a fixed
  20Hz tick, room and lobby management, serves the built client. One process, one port,
  `PORT` env aware.
- `packages/client` (`@iron/client`): Vite, Canvas 2D renderer. Only reach for WebGL later
  if profiling proves Canvas 2D cannot hold 60fps.

Networking model (built out in M5): server-authoritative, not lockstep. Clients send
commands, the server simulates, clients receive snapshots and interpolate with a 100 to
150ms buffer. Binary snapshots, delta-encoded, positions quantized to centimeters and
angles to bytes. Target under 40KB/s per client.

`@iron/shared` is consumed **from source** (its `exports` points at `src/index.ts`). Vite,
tsx, and tsup all read the TypeScript directly, so there is no separate shared build step
and no stale `dist` to worry about. The production server is a single bundled file
(`packages/server/dist/server.js`) with `@iron/shared` inlined by tsup.

### Determinism (core contract)

The simulation is deterministic: fixed timestep, a seeded `mulberry32` RNG whose state
lives inside the world, and **no `Math.random`, `Date`, or DOM anywhere in
`@iron/shared`**. `Simulation.tick()` applies queued commands in order, then advances
exactly one fixed step, then increments the tick counter. A `(seed, command log)` pair
fully reconstructs any match state. This powers replays, server restart recovery, and the
balance harness. Guarded by `packages/shared/test/determinism.test.ts` (same seed + same
log => identical hash after 10,000 ticks).

Key files:

- `packages/shared/src/math/rng.ts`: serializable mulberry32 (stream-identical to mockup).
- `packages/shared/src/sim/sim.ts`: the `Simulation` class (tick loop, command apply, hash).
- `packages/shared/src/sim/hash.ts`: FNV-1a over network-quantized state.
- `packages/shared/src/config/`: every tunable number, with comments. No magic numbers in
  logic files.

### World and pathfinding (M1)

Map generation is deterministic from `(seed, size)`: `generateMap` uses its own RNG so
layout is stable regardless of runtime randomness. Pipeline: elevation (plateaus and
ridges), meandering rivers, bridges and a road network, town clusters, forests,
objectives and named sectors, cover-point extraction, then a connectivity-repair pass
that carves a causeway for any land pocket generation left isolated. This guarantees the
"no unreachable land tiles" invariant (water is the only impassable terrain).

Pathfinding is hierarchical: a coarse sector graph (16-tile blocks) is precomputed per
map; each query runs a coarse A* to get a corridor, then a grid A* refines inside that
corridor only, falling back to unconstrained grid A* if the corridor is too tight. All
buffers are allocated once per map and reset with a generation stamp, so a search costs
time proportional to the tiles it explores, not the map size. Flow fields (Dijkstra
integration from a goal) serve large group moves so N units share one field. A uniform
spatial hash backs all proximity queries (no O(n^2) loops).

Key files:

- `packages/shared/src/config/map.ts`: sizes, tile types, elevation, movement tables.
- `packages/shared/src/sim/map/mapgen.ts`: deterministic generation + connectivity repair.
- `packages/shared/src/sim/map/types.ts`: `GameMap`, objectives, sectors, cover points.
- `packages/shared/src/sim/pathfinding/pathfinder.ts`: hierarchical corridor A*.
- `packages/shared/src/sim/pathfinding/flowfield.ts`: flow fields for group moves.
- `packages/shared/src/sim/spatial/hash.ts`: uniform-grid spatial hash.

## Conventions

- **No em dashes anywhere** (code, comments, UI copy, docs). Use commas, colons, or
  parentheses. This is a hard style rule.
- No magic numbers in logic files: tunables live in `packages/shared/src/config/`.
- Imports are extensionless (resolves consistently across tsc Bundler, Vite, tsx, tsup).
- `@iron/shared` stays DOM-free and Node-free (pure): its tsconfig sets `types: []` and no
  DOM lib, which enforces this at typecheck time.
- Tests import `{ describe, it, expect } from "vitest"` explicitly (no globals).

## How to run everything

Prereqs: Node 20+ (22 recommended, see `.nvmrc`), pnpm.

```
pnpm install         # install workspace deps (esbuild build script is allowlisted)
pnpm dev             # server (tsx watch, :8080) + client (Vite, :5173) in parallel
pnpm test            # vitest run (all packages)
pnpm test:watch      # vitest watch
pnpm typecheck       # tsc --noEmit per package
pnpm build           # typecheck shared, vite build client, tsup bundle server
pnpm start           # run the built production server (node packages/server/dist/server.js)
pnpm clean           # remove dist and build info
```

Dev: open http://localhost:5173. The Vite dev server proxies `/ws` and `/health` to the
Node server on :8080, so the browser always talks to its own origin (same as production).
Production: `pnpm build && pnpm start`, then open http://localhost:8080 (honors `PORT`).

The M0 client is a shell: it runs the shared sim locally and draws the wandering scaffold
"movers" to canvas (proving the sim is isomorphic), while the status panel shows the
authoritative server tick, state hash, and tick timing over the WebSocket. The scaffold
movers are replaced by the real map and entities in M1.
