-- Pickup/dropoff place catalog (nearby from DB; Google results upserted on select).

CREATE TYPE "PlaceSource" AS ENUM ('ADMIN', 'GOOGLE', 'USER', 'SYSTEM');

CREATE TABLE "places" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "formatted_address" TEXT,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "city" TEXT,
    "area" TEXT,
    "type" TEXT,
    "google_place_id" TEXT,
    "source" "PlaceSource" NOT NULL DEFAULT 'GOOGLE',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "places_google_place_id_key" ON "places"("google_place_id");
CREATE INDEX "places_is_active_city_idx" ON "places"("is_active", "city");
CREATE INDEX "places_latitude_longitude_idx" ON "places"("latitude", "longitude");
CREATE INDEX "places_usage_count_idx" ON "places"("usage_count");

CREATE TABLE "place_usages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_usages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "place_usages_user_id_place_id_key" ON "place_usages"("user_id", "place_id");
CREATE INDEX "place_usages_user_id_used_at_idx" ON "place_usages"("user_id", "used_at");

ALTER TABLE "place_usages" ADD CONSTRAINT "place_usages_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "place_usages" ADD CONSTRAINT "place_usages_place_id_fkey"
  FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;
