# Replay 26 Brewery Demo

Next.js-first hackathon demo for a brewery process system backed by Temporal workflows.

## What is included

- Next.js App Router UI and API routes
- Temporal TypeScript workflows for brew day and fermentation monitoring
- Fake sensor simulator in TypeScript
- JSONL demo read models in `.runtime/`
- Local Temporal dev server through Docker Compose

## Project notes

Phase/worktree notes live in [`docs/`](./docs/README.md):

- [Phase 0/1 Handoff](./docs/phase-0-1-handoff.md)
- [Phase 2-4 Changes](./docs/phase-2-4-changes.md)

## Setup

```bash
pnpm install
```

Start Temporal:

```bash
pnpm temporal:up
```

In another terminal, start the Temporal worker:

```bash
pnpm temporal:worker
```

In another terminal, start Next.js:

```bash
pnpm dev
```

Open:

- Demo UI: http://localhost:3000
- Temporal Web UI: http://localhost:8233

## Demo flow

1. Start Temporal with `pnpm temporal:up`.
2. Start the worker with `pnpm temporal:worker`.
3. Start the app with `pnpm dev`.
4. Use the operator console to start a batch.
5. Wait for the compressed brew timers to finish: mash 10s, boil 10s, chill 5s.
6. Trigger simulator ticks or inject a temperature spike.
7. Fetch status and inspect alarms/manual QA tasks.

You can also run a continuous simulator:

```bash
pnpm sim:run -- --batch-id <batch-id> --scenario temp_spike --tick-seconds 2
```

## API quickstart

Start a batch:

```bash
curl -X POST http://localhost:3000/api/batches \
  -H 'content-type: application/json' \
  -d '{"beerName":"Hazy IPA"}'
```

Get status:

```bash
curl http://localhost:3000/api/batches/<batch-id>/status
```

Emit one simulator tick:

```bash
curl -X POST http://localhost:3000/api/simulator/<batch-id>/tick \
  -H 'content-type: application/json' \
  -d '{"scenario":"normal"}'
```

Inject a spike:

```bash
curl -X POST http://localhost:3000/api/simulator/<batch-id>/inject \
  -H 'content-type: application/json' \
  -d '{"kind":"temp_spike"}'
```

## Validation

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
