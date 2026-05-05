# Phase 0/1 Handoff: Next.js-First Brewery Temporal Demo

## Why this implementation exists

The original concept called for a Python Temporal backend, a fake sensor simulator, a React UI, and later AI agents. We intentionally pivoted Phase 0/1 to a Next.js-first TypeScript implementation because this is a hackathon demo and fewer runtimes make it easier for multiple people to branch out quickly.

The resulting shape is:

- Next.js owns the UI and API routes.
- Temporal still owns durable workflow state.
- The Temporal worker is the only separate long-running Node process.
- Fake sensors are TypeScript, usable from both API routes and a CLI.
- Local JSONL files are demo read models, not the source of truth.

This keeps the demo approachable while preserving the important Temporal behavior: timers, workflow queries, signals, child workflows, and worker restart resilience.

## What was implemented

Phase 0 created the project foundation:

- Root-level Next.js App Router project.
- TypeScript, ESLint, Vitest, and pnpm setup.
- Docker Compose for a local Temporal dev server.
- Shared domain types and Zod request schemas.
- Temporal client helpers and workflow id helpers.
- Local `.runtime/*.jsonl` append/read helpers.
- Basic README setup and demo instructions.

Phase 1 implemented the first working backend/demo slice:

- `brewDayWorkflow`
  - Workflow id: `brew-day-${batchId}`.
  - Stages: `mash`, `boil`, `chill`, then `fermentation`.
  - Compressed demo timers: 10s, 10s, 5s.
  - Starts `fermentationMonitorWorkflow` as a child workflow.
  - Exposes `getBrewStatus` query.

- `fermentationMonitorWorkflow`
  - Workflow id: `fermentation-${batchId}`.
  - Accepts sensor readings, manual overrides, and QA approval signals.
  - Exposes `getFermentationStatus` query.
  - Detects temperature excursions, gravity plateau, pH out of range, and CO2 drop.
  - Creates pending QA tasks for gravity plateau and repeated temperature excursions.

- Activities
  - Append batch events, readings, alarms, and manual tasks to JSONL files.
  - Print alarm notifications to console.

- Next.js API routes
  - `POST /api/batches`
  - `GET /api/batches/[batchId]/status`
  - `POST /api/batches/[batchId]/signals`
  - `POST /api/batches/[batchId]/qa/[taskId]/approve`
  - `POST /api/simulator/[batchId]/tick`
  - `POST /api/simulator/[batchId]/inject`

- Fake sensor simulator
  - Scenarios: `normal`, `stuck_fermentation`, `temp_spike`, `crash_recovery`.
  - Shared generator used by API routes and CLI.
  - CLI script: `pnpm sim:run -- --batch-id <id> --scenario temp_spike --tick-seconds 2`.

- Minimal operator console
  - Start a batch.
  - Fetch current status.
  - Emit a normal simulator tick.
  - Inject a temperature spike.

## Important files

- `src/app/`
  - Next.js UI and API route handlers.
  - `src/app/operator-console.tsx` is the minimal Phase 1 demo screen.

- `src/lib/domain/`
  - Shared types, Zod schemas, and alarm detection logic.
  - This is the best place for Phase 2 UI and Phase 3/4 agents to reuse canonical shapes.

- `src/lib/temporal/`
  - Temporal client and workflow id helpers.
  - API routes use these helpers to start/query/signal workflows.

- `src/temporal/workflows/`
  - Durable workflow logic.
  - Keep this code deterministic: no direct Node APIs, filesystem access, random numbers, network calls, or non-workflow-safe imports.

- `src/temporal/activities/`
  - Side effects called from workflows.
  - Filesystem writes and console alarms live here, not inside workflows.

- `src/simulator/`
  - Fake sensor reading generation and continuous CLI.

- `src/runtime/`
  - JSONL read-model helpers.
  - These files support demo auditing and future UI feeds.

## Why these choices were made

- Next.js App Router was used so the hackathon team can build UI and API behavior in one project.
- Temporal TypeScript SDK was used instead of Python to avoid a second backend runtime.
- The Temporal worker remains separate because workers are long-running pollers and should not run inside request/response route handlers.
- JSONL files were chosen instead of a database because Phase 0/1 needs inspectable local persistence without schema/migration overhead.
- Workflow state remains the source of truth because Temporal handles durable timers, signals, and recovery.
- Zod schemas were added at API boundaries so later phases can safely add AI tool calls without trusting arbitrary payloads.
- A small operator console was added now so Phase 1 can be demoed before the full Phase 2 dashboard exists.

## How to run locally

Install dependencies:

```bash
pnpm install
```

Start Temporal:

```bash
pnpm temporal:up
```

Start the Temporal worker:

```bash
pnpm temporal:worker
```

Start Next.js:

```bash
pnpm dev
```

Open:

- App: http://localhost:3000
- Temporal Web UI: http://localhost:8233

Known local caveat: Docker Desktop must be running before `pnpm temporal:up` works.

## Verification already completed

The following checks passed:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The Temporal workflow bundle was also verified directly with `bundleWorkflowCode`, which catches workflow import/determinism bundling issues that plain TypeScript does not.

Full end-to-end Temporal execution was not completed because Docker Desktop was not running in the current environment.

## Suggested branch split for next phases

### Phase 2: Process UI branch

Good starting points:

- `src/app/operator-console.tsx`
- `src/app/styles.css`
- `src/app/api/batches/[batchId]/status/route.ts`
- `src/lib/domain/types.ts`

Recommended work:

- Replace the minimal console with a real dashboard.
- Add batch list/read-model routes by reading `.runtime/events.jsonl`.
- Add live sensor charts using `recharts`.
- Add alarm feed and manual task queue.
- Add QA approval UI wired to the existing approval route.
- Keep polling first; WebSockets can come later.

### Phase 3: Brewmaster AI agent branch

Good starting points:

- `src/app/api/batches/[batchId]/status/route.ts`
- `src/app/api/batches/[batchId]/signals/route.ts`
- `src/lib/domain/schemas.ts`
- `src/lib/temporal/client.ts`

Recommended work:

- Add `POST /api/agents/brewmaster/chat`.
- Implement tools around existing API/domain functions:
  - get batch status.
  - get sensor history from JSONL.
  - send validated workflow signal.
  - approve QA task.
- Keep the brewmaster persona operator-facing.
- Require confirmation for manual override style actions.

### Phase 4: Customer support agent branch

Good starting points:

- `src/lib/domain/types.ts`
- `src/runtime/jsonl.ts`
- `src/app/api/batches/[batchId]/status/route.ts`

Recommended work:

- Add order and inventory domain models.
- Add local JSONL persistence for orders/inventory.
- Add `POST /api/agents/support/chat`.
- Implement tools:
  - get batch ETA.
  - check inventory.
  - create order.
- Keep support responses customer-safe and separate from operational alarm details.

### Temporal/workflow hardening branch

Good starting points:

- `src/temporal/workflows/brew-day.ts`
- `src/temporal/workflows/fermentation.ts`
- `src/lib/domain/alarms.ts`

Recommended work:

- Add Temporal workflow tests using `@temporalio/testing`.
- Add idempotency rules for repeated sensor alarms.
- Add richer stage/event history queries.
- Decide whether brew workflow should complete after handoff or remain open as the parent batch workflow.

## Things collaborators should avoid

- Do not put filesystem, database, network, random id generation, or `Date.now()` dependent business logic directly in workflow code unless it is workflow-safe.
- Do not start a Temporal worker from a Next.js route handler.
- Do not treat `.runtime/*.jsonl` as canonical workflow state.
- Do not duplicate domain types inside UI or agent code; import from `src/lib/domain`.
- Do not add Python unless the team explicitly decides to reintroduce a second backend runtime.

## Current limitations

- There is no full Phase 2 dashboard yet.
- The API does not currently expose batch lists or sensor-history list endpoints.
- JSONL writes are append-only and simple; they are fine for a demo but not a production persistence layer.
- Workflow tests are planned but not implemented yet.
- Slack/email alarms are console-only for now.
- AI agents are not implemented yet.
