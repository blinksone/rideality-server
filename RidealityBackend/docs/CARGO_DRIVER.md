# Cargo driver experience (backend)

Cargo reuses the **same** ride infrastructure: one online state, `drivers:online` geo set, `DispatchLog`, trip FSM, WebSocket rooms.

## Data model

| Field / table | Purpose |
|---------------|---------|
| `rides.booking_type` | `ride` \| `cargo` |
| `rides.cargo_weight_kg` / `cargo_description` / `cargo_size_tier` | Cargo request payload |
| `rides.dropoff_proof_type` | `otp` \| `photo` |
| `cargo_proofs` | Pickup/dropoff photo + OTP flags |
| `driver_profiles.service_modes` | `["rides"]`, `["cargo"]`, or both |
| `vehicles.cargo_capacity_kg` | Capacity filter at dispatch |

## Dispatch filters

For every candidate near pickup (unchanged GEOSEARCH + lock):

1. `serviceModes` includes `cargo` (cargo) or `rides` (ride)
2. Cargo only: `vehicle.cargoCapacityKg >= cargoWeightKg`

## FSM proof guards

Server rejects (not just UI):

- `picked_up` on cargo without `cargo_proofs.pickup_confirmed_at` → `CARGO_PICKUP_PROOF_REQUIRED`
- `completed` on cargo without `cargo_proofs.dropoff_confirmed_at` → `CARGO_DROPOFF_PROOF_REQUIRED`

## APIs

```
PATCH  /api/v1/drivers/me/service-modes     { "modes": ["rides","cargo"] }
PATCH  /api/v1/users/me/driver/service-modes  (alias)
PATCH  /api/v1/users/me/driver/availability   { "isOnline": true, "modes": ["cargo"] }

POST   /api/v1/trips                         body + bookingType/cargo fields
POST   /api/v1/bookings/:id/proof/pickup     { "photoUrl": "…" }
POST   /api/v1/bookings/:id/proof/dropoff    { "otp": "123456" } | { "photoUrl" }
POST   /api/v1/trips/:id/proof/*             (alias)

POST   /api/v1/trips/:id/status              { "status": "picked_up" | "completed" | … }
```

### Create cargo booking

```json
POST /api/v1/trips
{
  "bookingType": "cargo",
  "pickupLat": 24.86, "pickupLng": 67.00,
  "dropoffLat": 24.90, "dropoffLng": 67.05,
  "cargoWeightKg": 25,
  "cargoDescription": "Boxes",
  "cargoSizeTier": "medium",
  "dropoffProofType": "otp"
}
```

Response includes `cargo.dropoffOtp` **once** for the passenger (show to recipient). Driver verifies that OTP at dropoff.

### Offer socket payload extras

`dispatch:offer` also carries `bookingType`, `cargoWeightKg`, `cargoDescription`, `cargoSizeTier`, `fareEstimate`.

## Flutter (client) checklist

No Flutter repo in this monorepo — implement app-side as specified:

1. Dashboard toggle: Rides / Cargo / Both → `PATCH …/service-modes` (and pass modes when going online)
2. Offer card: show weight/tier for `bookingType === cargo` (reuse countdown)
3. Before FSM `picked_up`: camera → `POST …/proof/pickup` (button disabled until proof ready)
4. Before FSM `completed`: OTP or photo → `POST …/proof/dropoff`
5. Reuse route canvas + earnings for both booking types

## Out of scope (v1)

Signature POD, multi-package, cargo-specific pricing ladders (only weight surcharge on existing fare formula).
