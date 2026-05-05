# Phase 2-4 Change Record: Dashboard, Agents, Support Tools, and Hardening

## Summary

This worktree extended the Phase 0/1 Next.js + Temporal demo into a fuller hackathon experience. The minimal operator console was replaced with a real brewery process dashboard, read-model APIs were added for polling JSONL state, deterministic agent endpoints were introduced for the brewmaster and customer support personas, and several hardening pieces were added around alarm dedupe, manual task reconciliation, and demo seeding.

The guiding choice was to keep everything TypeScript/Next.js-first while preserving Temporal as the durable workflow source of truth.

## What Changed

### Process Dashboard

Replaced the initial `OperatorConsole` with a multi-section dashboard:

- Batch controls for starting batches and selecting active batches.
- Status board showing stage, health, updated time, reading count, and latest sensor values.
- Sensor chart using `recharts`, isolated in `src/app/sensor-chart.tsx` to avoid static prerender chart warnings.
- Alarm feed grouped visually by severity.
- Manual QA queue with approval buttons.
- Simulator controls for:
  - normal tick;
  - temp spike;
  - stuck fermentation;
  - crash recovery.
- Separate Operations and Support tabs.
- Brewmaster sidebar chat for operator-facing workflow help.
- Customer support chat for ETA, inventory, and order help.

Why:

- Phase 2 needed the actual usable dashboard as the first screen, not a landing page or raw JSON console.
- Polling was kept simple for the hackathon and avoids WebSocket complexity.
- The UI reads shared domain types from `src/lib/domain` so later branches do not invent duplicate shapes.

Important files:

- `src/app/operator-console.tsx`
- `src/app/sensor-chart.tsx`
- `src/app/styles.css`

## Read-Model APIs

Added JSONL-backed read-model helpers and API routes:

- `GET /api/batches`
- `GET /api/batches/[batchId]/sensor-history`
- `GET /api/batches/[batchId]/alarms`
- `GET /api/manual-tasks`
- `GET /api/inventory`
- `POST /api/inventory`
- `GET /api/orders`
- `POST /api/orders`

Why:

- The UI needs efficient polling routes instead of reconstructing every view from live Temporal queries.
- JSONL stays appropriate for a hackathon: inspectable, simple, and no migration overhead.
- Batch summaries can now be derived from recorded workflow events instead of guessed workflow ids.

Important files:

- `src/runtime/read-model.ts`
- `src/runtime/jsonl.ts`
- `src/app/api/batches/route.ts`
- `src/app/api/manual-tasks/route.ts`
- `src/app/api/inventory/route.ts`
- `src/app/api/orders/route.ts`

## Brewmaster Agent

Added a deterministic brewmaster agent endpoint:

- `POST /api/agents/brewmaster/chat`

Implemented tool-style behavior:

- Reads batch status through Temporal when available.
- Reads sensor history, alarms, and manual tasks through JSONL read models.
- Can propose QA approval.
- Can propose a manual override signal.
- Requires explicit confirmation before sending workflow-changing signals.

Why:

- The plan called for an AI agent with tool calls, but this hackathon branch should work without external provider keys.
- The endpoint preserves the provider boundary: a future branch can swap the deterministic response builder for Anthropic/OpenAI while keeping the same route/tool contract.
- Confirmation keeps agent-triggered workflow mutation visible and deliberate.

Important file:

- `src/app/api/agents/brewmaster/chat/route.ts`

## Customer Support Agent

Added a deterministic support agent endpoint:

- `POST /api/agents/support/chat`

Added customer-facing support behavior:

- ETA answers from live batch summaries.
- Inventory lookup.
- Demo order creation.
- Customer-safe language that does not expose raw internal alarms.

Why:

- The support persona should stay separate from the brewmaster persona.
- Support flows need order and inventory concepts that are distinct from brewery operations.
- Deterministic local behavior keeps the branch demoable without AI provider setup.

Important files:

- `src/app/api/agents/support/chat/route.ts`
- `src/lib/domain/types.ts`
- `src/lib/domain/schemas.ts`

## Domain and Persistence Changes

Added domain types:

- `BatchEvent`
- `BatchSummary`
- `Customer`
- `InventoryItem`
- `Order`

Expanded JSONL persistence:

- `events`
- `readings`
- `alarms`
- `manual_tasks`
- `inventory`
- `orders`

Updated `appendJsonl` to use append semantics instead of read/overwrite semantics.

Why:

- Phase 2-4 needs stable shared shapes for UI, agent tools, support workflows, and read-model APIs.
- Append-only persistence better matches event/read-model behavior and avoids rewriting whole files on every activity.
- The Turbopack ignore hint keeps runtime file access from causing noisy production build tracing warnings.

Important files:

- `src/lib/domain/types.ts`
- `src/lib/domain/schemas.ts`
- `src/runtime/jsonl.ts`
- `src/runtime/read-model.ts`

## Temporal and Workflow Hardening

Updated workflow/activity behavior:

- Batch events now include `beerName` metadata.
- Fermentation event records include `beerName`.
- Repeated alarms are deduped by alarm type in workflow state.
- Repeated temperature excursions still count toward the QA task rule.
- Manual QA task status can be reconciled from `qa_approved` events in the read model.
- The parent brew workflow remains open after fermentation handoff, preserving the Phase 1 lifecycle decision for easier demo querying.

Why:

- The dashboard needs meaningful batch names and stable stage summaries.
- Alarm feeds should not flood the UI when the simulator runs repeatedly.
- Manual task read models need to reflect approval even though the original task entry is append-only.

Important files:

- `src/temporal/workflows/brew-day.ts`
- `src/temporal/workflows/fermentation.ts`
- `src/temporal/activities/index.ts`

## Demo and Test Additions

Added:

- `pnpm demo:seed`
- `src/simulator/demo-seed.ts`
- opt-in Temporal workflow test scaffold in `src/temporal/workflows/workflows.test.ts`

Why:

- A seed script makes it easier to leave the demo in a presentation-ready state.
- Temporal integration tests are useful, but they are opt-in so normal `pnpm test` remains fast and does not require a Temporal test server.

## Verification Performed

The following passed after this work:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Temporal workflow bundling was also verified directly with `bundleWorkflowCode`.

Local API smoke checks were run against the Next dev server:

- `GET /api/batches`
- `GET /api/inventory`
- `POST /api/agents/support/chat`

## Known Caveats

- Full Temporal end-to-end testing still requires Docker Desktop running.
- The brewmaster and support agents are deterministic tool simulators, not live LLM integrations yet.
- The opt-in Temporal workflow test scaffold is skipped unless `RUN_TEMPORAL_TESTS=1`.
- JSONL persistence is good for hackathon demos, not production storage.
- The dashboard polls; WebSockets or SSE can be a future branch.

## Recommended Next Branches

### Live AI Provider Branch

- Add provider adapter under `src/lib/agents/`.
- Keep existing route contracts.
- Add provider env vars to `.env.example`.
- Preserve deterministic fallback for demos without keys.

### Workflow Test Branch

- Turn the opt-in scaffold into real `@temporalio/testing` coverage.
- Cover brew timers, child workflow handoff, sensor signal handling, alarm creation, and QA task creation.

### Persistence Branch

- Replace JSONL with SQLite or Postgres if the demo needs multi-user durability.
- Keep route response shapes stable so UI and agents do not churn.

### Real-Time UI Branch

- Add SSE or WebSocket updates for status, readings, alarms, and QA tasks.
- Keep polling as a fallback.
