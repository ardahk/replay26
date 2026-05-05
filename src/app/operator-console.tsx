"use client";

import { Activity, FlaskConical, RefreshCw, ThermometerSun } from "lucide-react";
import { useState } from "react";

export function OperatorConsole() {
  const [batchId, setBatchId] = useState("");
  const [beerName, setBeerName] = useState("Hazy IPA");
  const [status, setStatus] = useState<unknown>({ message: "Ready." });
  const [busy, setBusy] = useState(false);

  async function callApi(path: string, init?: RequestInit) {
    setBusy(true);
    try {
      const response = await fetch(path, {
        ...init,
        headers: {
          "content-type": "application/json",
          ...(init?.headers ?? {})
        }
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? response.statusText);
      setStatus(json);
      if (json.batchId) setBatchId(json.batchId);
    } catch (error) {
      setStatus({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid">
      <div className="panel">
        <div className="controls">
          <label className="note" htmlFor="beer-name">
            Beer name
          </label>
          <input id="beer-name" value={beerName} onChange={(event) => setBeerName(event.target.value)} />
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              callApi("/api/batches", {
                method: "POST",
                body: JSON.stringify({ beerName })
              })
            }
          >
            <FlaskConical size={18} />
            Start Batch
          </button>

          <label className="note" htmlFor="batch-id">
            Batch ID
          </label>
          <input id="batch-id" value={batchId} onChange={(event) => setBatchId(event.target.value)} placeholder="batch id" />

          <div className="button-row">
            <button disabled={busy || !batchId} onClick={() => callApi(`/api/batches/${batchId}/status`)}>
              <RefreshCw size={18} />
              Fetch Status
            </button>
            <button
              disabled={busy || !batchId}
              onClick={() =>
                callApi(`/api/simulator/${batchId}/tick`, {
                  method: "POST",
                  body: JSON.stringify({ scenario: "normal" })
                })
              }
            >
              <Activity size={18} />
              Tick Sensor
            </button>
          </div>

          <button
            className="warn"
            disabled={busy || !batchId}
            onClick={() =>
              callApi(`/api/simulator/${batchId}/inject`, {
                method: "POST",
                body: JSON.stringify({ kind: "temp_spike" })
              })
            }
          >
            <ThermometerSun size={18} />
            Inject Temp Spike
          </button>

          <p className="note">Sensor signals work once the brew workflow reaches fermentation after the compressed mash, boil, and chill timers.</p>
        </div>
      </div>

      <div className="panel">
        <pre className="status">{JSON.stringify(status, null, 2)}</pre>
      </div>
    </section>
  );
}
