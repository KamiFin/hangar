// Synthetic data only. Tail numbers, routes and defects are made up for the demo.
// Deterministic: the same seed gives the same fleet, so screenshots and tests stay stable.
import { getPool } from "../src/lib/db";
import { summarizeFleet, type AircraftStatus, type Severity } from "../src/lib/domain";

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261028);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;
const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const sqlDate = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

const MODELS = ["ATR 72-600", "Airbus A320neo", "Leonardo AW139", "Embraer E190", "Boeing 737-800"] as const;
const BASES = ["LIMC", "LIML", "LIRF", "LIPZ", "LIME", "LIRN"] as const;
const AIRPORTS = [...BASES, "LFPG", "EDDF", "LEMD", "EGLL"] as const;
const DEFECTS: readonly { title: string; severity: Severity }[] = [
  { title: "Hydraulic pressure drift on system B", severity: "CRITICAL" },
  { title: "Pitot heater test failure", severity: "CRITICAL" },
  { title: "Engine 2 oil temperature advisory", severity: "MEDIUM" },
  { title: "Cabin pressure sensor intermittent", severity: "MEDIUM" },
  { title: "Nose wheel steering vibration", severity: "MEDIUM" },
  { title: "Avionics bay cooling fan noise", severity: "LOW" },
  { title: "Cargo door seal inspection due", severity: "LOW" },
  { title: "Left main gear brake wear check", severity: "LOW" },
];

const AIRCRAFT_COUNT = 24;
const FLIGHT_COUNT = 6000;
const WORK_ORDER_COUNT = 20;
const WINDOW_DAYS = 90;

async function main() {
  const pool = getPool();
  const now = Date.now();

  await pool.query("DELETE FROM work_orders");
  await pool.query("DELETE FROM flights");
  await pool.query("DELETE FROM aircraft");

  const aircraft = Array.from({ length: AIRCRAFT_COUNT }, (_, i) => ({
    tail: `I-HG${String(i + 1).padStart(2, "0")}`,
    model: pick(MODELS),
    base: pick(BASES),
  }));
  await pool.query("INSERT INTO aircraft (tail_number, model, base) VALUES ?", [
    aircraft.map((a) => [a.tail, a.model, a.base]),
  ]);
  const [idRows] = await pool.query<{ id: number }[] & import("mysql2/promise").RowDataPacket[]>(
    "SELECT id FROM aircraft ORDER BY id",
  );
  const ids = idRows.map((r) => r.id);

  // Flights, tracking flight hours per aircraft as we go.
  const hours = new Map<number, number>(ids.map((id) => [id, between(2000, 20000)]));
  const flights: (string | number)[][] = [];
  for (let i = 0; i < FLIGHT_COUNT; i++) {
    const id = pick(ids);
    const origin = pick(AIRPORTS);
    let destination = pick(AIRPORTS);
    while (destination === origin) destination = pick(AIRPORTS);
    const duration = between(35, 240);
    const departed = new Date(now - Math.floor(rand() * WINDOW_DAYS * 86_400_000));
    hours.set(id, (hours.get(id) ?? 0) + duration / 60);
    flights.push([id, origin, destination, sqlDate(departed), duration]);
  }
  for (let i = 0; i < flights.length; i += 500) {
    await pool.query(
      "INSERT INTO flights (aircraft_id, origin, destination, departed_at, duration_min) VALUES ?",
      [flights.slice(i, i + 500)],
    );
  }

  // Work orders, then derive each aircraft status from its open ones.
  const worst = new Map<number, Severity>();
  const rank: Record<Severity, number> = { LOW: 1, MEDIUM: 2, CRITICAL: 3 };
  const workOrders: (string | number)[][] = [];
  for (let i = 0; i < WORK_ORDER_COUNT; i++) {
    const id = pick(ids);
    const defect = pick(DEFECTS);
    const open = rand() < 0.5;
    const created = new Date(now - Math.floor(rand() * 30 * 86_400_000));
    workOrders.push([id, defect.title, defect.severity, open ? "OPEN" : "CLOSED", sqlDate(created)]);
    const seen = worst.get(id);
    if (open && (!seen || rank[defect.severity] > rank[seen])) worst.set(id, defect.severity);
  }
  await pool.query(
    "INSERT INTO work_orders (aircraft_id, title, severity, status, created_at) VALUES ?",
    [workOrders],
  );

  const statuses: AircraftStatus[] = [];
  for (const id of ids) {
    const severity = worst.get(id);
    const status: AircraftStatus = !severity ? "READY" : severity === "CRITICAL" ? "GROUNDED" : "MAINTENANCE";
    statuses.push(status);
    await pool.query("UPDATE aircraft SET status = ?, flight_hours = ? WHERE id = ?", [
      status,
      Math.round((hours.get(id) ?? 0) * 10) / 10,
      id,
    ]);
  }

  console.log("Seeded:", { aircraft: ids.length, flights: flights.length, workOrders: workOrders.length });
  console.log("Fleet:", summarizeFleet(statuses));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
