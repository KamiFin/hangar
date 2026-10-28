import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool, toIsoUtc } from "./db";
import { statusAfterWorkOrder, type AircraftStatus, type Severity } from "./domain";
import type { CreateWorkOrderInput } from "./schemas";

export interface WorkOrder {
  id: number;
  aircraftId: number;
  title: string;
  severity: Severity;
  status: "OPEN" | "CLOSED";
  createdAt: string;
}

interface Found {
  workOrder: WorkOrder;
  aircraftStatus: AircraftStatus;
}

export type CreateResult =
  | ({ kind: "created" } & Found)
  | ({ kind: "replayed" } & Found)
  | { kind: "aircraft_not_found" }
  | { kind: "key_conflict" };

type WorkOrderRow = RowDataPacket &
  Omit<WorkOrder, "createdAt"> & { createdAt: string; aircraftStatus: AircraftStatus };

const SELECT_WORK_ORDER = `
  SELECT w.id, w.aircraft_id AS aircraftId, w.title, w.severity, w.status,
         w.created_at AS createdAt, a.status AS aircraftStatus
    FROM work_orders w
    JOIN aircraft a ON a.id = w.aircraft_id`;

function toFound(row: WorkOrderRow): Found {
  return {
    workOrder: {
      id: row.id,
      aircraftId: row.aircraftId,
      title: row.title,
      severity: row.severity,
      status: row.status,
      createdAt: toIsoUtc(row.createdAt),
    },
    aircraftStatus: row.aircraftStatus,
  };
}

async function findByKey(key: string): Promise<Found | null> {
  const [rows] = await getPool().query<WorkOrderRow[]>(
    `${SELECT_WORK_ORDER} WHERE w.idempotency_key = ?`,
    [key],
  );
  return rows[0] ? toFound(rows[0]) : null;
}

async function findById(id: number): Promise<Found> {
  const [rows] = await getPool().query<WorkOrderRow[]>(`${SELECT_WORK_ORDER} WHERE w.id = ?`, [id]);
  const row = rows[0];
  if (!row) throw new Error(`Work order ${id} vanished after insert`);
  return toFound(row);
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ER_DUP_ENTRY";
}

function sameRequest(found: Found, input: CreateWorkOrderInput): boolean {
  const w = found.workOrder;
  return w.aircraftId === input.aircraftId && w.title === input.title && w.severity === input.severity;
}

/**
 * Opens a work order and updates the aircraft status in one transaction.
 *
 * Idempotency: the same Idempotency-Key never creates a second row. A retry gets the
 * original result back ("replayed"). Reusing a key for a different payload is a conflict.
 *
 * Concurrency: the aircraft row is locked with FOR UPDATE, so two requests for the same
 * aircraft serialize. If two requests race with the same key, the UNIQUE index decides
 * the winner and the loser falls back to reading the winner's row.
 */
export async function createWorkOrder(
  input: CreateWorkOrderInput,
  idempotencyKey: string | null,
): Promise<CreateResult> {
  if (idempotencyKey) {
    const existing = await findByKey(idempotencyKey);
    if (existing) {
      return sameRequest(existing, input) ? { kind: "replayed", ...existing } : { kind: "key_conflict" };
    }
  }

  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();

    const [aircraft] = await conn.query<(RowDataPacket & { status: AircraftStatus })[]>(
      "SELECT status FROM aircraft WHERE id = ? FOR UPDATE",
      [input.aircraftId],
    );
    const current = aircraft[0];
    if (!current) {
      await conn.rollback();
      return { kind: "aircraft_not_found" };
    }

    const [inserted] = await conn.query<ResultSetHeader>(
      "INSERT INTO work_orders (aircraft_id, title, severity, idempotency_key) VALUES (?, ?, ?, ?)",
      [input.aircraftId, input.title, input.severity, idempotencyKey],
    );

    const next = statusAfterWorkOrder(current.status, input.severity);
    if (next !== current.status) {
      await conn.query("UPDATE aircraft SET status = ? WHERE id = ?", [next, input.aircraftId]);
    }

    await conn.commit();
    return { kind: "created", ...(await findById(inserted.insertId)) };
  } catch (err) {
    await conn.rollback().catch(() => undefined);
    if (idempotencyKey && isDuplicateKey(err)) {
      const winner = await findByKey(idempotencyKey);
      if (winner) {
        return sameRequest(winner, input) ? { kind: "replayed", ...winner } : { kind: "key_conflict" };
      }
    }
    throw err;
  } finally {
    conn.release();
  }
}
