import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import pg from "pg";

const dataDir = resolve(process.cwd(), ".local-db");
const migrationsDir = resolve(process.cwd(), "prisma", "migrations");
const database = await PGlite.create({ dataDir });
const server = new PGLiteSocketServer({
  db: database,
  host: "127.0.0.1",
  port: 5432,
});

async function applyLocalMigrations() {
  await database.exec(`
    CREATE TABLE IF NOT EXISTS "_genura_local_migrations" (
      "name" TEXT PRIMARY KEY,
      "checksum" TEXT NOT NULL,
      "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const directories = (await readdir(migrationsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const name of directories) {
    const sql = await readFile(resolve(migrationsDir, name, "migration.sql"), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = await database.query(
      'SELECT "checksum" FROM "_genura_local_migrations" WHERE "name" = $1',
      [name],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].checksum !== checksum) {
        throw new Error(`Applied local migration "${name}" has changed. Do not edit applied migrations.`);
      }
      continue;
    }

    await database.exec("BEGIN");
    try {
      await database.exec(sql);
      await database.query(
        'INSERT INTO "_genura_local_migrations" ("name", "checksum") VALUES ($1, $2)',
        [name, checksum],
      );
      await database.exec("COMMIT");
      console.log(`Applied local migration ${name}`);
    } catch (error) {
      await database.exec("ROLLBACK");
      throw error;
    }
  }
}

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await server.stop();
  await database.close();
}

process.once("SIGINT", () => {
  void stop().then(() => process.exit(0));
});
process.once("SIGTERM", () => {
  void stop().then(() => process.exit(0));
});

try {
  await applyLocalMigrations();
  await server.start();
  const client = new pg.Client({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://genura:genura_dev_only@127.0.0.1:5432/postgres?schema=public",
  });
  let connected = false;
  try {
    await client.connect();
    connected = true;
    await client.query('SELECT 1 FROM "User" LIMIT 1');
  } catch (error) {
    await server.stop();
    throw error;
  } finally {
    if (connected) await client.end();
  }
  console.log(`POCKET CFO local PostgreSQL is listening on 127.0.0.1:5432 (data: ${dataDir})`);
} catch (error) {
  await database.close();
  throw error;
}
