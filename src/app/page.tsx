import { OperatorConsole } from "./operator-console";

export default function Home() {
  return (
    <main className="shell">
      <div className="topbar">
        <div>
          <h1>Brewery Process Console</h1>
          <p>Start a Temporal-backed batch, push fake sensor readings, and inspect live workflow state.</p>
        </div>
        <p className="note">Temporal UI: http://localhost:8233</p>
      </div>
      <OperatorConsole />
    </main>
  );
}
