# Rideality Backend — User Management API

Node.js + TypeScript + Express + PostgreSQL + Prisma + Redis

## Quick start

### 1. Start infrastructure

```bash
docker compose up -d
```

### 2. Configure environment

```bash
cp .env.example .env
```

### 3. Install & setup database

```bash
npm install
npm run db:push
npm run db:seed
```

### 4. Run API

```bash
npm run dev
```

API base: `http://localhost:3000/api/v1`

Health check: `GET /health`

## Default credentials

| Role | Email | Password | Phone |
|------|-------|----------|-------|
| Super Admin | admin@rideality.com | Admin@123456 | +920000000001 |

**Dev OTP bypass code:** `123456` (works without SMS in development)

## API endpoints

### Auth (`/api/v1/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/otp/send` | Send OTP to phone |
| POST | `/otp/verify` | Verify OTP, get tokens |
| POST | `/refresh` | Refresh access token |
| POST | `/logout` | Logout (Bearer token) |
| DELETE | `/sessions/:id` | Revoke session |
| POST | `/admin/login` | Admin email/password login |

### Users (`/api/v1/users`) — requires Bearer token

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/me` | Full profile + capabilities |
| PATCH | `/me` | Update profile |
| POST | `/me/profile` | Profile wizard update |
| GET | `/me/onboarding` | Onboarding status |
| PATCH | `/me/mode` | Switch passenger/driver |
| POST | `/me/locations` | Save locations |
| POST | `/me/consent` | Record Terms/Privacy consent |
| POST | `/me/photo` | Upload avatar (multipart) |
| GET | `/me/passenger` | Passenger view |
| GET | `/me/driver` | Driver view |
| PATCH | `/me/driver/availability` | Go online/offline |
| POST | `/me/driver/vehicle` | Register vehicle |
| GET | `/me/driver/vehicle` | Get vehicle |
| POST | `/me/documents` | Register KYC document |
| GET | `/me/documents` | List documents |
| GET | `/me/trust-score` | Trust indicators |
| GET | `/me/restrictions` | Active restrictions |
| POST | `/me/delete-account` | Request deletion |
| GET | `/me/export` | GDPR export |
| POST | `/me/fcm-token` | Register push token |
| GET | `/me/notification-preferences` | Get prefs |
| PATCH | `/me/notification-preferences` | Update prefs |
| GET | `/:id/public` | Public profile |
| POST | `/:id/report` | Report user |
| POST | `/:id/block` | Block user |
| DELETE | `/:id/block` | Unblock user |

### Admin (`/api/v1/admin/users`) — requires Admin role

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List users (paginated) |
| GET | `/:id` | User detail |
| PATCH | `/:id/status` | Suspend/ban/activate |
| PATCH | `/:id/driver/review` | Approve/reject driver |
| PATCH | `/:id/documents/:docId` | Review document |
| POST | `/:id/notes` | Add support note |
| POST | `/:id/penalties` | Apply wallet penalty |
| GET | `/:id/audit-log` | Audit history |

### Fleet (`/api/v1/fleet`) — requires Bearer token

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/companies` | Register fleet |
| GET | `/companies/:id` | Company details |
| PATCH | `/companies/:id` | Update company |
| POST | `/companies/:id/invites` | Invite driver |
| POST | `/invites/:token/accept` | Accept invite |
| GET | `/companies/:id/drivers` | List fleet drivers |
| PATCH | `/companies/:id/drivers/:userId` | Update driver |
| DELETE | `/companies/:id/drivers/:userId` | Remove driver |

## Example: mobile signup flow

```bash
# 1. Send OTP
curl -X POST http://localhost:3000/api/v1/auth/otp/send \
  -H "Content-Type: application/json" \
  -d '{"phone": "+923001234567"}'

# 2. Verify OTP (use 123456 in dev)
curl -X POST http://localhost:3000/api/v1/auth/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"phone": "+923001234567", "code": "123456"}'

# 3. Complete profile
curl -X POST http://localhost:3000/api/v1/users/me/profile \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"fullName": "John Doe", "role": "passenger"}'

# 4. Save locations
curl -X POST http://localhost:3000/api/v1/users/me/locations \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"locations":[{"label":"home","address":"Lahore","latitude":31.52,"longitude":74.35}]}'
```

## Project structure

```
src/
  config/         Environment config
  lib/            Prisma + Redis clients
  middleware/     Auth, validation, errors
  routes/         Express routers
  services/       Business logic
  utils/          JWT, crypto, responses
  validators/     Zod schemas
prisma/
  schema.prisma   Database schema
  seed.ts         Default region + admin
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript |
| `npm start` | Run production build |
| `npm run db:push` | Push schema to database |
| `npm run db:migrate` | Run migrations |
| `npm run db:seed` | Seed region + admin user |
| `npm run db:studio` | Open Prisma Studio |



npm run db:reset-demo