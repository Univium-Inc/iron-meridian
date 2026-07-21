// Minimal static file server for the built client. In production the single Node
// process serves the client bundle from packages/client/dist on the same port as the
// WebSocket endpoint. In dev the client runs under Vite and this just returns a note.

import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

export function makeStaticHandler(rootDir: string) {
  const hasBuild = existsSync(join(rootDir, "index.html"));

  return function serve(req: IncomingMessage, res: ServerResponse): void {
    if (!hasBuild) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(
        "<!doctype html><meta charset=utf-8><title>IRON MERIDIAN server</title>" +
          "<body style='font-family:sans-serif;background:#0b0f12;color:#dce6ec;padding:40px'>" +
          "<h1>IRON <b style='color:#e8b84b'>MERIDIAN</b> server</h1>" +
          "<p>Running. The client build is not present, so in development open the Vite dev server instead.</p>",
      );
      return;
    }

    // Resolve the request path safely inside rootDir (block path traversal).
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    let rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
    if (rel === "/" || rel === "") rel = "/index.html";
    let filePath = join(rootDir, rel);

    // Single page app fallback: unknown routes serve index.html.
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = join(rootDir, "index.html");
    }

    const type = MIME[extname(filePath)] ?? "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    createReadStream(filePath).pipe(res);
  };
}
