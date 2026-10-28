import { InvalidCursorError, listFlights } from "@/lib/fleet";
import { jsonError, zodDetails } from "@/lib/http";
import { flightsQuerySchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = flightsQuerySchema.safeParse(params);
  if (!parsed.success) {
    return jsonError(400, "invalid_query", "Invalid query parameters", zodDetails(parsed.error.issues));
  }
  try {
    return Response.json(await listFlights(parsed.data));
  } catch (err) {
    if (err instanceof InvalidCursorError) return jsonError(400, "invalid_cursor", err.message);
    throw err;
  }
}
