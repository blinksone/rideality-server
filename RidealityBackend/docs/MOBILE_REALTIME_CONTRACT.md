# Mobile real-time contract (Flutter ↔ Rideality)

Contract for **rider** and **driver** Flutter apps. REST auth already issues JWT access tokens; the same secret/token is used for Socket.IO.

Base REST: `{API_HOST}/api/v1`  
WebSocket: `{WS_HOST}` (default `ws://localhost:3100`, path `/socket.io`)

---

## Auth

### REST
```
Authorization: Bearer <accessToken>
```

### Socket.IO
Connect with handshake auth (preferred):

```dart
IO.io(wsHost, <String, dynamic>{
  'transports': ['websocket'],
  'auth': {'token': accessToken},
  // optional also:
  // 'extraHeaders': {'Authorization': 'Bearer $accessToken'},
});
```

Gateway **rejects** the socket if the JWT is missing/invalid.

---

## REST — trips

| Method | Path | Body / notes |
|--------|------|----------------|
| `POST` | `/trips` | `{ pickupLat, pickupLng, dropoffLat, dropoffLng, pickupAddress?, dropoffAddress?, vehicleType? }` → creates `Ride` in `requested`, returns trip JSON immediately. Matching runs **async**. |
| `GET` | `/trips/:id` | Trip status + parties |
| `POST` | `/trips/:id/cancel` | `{ reason? }` |
| `POST` | `/trips/:id/status` | Driver advances FSM: `{ status: "driver_en_route" \| "arrived" \| "picked_up" \| "completed" }` |
| `POST` | `/trips/:id/dispatch-response` | `{ accepted: bool }` REST fallback if WS fails |
| `GET` | `/trips/:id/dispatch-log` | Offer audit rows |

### Trip statuses (server-authoritative)

```
requested → accepted → driver_en_route → arrived → picked_up → completed
         ↘ cancelled (from any non-terminal)
```

Legacy fleet-demo values `assigned` / `in_progress` map to `accepted` / `picked_up` when read.

Field aliases in REST JSON:
- `driverId` === `driverUserId`
- `rideId` === `id`

---

## Socket events

### Client → server

| Event | Who | Payload |
|-------|-----|---------|
| `session:hello` | both (on connect + reconnect) | `{ role: "driver" \| "rider", rideId?: string, vehicleType?: string }` |
| `ride:join` | rider (after `POST /trips`) | `{ rideId }` joins room `ride:{rideId}` |
| `ride:leave` | either | `{ rideId }` |
| `driver:location_update` | driver | `{ lat, lng, heading?, speed?, vehicleType? }` |
| `dispatch:response` | driver | `{ rideId, accepted: bool }` |

### Server → client

| Event | Who | Payload |
|-------|-----|---------|
| `session:ready` | both | `{ userId, role, rideId }` |
| `ride:joined` | rider | `{ rideId }` |
| `dispatch:offer` | driver | `{ rideId, pickupLat, pickupLng, riderName, fareEstimate, distanceMeters?, timeoutMs, bookingType: "ride"\|"cargo", cargoWeightKg?, cargoDescription?, cargoSizeTier?, dropoffProofType? }` |
| `dispatch:response_ack` | driver | `{ rideId, accepted }` |
| `dispatch:no_drivers` | rider room | `{ rideId, … }` |
| `ride:status_changed` | ride room | `{ rideId, status, from?, driverUserId?, passengerUserId? }` |
| `ride:location_broadcast` | ride room | `{ rideId, lat, lng, heading, etaSeconds, driverId? }` |

---

## Driver app responsibilities

1. After login, open socket + `session:hello` with `role: "driver"`.
2. Use `Geolocator.getPositionStream` with **distanceFilter ≥ 15m** and/or emit at most every **4–5s** — never raw 1Hz GPS.
3. Emit `driver:location_update` on each throttled tick.
4. Listen for `dispatch:offer` → show accept/decline sheet; countdown ≈ `timeoutMs` (server ~18s).
5. Emit `dispatch:response` promptly; on accept, store `rideId` and call `session:hello` / `ride:join` with that trip.
6. Advance trip via `POST /trips/:id/status` (or future push).

Rooms: drivers are auto-joined to `driver:{userId}` after hello.

---

## Rider app responsibilities

1. `POST /trips` → get `rideId` / `id`.
2. Socket `session:hello` + `ride:join` with that id.
3. Listen for `ride:status_changed`, `ride:location_broadcast`, `dispatch:no_drivers`.
4. Animate map marker between location fixes (interpolated tween over ~4–5s). Do not snap-teleport.

---

## Reconnection

1. `socket.io_client` auto-reconnect.
2. On `connect`, re-send `session:hello` with `role` + `rideId` if a trip is still active (read from local cache + optional `GET /trips/:id`).
3. Server re-joins rooms from hello payload; clients do not need a separate “resume” REST call.

Mid-trip driver socket loss: clients should re-connect sockets; **FCM** also delivers critical trip/dispatch payloads when backgrounded (see below).

---

## FCM push (backend → mobile)

Mobile must register after login (both paths work):

```
POST /api/v1/me/fcm-token
POST /api/v1/users/me/fcm-token
Authorization: Bearer <accessToken>
{
  "fcmToken": "<device FCM token>",
  "platform": "android"|"ios"|"web",
  "deviceName?": "..."
}
```

Optional **one-shot** on OTP verify:

```
POST /api/v1/auth/otp/verify
{
  "phone": "+923…",
  "code": "123456",
  "fcmToken": "<token>",
  "platform": "android",
  "deviceName?": "…"
}
```

Respect preferences: `PATCH /api/v1/me/notification-preferences` (`pushEnabled`, `rideUpdates`).

| When | Who | `data.type` | Notes |
|------|-----|-------------|--------|
| Dispatch offer | driver | `dispatch.offer` | `rideId`, pickup, fare, timeoutMs |
| No drivers | rider | `dispatch.no_drivers` | `rideId` |
| Status changes | rider / both | `ride.status_changed` | `rideId`, `status`, `from` |

Android recommendation: channel id **`rideality_rides`**. Always navigate/handle using `data` (foreground handlers + background).

Server credentials: Firebase **service account JSON** on the API host (`FIREBASE_SERVICE_ACCOUNT_PATH`). Not `google-services.json` (that is client-only).

---

## Dispatch / geo (backend — for client awareness)

- Online drivers stored in Redis geo set `drivers:online` (not SQL).
- Offer lock ~20s prevents double-dispatch.
- Every offer written to `dispatch_logs` with `accepted | declined | timeout`.

---

## Minimal Dart sketches

### Driver location

```dart
// geolocator + socket_io_client
positionStream = Geolocator.getPositionStream(
  locationSettings: const LocationSettings(
    accuracy: LocationAccuracy.high,
    distanceFilter: 15,
  ),
);
// throttle extra: skip if last emit < 4s
socket.emit('driver:location_update', {
  'lat': p.latitude,
  'lng': p.longitude,
  'heading': p.heading,
  'speed': p.speed,
  'vehicleType': 'sedan',
});
```

### Rider join + listen

```dart
socket.emit('session:hello', {'role': 'rider', 'rideId': tripId});
socket.emit('ride:join', {'rideId': tripId});
socket.on('ride:location_broadcast', (data) { /* animate marker */ });
socket.on('ride:status_changed', (data) { /* update UI FSM */ });
```

---

## Finance note (mobile)

Fares settle on `completed` via finance internal ledger APIs. Clients never write wallets; show balances only through existing wallet read endpoints.
