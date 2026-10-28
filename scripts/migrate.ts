import { DEFAULT_DATABASE_URL } from "../src/lib/db";
import { runMigrations } from "../src/lib/migrate";

async function main() {
  const url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const ran = await runMigrations(url);
  console.log(ran.length > 0 ? `Applied: ${ran.join(", ")}` : "Nothing to apply");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
