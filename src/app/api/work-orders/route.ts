import { jsonError, zodDetails } from "@/lib/http";
import { createWorkOrderSchema, idempotencyKeySchema } from "@/lib/schemas";
import { createWorkOrder } from "@/lib/work-orders";

export const dynamic = "force-dynamic";

/**
 * POST /api/work-orders
 * Header  Idempotency-Key: <uuid>   (optional, recommended for retries)
 * Body    { aircraftId, title, severity }
 *
 * 201 created, 200 replayed (same key, same body), 400 invalid input,
 * 404 unknown aircraft, 422 key reused with a different body.
 */
export async function POST(request: Request) {
  const rawKey = request.headers.get("idempotency-key");
  let key: string | null = null;
  if (rawKey !== null) {
    const parsedKey = idempotencyKeySchema.safeParse(rawKey);
    if (!parsedKey.success) {
      return jsonError(400, "invalid_idempotency_key", "Idempotency-Key must be a UUID");
    }
    key = parsedKey.data;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "Request body must be valid JSON");
  }

  const parsed = createWorkOrderSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "invalid_body", "Invalid work order", zodDetails(parsed.error.issues));
  }

  const result = await createWorkOrder(parsed.data, key);
  switch (result.kind) {
    case "created":
      return Response.json(
        { workOrder: result.workOrder, aircraftStatus: result.aircraftStatus },
        { status: 201 },
      );
    case "replayed":
      return Response.json(
        { workOrder: result.workOrder, aircraftStatus: result.aircraftStatus },
        { status: 200, headers: { "Idempotent-Replayed": "true" } },
      );
    case "aircraft_not_found":
      return jsonError(404, "aircraft_not_found", "No aircraft with that id");
    case "key_conflict":
      return jsonError(422, "idempotency_key_reused", "This Idempotency-Key was used with a different request");
  }
}
