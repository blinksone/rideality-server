# Pickup location (Yango-style)

Yango splits two screens. Rideality does the same.

1. **Ride map** (parent Flutter screen, not in this repo) — draggable pin. Dragging calls `GET /places/reverse` and **does not** insert a popular place.
2. **Search sheet** (`PickupLocationScreen`) — opened when the rider taps the pickup (or dropoff) address.

```
Ride map (pin you can drag)
        │
        └── tap pickup address
                    │
                    ▼
        PickupLocationScreen
          • Current location
          • Home / Work  (empty slot → Add)
          • Recents
          • Nearby (our DB, ranked by distance then priority then usage)
          • Search → our catalog first, then Google via backend
```

Tap a result once. The sheet returns `SelectedLocation` to the map. The rider can still nudge the pin.

## API (`/api/v1/places`)

All rider routes require `Authorization: Bearer <accessToken>`.

| Method | Path | When |
|--------|------|------|
| `GET` | `/places/suggestions?latitude=&longitude=` | **Open the sheet** — current, Home/Work slots, recents, nearby |
| `GET` | `/places/nearby?latitude=&longitude=&radius=8&limit=20` | Nearby from **our DB only** |
| `GET` | `/places/search?query=dolmen&latitude=&longitude=&sessionToken=` | Local catalog + Google autocomplete. Debounce 400ms, ≥2 chars |
| `GET` | `/places/google/:placeId?sessionToken=` | Place details (preview). Does **not** save |
| `POST` | `/places/select` | **Tap a result** — details + upsert + usage |
| `POST` | `/places` | Upsert if the app already has details |
| `GET` | `/places/reverse?latitude=&longitude=` | Map-pin / current GPS address. No catalog insert |
| `GET` | `/places/recents` | User recents |

Admin (geo roles with `FARE_MANAGE`): `GET/POST /admin/places`, `PATCH /admin/places/:id`.

### Select body

```json
{ "googlePlaceId": "ChIJ...", "sessionToken": "uuid" }
{ "placeId": "our-uuid" }
{ "latitude": 24.81, "longitude": 67.03, "source": "current" }
```

Current location and map pin return an address and **do not** insert a popular-place row.

Google (and typed) search results are saved **only** when the user selects them (`POST /places/select`).

Home / Work are stored on `SavedLocation` via `POST /me/locations`, not in the popular catalog.

### Selected location

```json
{
  "name": "Dolmen Mall Clifton",
  "address": "Marine Drive, Clifton, Karachi",
  "latitude": 24.8138,
  "longitude": 67.0305,
  "googlePlaceId": "ChIJ...",
  "databaseId": "uuid",
  "type": "MALL",
  "city": "Karachi",
  "area": "Clifton",
  "distanceKm": 0.8
}
```

`databaseId` is a UUID (same as the rest of Rideality), not an integer.

Search hits also include `source`: `LOCAL` (already in our DB) or `GOOGLE`.

## Flutter (existing rider app)

Do not add Google Places in the app. Keep the ride map; open a search sheet for pickup/dropoff. Call `/api/v1/places` with the same authenticated Dio/HTTP client. `databaseId` is a UUID string. Save Google results only on `POST /places/select`. Pin drag uses `GET /places/reverse` and must not insert a catalog row.

## Server key

Set `GOOGLE_PLACES_API_KEY` on the API host. Enable Places + Geocoding. Restrict the key to the server IP. Do not put this key in Flutter.

Nearby, Home/Work, recents, and local catalog search work **without** the key. Google autocomplete, details, and street reverse-geocode need it.
