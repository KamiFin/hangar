import type { RowDataPacket } from "mysql2/promise";
import { decodeCursor, encodeCursor } from "./cursor";
import { getPool, toIsoUtc } from "./db";
import type { AircraftStatus } from "./domain";

export interface AircraftRow {
  id: number;
  tailNumber: string;
  model: string;
  base: string;
  status: AircraftStatus;
  flightHours: number;
  openWorkOrders: number;
}

export async function listAircraft(): Promise<AircraftRow[]> {
  // The correlated count is served by idx_work_orders_aircraft_status (aircraft_id, status).
  const [rows] = await getPool().query<(AircraftRow & RowDataPacket)[]>(
    `SELECT a.id,
            a.tail_number  AS tailNumber,
            a.model,
            a.base,
            a.status,
            a.flight_hours AS flightHours,
            (SELECT COUNT(*) FROM work_orders w
              WHERE w.aircraft_id = a.id AND w.status = 'OPEN') AS openWorkOrders
       FROM aircraft a
      ORDER BY a.tail_number`,
  );
  return rows;
}

export interface FlightRow {
  id: number;
  tailNumber: string;
  origin: string;
  destination: string;
  departedAt: string;
  durationMin: number;
}

export interface FlightsPage {
  items: FlightRow[];
  nextCursor: string | null;
}

export class InvalidCursorError extends Error {
  constructor() {
    super("Cursor is not valid");
    this.name = "InvalidCursorError";
  }
}

/**
 * Keyset pagination: "give me the rows after the last one I saw", not OFFSET.
 * Cost stays flat on page 500, and rows inserted meanwhile do not shift the pages.
 * The row-value comparison is served by idx_flights_departed (departed_at, id).
 */
export async function listFlights(opts: { cursor?: string; limit: number }): Promise<FlightsPage> {
  const after = opts.cursor ? decodeCursor(opts.cursor) : null;
  if (opts.cursor && !after) throw new InvalidCursorError();

  const params: (string | number)[] = [];
  let where = "";
  if (after) {
    where = "WHERE (f.departed_at, f.id) < (?, ?)";
    params.push(after.departedAt, after.id);
  }
  params.push(opts.limit + 1); // one extra row tells us whether there is a next page

  const [rows] = await getPool().query<(FlightRow & RowDataPacket)[]>(
    `SELECT f.id,
            a.tail_number  AS tailNumber,
            f.origin,
            f.destination,
            f.departed_at  AS departedAt,
            f.duration_min AS durationMin
       FROM flights f
       JOIN aircraft a ON a.id = f.aircraft_id
       ${where}
      ORDER BY f.departed_at DESC, f.id DESC
      LIMIT ?`,
    params,
  );

  const hasMore = rows.length > opts.limit;
  const page = hasMore ? rows.slice(0, opts.limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map((row) => ({
      id: row.id,
      tailNumber: row.tailNumber,
      origin: row.origin,
      destination: row.destination,
      departedAt: toIsoUtc(row.departedAt),
      durationMin: row.durationMin,
    })),
    nextCursor: hasMore && last ? encodeCursor({ departedAt: last.departedAt, id: last.id }) : null,
  };
}

export interface PlanRow {
  table: string | null;
  type: string | null;
  key: string | null;
  rows: number | null;
  extra: string | null;
}

export interface QueryPlan {
  label: string;
  sql: string;
  plan: PlanRow[];
}

/** The same query planned twice: once as written, once with every index ignored. */
export async function explainRecentFlights(aircraftId: number): Promise<QueryPlan[]> {
  const variants = [
    {
      label: "As written",
      sql: `SELECT id, origin, destination, departed_at
  FROM flights
 WHERE aircraft_id = ${aircraftId}
 ORDER BY departed_at DESC
 LIMIT 10`,
    },
    {
      label: "Indexes ignored",
      sql: `SELECT id, origin, destination, departed_at
  FROM flights IGNORE INDEX (idx_flights_aircraft_departed, idx_flights_departed)
 WHERE aircraft_id = ${aircraftId}
 ORDER BY departed_at DESC
 LIMIT 10`,
    },
  ];

  const plans: QueryPlan[] = [];
  for (const variant of variants) {
    // aircraftId is a validated integer (see explainQuerySchema), so inlining it is safe here.
    const [rows] = await getPool().query<RowDataPacket[]>(`EXPLAIN ${variant.sql}`);
    plans.push({
      label: variant.label,
      sql: variant.sql,
      plan: rows.map((r) => ({
        table: (r.table as string | null) ?? null,
        type: (r.type as string | null) ?? null,
        key: (r.key as string | null) ?? null,
        rows: r.rows == null ? null : Number(r.rows),
        extra: (r.Extra as string | null) ?? null,
      })),
    });
  }
  return plans;
}
