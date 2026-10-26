// Rebuilds the embedded development database from scratch.
//
// PGlite is a single-process database. If the process is killed abruptly it can
// leave the data directory in a state it refuses to open. Nothing in `.local-db`
// is precious: migrations run on startup and `npm run db:seed` rebuilds the demo
// workspace, so the safest recovery is a clean directory.
import { rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";

const dataDir = resolve(process.cwd(), ".local-db");

function portInUse(port) {
  return new Promise((resolvePort) => {
    const tester = createServer()
      .once("error", () => resolvePort(true))
      .once("listening", () => tester.close(() => resolvePort(false)))
      .listen(port, "127.0.0.1");
  });
}

if (await portInUse(5432)) {
  console.error("Stop `npm run db:local` first — something is still listening on port 5432.");
  process.exit(1);
}

if (!existsSync(dataDir)) {
  console.log("No .local-db directory. Run `npm run db:local` to create one.");
  process.exit(0);
}

const backup = `${dataDir}.previous-${new Date().toISOString().replace(/[:.]/g, "-")}`;
await rename(dataDir, backup);

console.log(`Moved the old database to ${backup}`);
console.log("Next:");
console.log("  1. npm run db:local   (creates a fresh database and applies migrations)");
console.log("  2. npm run db:seed    (rebuilds the demo workspace and accounts)");
