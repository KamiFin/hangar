// Keyset pagination cursor: the (departed_at, id) of the last row the client saw.
// Server-only (uses Buffer). The raw DATETIME string is kept as is, so no timezone round trip.

const CURSOR_PATTERN = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\|(\d+)$/;

export interface FlightCursor {
  departedAt: string;
  id: number;
}

export function encodeCursor(cursor: FlightCursor): string {
  return Buffer.from(`${cursor.departedAt}|${cursor.id}`).toString("base64url");
}

export function decodeCursor(value: string): FlightCursor | null {
  const match = CURSOR_PATTERN.exec(Buffer.from(value, "base64url").toString("utf8"));
  if (!match) return null;
  return { departedAt: match[1] as string, id: Number(match[2]) };
}
