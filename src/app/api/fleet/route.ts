import { summarizeFleet } from "@/lib/domain";
import { listAircraft } from "@/lib/fleet";

export const dynamic = "force-dynamic";

export async function GET() {
  const aircraft = await listAircraft();
  return Response.json({ summary: summarizeFleet(aircraft.map((a) => a.status)), aircraft });
}
