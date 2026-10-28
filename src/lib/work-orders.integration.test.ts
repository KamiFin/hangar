import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/work-orders/route";
import { getPool } from "./db";
import type { AircraftStatus } from "./domain";
import { createWorkOrder } from "./work-orders";

const pool = getPool();

beforeAll(() => {
  // These tests delete every row. Refuse to run against anything that is not the test database.
  if (!process.env.DATABASE_URL?.endsWith("_test")) {
    throw new Error(`Refusing to run against ${process.env.DATABASE_URL}`);
  }
});

beforeEach(async () => {
  await pool.query("DELETE FROM work_orders");
  await pool.query("DELETE FROM flights");
  await pool.query("DELETE FROM aircraft");
});

afterAll(async () => {
  await pool.end();
});

async function addAircraft(status: AircraftStatus = "READY"): Promise<number> {
  const [res] = await pool.query<ResultSetHeader>(
    "INSERT INTO aircraft (tail_number, model, base, status) VALUES (?, 'Test model', 'LIMC', ?)",
    [`T-${randomUUID().slice(0, 6)}`, status],
  );
  return res.insertId;
}

async function statusOf(aircraftId: number): Promise<string> {
  const [rows] = await pool.query<(RowDataPacket & { status: string })[]>(
    "SELECT status FROM aircraft WHERE id = ?",
    [aircraftId],
  );
  return rows[0]?.status ?? "missing";
}

async function countWorkOrders(): Promise<number> {
  const [rows] = await pool.query<(RowDataPacket & { n: number })[]>("SELECT COUNT(*) AS n FROM work_orders");
  return rows[0]?.n ?? -1;
}

describe("createWorkOrder", () => {
  it("grounds the aircraft on a CRITICAL work order", async () => {
    const id = await addAircraft();
    const result = await createWorkOrder({ aircraftId: id, title: "Hydraulic leak", severity: "CRITICAL" }, null);
    expect(result.kind).toBe("created");
    expect(await statusOf(id)).toBe("GROUNDED");
  });

  it("moves READY to MAINTENANCE on a MEDIUM one and leaves a GROUNDED aircraft alone", async () => {
    const ready = await addAircraft("READY");
    const grounded = await addAircraft("GROUNDED");
    await createWorkOrder({ aircraftId: ready, title: "Oil temperature advisory", severity: "MEDIUM" }, null);
    await createWorkOrder({ aircraftId: grounded, title: "Oil temperature advisory", severity: "MEDIUM" }, null);
    expect(await statusOf(ready)).toBe("MAINTENANCE");
    expect(await statusOf(grounded)).toBe("GROUNDED");
  });

  it("returns the original result for a repeated Idempotency-Key", async () => {
    const id = await addAircraft();
    const key = randomUUID();
    const first = await createWorkOrder({ aircraftId: id, title: "Brake wear check", severity: "LOW" }, key);
    const second = await createWorkOrder({ aircraftId: id, title: "Brake wear check", severity: "LOW" }, key);
    expect(first.kind).toBe("created");
    expect(second.kind).toBe("replayed");
    if (first.kind === "created" && second.kind === "replayed") {
      expect(second.workOrder.id).toBe(first.workOrder.id);
    }
    expect(await countWorkOrders()).toBe(1);
  });

  it("treats the same key with a different body as a conflict", async () => {
    const id = await addAircraft();
    const key = randomUUID();
    await createWorkOrder({ aircraftId: id, title: "Brake wear check", severity: "LOW" }, key);
    const second = await createWorkOrder({ aircraftId: id, title: "Something else", severity: "CRITICAL" }, key);
    expect(second.kind).toBe("key_conflict");
    expect(await countWorkOrders()).toBe(1);
    expect(await statusOf(id)).toBe("MAINTENANCE");
  });

  it("creates exactly one row when five requests race with the same key", async () => {
    const id = await addAircraft();
    const key = randomUUID();
    const input = { aircraftId: id, title: "Cabin pressure sensor", severity: "MEDIUM" as const };
    const results = await Promise.all(Array.from({ length: 5 }, () => createWorkOrder(input, key)));
    expect(results.filter((r) => r.kind === "created")).toHaveLength(1);
    expect(results.filter((r) => r.kind === "replayed")).toHaveLength(4);
    expect(await countWorkOrders()).toBe(1);
  });

  it("reports an unknown aircraft and writes nothing", async () => {
    const result = await createWorkOrder({ aircraftId: 999999, title: "Ghost aircraft", severity: "LOW" }, null);
    expect(result.kind).toBe("aircraft_not_found");
    expect(await countWorkOrders()).toBe(0);
  });
});

describe("POST /api/work-orders", () => {
  function post(body: unknown, key?: string) {
    return POST(
      new Request("http://localhost/api/work-orders", {
        method: "POST",
        headers: { "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
  }

  it("answers 400 with field details for an invalid body", async () => {
    const res = await post({ aircraftId: 1, title: "ab", severity: "LOW" });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("invalid_body");
    expect(json.error.details[0].path).toBe("title");
  });

  it("answers 400 for malformed JSON and for a non-UUID key", async () => {
    expect((await post("{not json")).status).toBe(400);
    expect((await post({ aircraftId: 1, title: "Valid title", severity: "LOW" }, "abc")).status).toBe(400);
  });

  it("answers 201, then 200 with Idempotent-Replayed on a retry", async () => {
    const id = await addAircraft();
    const key = randomUUID();
    const body = { aircraftId: id, title: "Pitot heater test", severity: "CRITICAL" };

    const first = await post(body, key);
    expect(first.status).toBe(201);
    expect((await first.json()).aircraftStatus).toBe("GROUNDED");

    const retry = await post(body, key);
    expect(retry.status).toBe(200);
    expect(retry.headers.get("Idempotent-Replayed")).toBe("true");
    expect(await countWorkOrders()).toBe(1);
  });

  it("answers 404 for an unknown aircraft and 422 for a reused key", async () => {
    expect((await post({ aircraftId: 999999, title: "Ghost aircraft", severity: "LOW" })).status).toBe(404);

    const id = await addAircraft();
    const key = randomUUID();
    await post({ aircraftId: id, title: "First request", severity: "LOW" }, key);
    const reused = await post({ aircraftId: id, title: "A different request", severity: "LOW" }, key);
    expect(reused.status).toBe(422);
  });
});
