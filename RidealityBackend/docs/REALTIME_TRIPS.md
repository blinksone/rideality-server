# Real-time trips + dispatch

## Components

| Piece | Path |
|-------|------|
| Trip FSM | `src/services/tripStateMachine.service.ts` |
| Dispatch / matching | `src/services/dispatch.service.ts` |
| Driver geo (Redis) | `src/services/location.service.ts` |
| Trip REST | `src/routes/trip.routes.ts` → `/api/v1/trips` |
| Domain events (Redis pub/sub) | `src/realtime/` |
| Socket.IO gateway | `ws-gateway/` |
| Mobile contract | `docs/MOBILE_REALTIME_CONTRACT.md` |

## Run (monolith + WS)

```bash
# API (default :3000)
npm run dev

# Gateway (:3100) — separate process
cd ws-gateway && npm install && npm run dev
```

## Load test (double-dispatch lock)

```bash
npx tsx scripts/load-test-dispatch.ts
```

Exit 0 = no ride has >1 `DispatchLog` with `accepted`.
