# Taxi confirm screen — Flutter

Base: `{API_HOST}/api/v1`  
Header: `Authorization: Bearer <accessToken>`  
Envelope: `{ "success": true, "data": … }`

Use this after the rider has **pickup and dropoff**. Do not hardcode Bike / Rickshaw / Economy fares.

Related: pickup APIs in [PICKUP_LOCATION.md](./PICKUP_LOCATION.md). Live trip sockets in [MOBILE_REALTIME_CONTRACT.md](./MOBILE_REALTIME_CONTRACT.md).

---

## Flow

```
Pickup + dropoff set
        │
        ▼
POST /trips/quote          ← fill confirm list (Bike, Economy, AC, …)
        │
        ▼
Rider selects a row
        │
        ▼
POST /trips                ← creates the ride (vehicleType from that row)
        │
        ▼
socket ride:join
```

**Taxi / Transport tab** → `bookingType: "ride"`  
**Delivery tab** → `bookingType: "cargo"`

---

## 1. Catalog (optional)

```
GET /trips/catalog
```

```json
[
  { "code": "bike", "label": "Bike", "family": "taxi", "sortOrder": 10, "fareMultiplier": 0.38 },
  { "code": "rickshaw", "label": "Rickshaw", "family": "taxi", "sortOrder": 20, "fareMultiplier": 0.67 },
  { "code": "economy", "label": "Economy", "family": "taxi", "sortOrder": 30, "fareMultiplier": 1 },
  { "code": "ac", "label": "AC", "family": "taxi", "sortOrder": 40, "fareMultiplier": 1.28 },
  { "code": "cargo", "label": "Cargo", "family": "cargo", "sortOrder": 50, "fareMultiplier": 1 }
]
```

The confirm screen should bind to **quote `options`**, not this list. Catalog is only if you need labels before coordinates exist.

---

## 2. Quote (required for this screen)

```
POST /trips/quote
```

```json
{
  "pickupLat": 24.8055,
  "pickupLng": 67.0302,
  "dropoffLat": 24.8072,
  "dropoffLng": 67.0476,
  "pickupAddress": "Sea View, Clifton",
  "dropoffAddress": "DHA Phase 5",
  "bookingType": "ride"
}
```

Delivery:

```json
{
  "pickupLat": 24.8055,
  "pickupLng": 67.0302,
  "dropoffLat": 24.8072,
  "dropoffLng": 67.0476,
  "bookingType": "cargo",
  "cargoWeightKg": 12
}
```

### `data`

```json
{
  "currency": "PKR",
  "distanceKm": 3.2,
  "durationMin": 6,
  "bookingType": "ride",
  "options": [
    {
      "vehicleType": "bike",
      "label": "Bike",
      "family": "taxi",
      "fare": 180,
      "currency": "PKR",
      "etaMin": 3,
      "available": true,
      "surgeMultiplier": 1,
      "surgeActive": false,
      "badge": null
    },
    {
      "vehicleType": "economy",
      "label": "Economy",
      "family": "taxi",
      "fare": 480,
      "currency": "PKR",
      "etaMin": 6,
      "available": true,
      "badge": "Fastest"
    },
    {
      "vehicleType": "ac",
      "label": "AC",
      "family": "taxi",
      "fare": 620,
      "currency": "PKR",
      "etaMin": 8,
      "available": true,
      "badge": null
    }
  ]
}
```

| Field | UI |
|---|---|
| `durationMin` | Route time on the map |
| `options[].label` | Row title |
| `options[].fare` + `currency` | `Rs 480` |
| `options[].etaMin` | `6 min` |
| `options[].badge` | “Fastest” / “High demand”; hide if null |
| `options[].available` | Dim / disable if false |
| `options[].vehicleType` | Keep; send on `POST /trips` |
| `options[].surgeMultiplier` | `1` normal, `1.5` = +50%. Already baked into `fare`. |
| `options[].surgeActive` | Show a demand chip when true |

Default-select `badge` containing `Fastest`, else first `available` row.  
Button: `Request {label}`.

Re-call quote when pickup, dropoff, or tab changes.

**Do not** call `POST /trips` to show prices. **Do not** call `GET /admin/fares`.

---

## 3. Request taxi

```
POST /trips
```

```json
{
  "pickupLat": 24.8055,
  "pickupLng": 67.0302,
  "dropoffLat": 24.8072,
  "dropoffLng": 67.0476,
  "pickupAddress": "Sea View, Clifton",
  "dropoffAddress": "DHA Phase 5",
  "vehicleType": "economy",
  "bookingType": "ride"
}
```

`vehicleType` **must** be the quote code: `bike` | `rickshaw` | `economy` | `ac` | `cargo`.  
Do not send `"Economy"` or `"Car"`.

`201 data` includes `id` / `rideId`, `status: "requested"`, `fare`, `vehicleType`.

Then:

```
session:hello  { "role": "rider", "rideId": "<id>" }
ride:join      { "rideId": "<id>" }
```

---

## 4. Wallet chip

```
GET /me/wallet
```

Payment method only. Not the fare.

---

## 5. Who sets products and prices

| Who | Where | What |
|---|---|---|
| Country / city admin | Admin → Fare config | Rider price per product, plus **surge** (1 = normal, 1.5 = high demand) |
| Fleet owner | Portal → Cities → city → **Services in this city** | Which products that fleet runs |
| Vehicle | Portal → Vehicles | `economy`, `ac`, `bike`, `rickshaw`, `cargo` |

The rider never picks a fleet. They pick **Economy**. Dispatch finds an online car tagged `economy`.

If no fleet has enrolled products yet, quote still returns the full taxi catalog (so the app works before owners tick boxes).

---

## 6. Checklist

- [ ] Remove hardcoded 180 / 320 / 480
- [ ] After both points: `POST /trips/quote`
- [ ] Bind the list to `data.options`
- [ ] Request → `POST /trips` with `vehicleType` from the selected option
- [ ] Taxi tab `bookingType: "ride"`; Delivery ` "cargo"`
- [ ] Re-quote on location or tab change
