"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { SEVERITIES, type AircraftStatus, type Severity } from "@/lib/domain";

interface AircraftOption {
  id: number;
  tailNumber: string;
  status: AircraftStatus;
}

interface SentRequest {
  key: string;
  body: { aircraftId: number; title: string; severity: Severity };
}

interface Outcome {
  tone: "ok" | "info" | "error";
  text: string;
}

export function WorkOrderForm({ aircraft }: { aircraft: AircraftOption[] }) {
  const router = useRouter();
  const [aircraftId, setAircraftId] = useState(aircraft[0]?.id ?? 0);
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<Severity>("MEDIUM");
  const [pending, setPending] = useState(false);
  const [last, setLast] = useState<SentRequest | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function send(request: SentRequest) {
    setPending(true);
    try {
      const res = await fetch("/api/work-orders", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": request.key },
        body: JSON.stringify(request.body),
      });
      const json = await res.json();
      if (res.status === 201) {
        setOutcome({
          tone: "ok",
          text: `201 Created. Work order #${json.workOrder.id}, aircraft is now ${json.aircraftStatus}.`,
        });
        setTitle("");
      } else if (res.status === 200) {
        setOutcome({
          tone: "info",
          text: `200 Replayed. Same Idempotency-Key, so no second work order (still #${json.workOrder.id}).`,
        });
      } else {
        const detail = json.error?.details?.[0]?.message ?? json.error?.message ?? "Request failed";
        setOutcome({ tone: "error", text: `${res.status} ${detail}` });
      }
      if (res.ok) router.refresh();
    } catch {
      // The request may or may not have reached the server. Resending with the same key is safe.
      setOutcome({ tone: "error", text: "Network error. Resend: the same key cannot create a duplicate." });
    } finally {
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const request: SentRequest = { key: crypto.randomUUID(), body: { aircraftId, title, severity } };
    setLast(request);
    void send(request);
  }

  return (
    <form onSubmit={onSubmit}>
      <label htmlFor="wo-aircraft">
        Aircraft
        <select id="wo-aircraft" value={aircraftId} onChange={(e) => setAircraftId(Number(e.target.value))}>
          {aircraft.map((a) => (
            <option key={a.id} value={a.id}>
              {a.tailNumber} ({a.status})
            </option>
          ))}
        </select>
      </label>

      <label htmlFor="wo-title">
        Defect
        <input
          id="wo-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Hydraulic pressure drift on system B"
          maxLength={120}
          autoComplete="off"
        />
      </label>

      <fieldset>
        <legend>Severity</legend>
        {SEVERITIES.map((s) => (
          <label key={s} className="sev">
            <input type="radio" name="severity" value={s} checked={severity === s} onChange={() => setSeverity(s)} />
            <span>{s}</span>
          </label>
        ))}
      </fieldset>

      <div className="row">
        <button type="submit" disabled={pending}>
          Open work order
        </button>
        {last && (
          <button type="button" className="ghost" disabled={pending} onClick={() => void send(last)}>
            Resend last request
          </button>
        )}
      </div>

      {outcome && (
        <div className={`outcome ${outcome.tone}`} role="status">
          {outcome.text}
        </div>
      )}
      <p className="note">
        CRITICAL grounds the aircraft. Every submit carries an Idempotency-Key, so a retry never creates a duplicate.
      </p>
    </form>
  );
}
