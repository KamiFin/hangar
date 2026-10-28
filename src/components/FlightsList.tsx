"use client";

import { useState } from "react";
import type { FlightRow, FlightsPage } from "@/lib/fleet";

const PAGE_SIZE = 15;

// Fixed UTC formatting on purpose: toLocaleString would differ between server and browser.
const formatDeparture = (iso: string) => `${iso.slice(0, 16).replace("T", " ")}Z`;
const formatDuration = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;

export function FlightsList({ initial }: { initial: FlightsPage }) {
  const [items, setItems] = useState<FlightRow[]>(initial.items);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/flights?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page: FlightsPage = await res.json();
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more flights");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Departed (UTC)</th>
              <th>Aircraft</th>
              <th>Route</th>
              <th className="num">Duration</th>
            </tr>
          </thead>
          <tbody>
            {items.map((f) => (
              <tr key={f.id}>
                <td className="mono">{formatDeparture(f.departedAt)}</td>
                <td className="mono">{f.tailNumber}</td>
                <td className="mono">
                  {f.origin} to {f.destination}
                </td>
                <td className="num">{formatDuration(f.durationMin)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 12, alignItems: "center" }}>
        {cursor ? (
          <button type="button" className="ghost" onClick={() => void loadMore()} disabled={loading}>
            {loading ? "Loading" : "Load older flights"}
          </button>
        ) : (
          <span className="note">End of the 90 day window.</span>
        )}
        {error && <span className="note" role="alert">{error}</span>}
        <span className="note">{items.length} loaded. Keyset cursor, not OFFSET.</span>
      </div>
    </div>
  );
}
