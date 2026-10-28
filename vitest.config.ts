import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests run against their own database (hangar_test), never the demo data.
const testUrl = process.env.TEST_DATABASE_URL ?? "mysql://hangar:hangar@127.0.0.1:3307/hangar_test";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    env: { DATABASE_URL: testUrl },
    fileParallelism: false,
    globalSetup: ["./tests/global-setup.ts"],
  },
});
