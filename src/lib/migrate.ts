import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import mysql, { type RowDataPacket } from "mysql2/promise";

/**
 * Applies db/migrations/*.sql in filename order and records each one.
 * MySQL commits DDL implicitly, so a migration is not atomic: keep each file small
 * and write it so a half-applied file can be fixed by hand.
 */
export async function runMigrations(
  databaseUrl: string,
  dir = path.join(process.cwd(), "db", "migrations"),
): Promise<string[]> {
  const conn = await mysql.createConnection({ uri: databaseUrl, multipleStatements: true });
  try {
    await conn.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name VARCHAR(100) NOT NULL PRIMARY KEY,
         applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
       ) ENGINE = InnoDB`,
    );
    const [done] = await conn.query<RowDataPacket[]>("SELECT name FROM schema_migrations");
    const applied = new Set(done.map((row) => String(row.name)));

    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    const ran: string[] = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      await conn.query(await readFile(path.join(dir, file), "utf8"));
      await conn.query("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
      ran.push(file);
    }
    return ran;
  } finally {
    await conn.end();
  }
}
