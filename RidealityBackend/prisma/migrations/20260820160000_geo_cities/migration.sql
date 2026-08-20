-- Geographic cities for CITY admin scope (independent of fleet regions).

CREATE TABLE "cities" (
    "id" TEXT NOT NULL,
    "province_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cities_province_id_name_key" ON "cities"("province_id", "name");
CREATE INDEX "cities_province_id_idx" ON "cities"("province_id");

ALTER TABLE "cities"
  ADD CONSTRAINT "cities_province_id_fkey"
  FOREIGN KEY ("province_id") REFERENCES "provinces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fleet_regions" ADD COLUMN "geo_city_id" TEXT;
CREATE INDEX "fleet_regions_geo_city_id_idx" ON "fleet_regions"("geo_city_id");
ALTER TABLE "fleet_regions"
  ADD CONSTRAINT "fleet_regions_geo_city_id_fkey"
  FOREIGN KEY ("geo_city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "admin_assignments" DROP CONSTRAINT IF EXISTS "admin_assignments_city_id_fkey";
ALTER TABLE "admin_assignments"
  ADD CONSTRAINT "admin_assignments_city_id_fkey"
  FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
