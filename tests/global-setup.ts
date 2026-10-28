import { runMigrations } from "../src/lib/migrate";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "mysql://hangar:hangar@127.0.0.1:3307/hangar_test";
  await runMigrations(url);
}
