import { explainRecentFlights } from "@/lib/fleet";
import { jsonError, zodDetails } from "@/lib/http";
import { explainQuerySchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const parsed = explainQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return jsonError(400, "invalid_query", "Invalid query parameters", zodDetails(parsed.error.issues));
  }
  return Response.json({ plans: await explainRecentFlights(parsed.data.aircraftId) });
}
