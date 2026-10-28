import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "./cursor";
import { statusAfterWorkOrder, summarizeFleet, type AircraftStatus, type Severity } from "./domain";
import { createWorkOrderSchema } from "./schemas";

describe("summarizeFleet", () => {
  it("counts each status and computes readiness to one decimal", () => {
    const statuses: AircraftStatus[] = ["READY", "READY", "MAINTENANCE", "GROUNDED", "READY", "READY", "READY"];
    expect(summarizeFleet(statuses)).toEqual({
      total: 7,
      ready: 5,
      maintenance: 1,
      grounded: 1,
      readinessPct: 71.4,
    });
  });

  it("returns 0 readiness for an empty fleet instead of NaN", () => {
    expect(summarizeFleet([]).readinessPct).toBe(0);
  });
});

describe("statusAfterWorkOrder", () => {
  const cases: [AircraftStatus, Severity, AircraftStatus][] = [
    ["READY", "CRITICAL", "GROUNDED"],
    ["MAINTENANCE", "CRITICAL", "GROUNDED"],
    ["GROUNDED", "CRITICAL", "GROUNDED"],
    ["READY", "MEDIUM", "MAINTENANCE"],
    ["READY", "LOW", "MAINTENANCE"],
    ["MAINTENANCE", "LOW", "MAINTENANCE"],
    ["GROUNDED", "LOW", "GROUNDED"],
  ];
  it.each(cases)("%s + %s work order -> %s", (current, severity, expected) => {
    expect(statusAfterWorkOrder(current, severity)).toBe(expected);
  });
});

describe("flight cursor", () => {
  it("round-trips", () => {
    const cursor = { departedAt: "2026-10-27 09:15:00", id: 4821 };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("rejects values it did not produce", () => {
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(decodeCursor(Buffer.from("2026-10-27|12").toString("base64url"))).toBeNull();
  });
});

describe("createWorkOrderSchema", () => {
  it("trims the title and accepts a valid body", () => {
    const parsed = createWorkOrderSchema.parse({ aircraftId: 3, title: "  Brake wear check  ", severity: "LOW" });
    expect(parsed.title).toBe("Brake wear check");
  });

  it.each([
    { aircraftId: 0, title: "Valid title", severity: "LOW" },
    { aircraftId: 1.5, title: "Valid title", severity: "LOW" },
    { aircraftId: 1, title: "ab", severity: "LOW" },
    { aircraftId: 1, title: "Valid title", severity: "URGENT" },
    { title: "Valid title", severity: "LOW" },
  ])("rejects %j", (body) => {
    expect(createWorkOrderSchema.safeParse(body).success).toBe(false);
  });
});
