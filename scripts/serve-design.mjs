// Optional local server for automated preview and screenshots.
// The design lab itself still opens directly from disk.

import { existsSync, statSync } from "node:fs";
import { join, normalize, resolve } from "node:path";

const root = resolve(import.meta.dir, "..", "design");
const port = Number(process.env.PORT || 4173);

Bun.serve({
  port,
  hostname: "127.0.0.1",
  fetch(request) {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";

    const file = normalize(join(root, pathname));
    if (!file.startsWith(root)) {
      return new Response("Forbidden", { status: 403 });
    }
    if (!existsSync(file) || !statSync(file).isFile()) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(Bun.file(file));
  }
});

console.log(`YAYL design lab: http://127.0.0.1:${port}/`);
