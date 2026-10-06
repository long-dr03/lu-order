// Read-only bridge for existing SQLite databases. Does not import runtime db modules.
import Database from "better-sqlite3";
import { gzipSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { TABLES } from "../src/lib/server/snapshot";
const [source, destination] = process.argv.slice(2);
if (!source || !destination)
  throw new Error("Usage: export-sqlite <source.db> <destination.pg.json.gz>");
const sqlite = new Database(source, { readonly: true, fileMustExist: true });
try {
  const tables: Record<string, unknown[]> = {};
  sqlite.transaction(() => {
    for (const name of TABLES) {
      if (name === "schema_migrations") continue;
      if (
        sqlite
          .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
          .get(name)
      )
        tables[name] = sqlite.prepare(`SELECT * FROM "${name}"`).all();
    }
  })();
  writeFileSync(
    destination,
    gzipSync(
      JSON.stringify({
        format: "LUUTA-postgres-v1",
        createdAt: new Date().toISOString(),
        tables,
      }),
    ),
    { mode: 0o600 },
  );
  console.log("SQLite exported read-only; tables:", Object.keys(tables).length);
} finally {
  sqlite.close();
}
