import { FlightsList } from "@/components/FlightsList";
import { WorkOrderForm } from "@/components/WorkOrderForm";
import { summarizeFleet } from "@/lib/domain";
import { explainRecentFlights, listAircraft, listFlights, type QueryPlan } from "@/lib/fleet";

export const dynamic = "force-dynamic";

function PlanCard({ plan }: { plan: QueryPlan }) {
  const step = plan.plan[0];
  const fullScan = step?.type === "ALL";
  return (
    <div className="plan">
      <h3>
        {plan.label}
        <span className={`pill ${fullScan ? "warn" : "good"}`}>{fullScan ? "full table scan" : "index lookup"}</span>
      </h3>
      <pre>{plan.sql}</pre>
      {step && (
        <dl className="kv">
          <dt>access type</dt>
          <dd>{step.type ?? "n/a"}</dd>
          <dt>index used</dt>
          <dd>{step.key ?? "none"}</dd>
          <dt>rows examined</dt>
          <dd>~{step.rows?.toLocaleString("en-US") ?? "n/a"}</dd>
          <dt>extra</dt>
          <dd>{step.extra ?? "none"}</dd>
        </dl>
      )}
    </div>
  );
}

export default async function Page() {
  const aircraft = await listAircraft();
  const first = aircraft[0];
  const [flights, plans] = await Promise.all([
    listFlights({ limit: 15 }),
    first ? explainRecentFlights(first.id) : Promise.resolve([]),
  ]);

  const summary = summarizeFleet(aircraft.map((a) => a.status));
  const share = (n: number) => (summary.total === 0 ? 0 : (n / summary.total) * 100);

  return (
    <div className="shell">
      <header className="top">
        <h1>
          Hangar <span>fleet readiness</span>
        </h1>
        <div className="chips">
          <span className="chip">synthetic data</span>
          <span className="chip">Next.js + TypeScript</span>
          <span className="chip">MySQL 8.4</span>
        </div>
      </header>

      <div className="stack">
        <section aria-label="Fleet summary">
          <div className="kpis">
            <div className="kpi main">
              <div className="label">Readiness</div>
              <div className="value">{summary.readinessPct.toFixed(1)}%</div>
              <div className="bar" role="img" aria-label="Share of ready, maintenance and grounded aircraft">
                <span className="b-ready" style={{ width: `${share(summary.ready)}%` }} />
                <span className="b-maint" style={{ width: `${share(summary.maintenance)}%` }} />
                <span className="b-grounded" style={{ width: `${share(summary.grounded)}%` }} />
              </div>
            </div>
            <div className="kpi ready">
              <div className="label">Ready</div>
              <div className="value">{summary.ready}</div>
            </div>
            <div className="kpi maint">
              <div className="label">Maintenance</div>
              <div className="value">{summary.maintenance}</div>
            </div>
            <div className="kpi grounded">
              <div className="label">Grounded</div>
              <div className="value">{summary.grounded}</div>
            </div>
          </div>
        </section>

        <div className="cols">
          <section className="panel" aria-label="Aircraft">
            <h2>Aircraft ({summary.total})</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tail</th>
                    <th>Model</th>
                    <th>Base</th>
                    <th className="num">Hours</th>
                    <th>Status</th>
                    <th className="num">Open WO</th>
                  </tr>
                </thead>
                <tbody>
                  {aircraft.map((a) => (
                    <tr key={a.id}>
                      <td className="mono">{a.tailNumber}</td>
                      <td>{a.model}</td>
                      <td className="mono">{a.base}</td>
                      <td className="num">{a.flightHours.toLocaleString("en-US", { minimumFractionDigits: 1 })}</td>
                      <td>
                        <span className={`pill ${a.status}`}>{a.status}</span>
                      </td>
                      <td className="num">{a.openWorkOrders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel" aria-label="Open a work order">
            <h2>Open a work order</h2>
            <WorkOrderForm aircraft={aircraft.map(({ id, tailNumber, status }) => ({ id, tailNumber, status }))} />
          </section>
        </div>

        <section className="panel" aria-label="Recent flights">
          <h2>Recent flights</h2>
          <FlightsList initial={flights} />
        </section>

        <section className="panel" aria-label="Query plans">
          <h2>Why the index matters{first ? `: recent flights of ${first.tailNumber}` : ""}</h2>
          <div className="plans">
            {plans.map((plan) => (
              <PlanCard key={plan.label} plan={plan} />
            ))}
          </div>
          <p className="note" style={{ marginTop: 12 }}>
            Live EXPLAIN output from MySQL, run on page load. The composite index (aircraft_id, departed_at) lets the
            database jump to one aircraft and read its newest flights already in order.
          </p>
        </section>
      </div>

      <footer>All aircraft, flights and defects are synthetic. Built as a small demo, not a product.</footer>
    </div>
  );
}
