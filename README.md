# IRON MERIDIAN

A 2D top-down combined-arms RTS with server-authoritative online multiplayer. You play a
commander, not a micro machine: most of the army runs on group-level automation while you
step into the fights that decide the battle. Deliberate, readable pacing (20 to 45 minute
battles), suppression and flanking over raw DPS, tanks that hide and dodge, infantry that
uses cover, telegraphed artillery, and real fog of war.

This is the production rebuild of the single-file prototype in
`reference/iron-meridian.html`.

## Status

Under active milestone development. Current: **M0 (Scaffold) complete.** See `CLAUDE.md`
for the milestone map, architecture, and conventions.

## Stack

TypeScript pnpm monorepo:

- `packages/shared`: the entire simulation (map gen, pathfinding, combat, AI, config),
  zero DOM dependencies, identical in Node and the browser.
- `packages/server`: Node + `ws`, authoritative 20Hz simulation, serves the client.
- `packages/client`: Vite + Canvas 2D.

## Develop

Prereqs: Node 20+ (22 recommended), pnpm.

```
pnpm install
pnpm dev        # client on http://localhost:5173, server on :8080
pnpm test       # run the test suite
pnpm build      # build client + server for production
pnpm start      # run the built server (honors PORT), serves client + WebSockets on one port
```

Deployment (Dockerfile, fly.toml, deploy script, production smoke test) lands in M6.
