import mysql, { type Pool } from "mysql2/promise";

export const DEFAULT_DATABASE_URL = "mysql://hangar:hangar@127.0.0.1:3307/hangar";

// One pool per process. The globalThis slot survives Next.js hot reloads in dev.
const slot = globalThis as unknown as { __hangarPool?: Pool };

export function getPool(): Pool {
  if (!slot.__hangarPool) {
    slot.__hangarPool = mysql.createPool({
      uri: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
      connectionLimit: 10,
      timezone: "Z", // all DATETIME columns hold UTC
      dateStrings: true, // keep DATETIME as 'YYYY-MM-DD HH:MM:SS', no implicit Date conversion
      decimalNumbers: true, // DECIMAL columns come back as numbers
    });
  }
  return slot.__hangarPool;
}

export function toIsoUtc(datetime: string): string {
  return `${datetime.replace(" ", "T")}Z`;
}
