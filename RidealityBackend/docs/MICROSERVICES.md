# Rideality microservices (phase 1)

## What changed

The modular monolith can still run as one process (`npm run dev`).

A **microservices mode** splits the same domain modules into separate processes:

| Service | Port | Owns |
|---------|------|------|
| **api-gateway** | 3000 | Public entry, proxies by path |
| **auth-service** | 3001 | `/api/v1/auth/*` |
| **user-service** | 3002 | `/api/v1/onboarding/*`, `/api/v1/users/*` |
| **fleet-service** | 3003 | `/api/v1/fleet/*`, `/api/v1/admin/fleets/*` |
| **finance-service** | 3004 | `/api/v1/admin/finance/*` |
| **admin-service** | 3005 | admin users, roles, permissions, regions, portal |

**Phase 1:** process-per-domain + gateway (shared PostgreSQL + Redis).  
**Phase 2:** finance owns wallet **writes** via internal API + client adapter.

Clients (Admin UI, mobile) **do not change base URL** when using the gateway (`:3000`).

## Run locally (processes)

```bash
# Postgres + Redis
docker compose up -d

# All domain services + gateway
npm run ms:start
# or: bash scripts/start-microservices.sh
```

Logs: `logs/microservices/{auth,users,fleet,finance,admin,gateway}.log`

Single service:

```bash
SERVICE_NAME=auth PORT=3001 npm run ms:run
```

Monolith (unchanged):

```bash
npm run dev
```

## Run with Docker

```bash
docker compose -f docker-compose.yml -f docker-compose.microservices.yml up --build
```

## Health checks

- Gateway: `GET http://localhost:3000/health` (lists upstreams)
- Auth: `GET http://localhost:3001/health`
- Users: `GET http://localhost:3002/health`
- …

## Phase 2 — Finance owns wallet writes

Domain services **must not** mutate `Wallet` / ledger rows directly.

| Caller | Path |
|--------|------|
| auth (new user) | `finance.client.ensureUserWallet` → HTTP (or local in monolith) |
| fleet (new company) | `finance.client.ensureFleetWallet` |
| admin (user penalty) | `finance.client.applyWalletPenalty` |
| finance-service | local `wallet.service` + admin finance routes |

### Internal API (not on public gateway)

Base: `{FINANCE_SERVICE_URL}/api/v1/internal/finance`

Header: `X-Internal-Service-Secret: {INTERNAL_SERVICE_SECRET}`

| Method | Path | Body |
|--------|------|------|
| POST | `/wallets/user` | `{ userId, currency }` |
| POST | `/wallets/fleet` | `{ fleetCompanyId, regionId, currency }` |
| POST | `/penalties` | `{ actorId, userId, amount, reason, ipAddress? }` |

Enforcement: `wallet.service` mutation helpers throw `WALLET_OWNERSHIP_VIOLATION` when `SERVICE_NAME` is a non-finance domain process.

Reads (wallet balance display) may still be local in phase 2; sole **write** ownership is finance.

### Env

```
INTERNAL_SERVICE_SECRET=...
FINANCE_SERVICE_URL=http://127.0.0.1:3004
# optional force HTTP even in monolith:
# WALLET_WRITES_VIA_HTTP=true
```

## Next phases (planned)

1. ~~Finance owns wallets only~~ **done (phase 2)**
2. Route wallet **reads** through finance (fleet/users stop Prisma wallet queries)
3. Auth owns sessions only; users service onboarding events
4. DB-per-service + outbox/event bus
5. Admin as pure BFF

## Code map

- Registry / ports: `src/microservices/registry.ts`
- Domain apps: `src/microservices/createDomainApp.ts`
- Gateway: `src/microservices/createGatewayApp.ts`
- Entrypoint: `src/microservices/server.ts`
- Finance client: `src/clients/finance.client.ts`
- Internal finance routes: `src/routes/internal.finance.routes.ts`
- Domain routes/services stay in `src/routes` + `src/services` until package extraction.
