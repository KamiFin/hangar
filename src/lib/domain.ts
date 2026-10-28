// Pure domain rules. No I/O here, so they are cheap to test and safe to import from client code.

export const AIRCRAFT_STATUSES = ["READY", "MAINTENANCE", "GROUNDED"] as const;
export type AircraftStatus = (typeof AIRCRAFT_STATUSES)[number];

export const SEVERITIES = ["LOW", "MEDIUM", "CRITICAL"] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface FleetSummary {
  total: number;
  ready: number;
  maintenance: number;
  grounded: number;
  /** Share of the fleet that is READY, 0 to 100, one decimal. */
  readinessPct: number;
}

export function summarizeFleet(statuses: readonly AircraftStatus[]): FleetSummary {
  const count = (wanted: AircraftStatus) => statuses.filter((s) => s === wanted).length;
  const total = statuses.length;
  const ready = count("READY");
  return {
    total,
    ready,
    maintenance: count("MAINTENANCE"),
    grounded: count("GROUNDED"),
    readinessPct: total === 0 ? 0 : Math.round((ready / total) * 1000) / 10,
  };
}

/**
 * What a new open work order does to the aircraft.
 * CRITICAL grounds it. Anything else moves a READY aircraft to MAINTENANCE.
 * An aircraft that is already GROUNDED never gets better because a ticket was opened.
 */
export function statusAfterWorkOrder(current: AircraftStatus, severity: Severity): AircraftStatus {
  if (severity === "CRITICAL") return "GROUNDED";
  return current === "READY" ? "MAINTENANCE" : current;
}
