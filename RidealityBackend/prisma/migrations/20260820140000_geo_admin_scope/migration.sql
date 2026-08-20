-- Expand admin geography: Continent → Country (Region) → Province (REGIONAL) → City (FleetRegion).
-- New AdminRole values and ScopeType GLOBAL / CONTINENT / REGIONAL.

ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'GLOBAL_ADMIN';
ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'CONTINENT_ADMIN';
ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'COUNTRY_ADMIN';
ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'REGIONAL_ADMIN';
ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'CITY_ADMIN';
ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'FLEET_FINANCE';

ALTER TYPE "ScopeType" ADD VALUE IF NOT EXISTS 'GLOBAL';
ALTER TYPE "ScopeType" ADD VALUE IF NOT EXISTS 'CONTINENT';
ALTER TYPE "ScopeType" ADD VALUE IF NOT EXISTS 'REGIONAL';

CREATE TABLE "continents" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "continents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "continents_code_key" ON "continents"("code");

CREATE TABLE "provinces" (
    "id" TEXT NOT NULL,
    "country_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provinces_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provinces_country_id_name_key" ON "provinces"("country_id", "name");
CREATE INDEX "provinces_country_id_idx" ON "provinces"("country_id");

ALTER TABLE "provinces"
  ADD CONSTRAINT "provinces_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "regions" ADD COLUMN "continent_id" TEXT;
CREATE INDEX "regions_continent_id_idx" ON "regions"("continent_id");
ALTER TABLE "regions"
  ADD CONSTRAINT "regions_continent_id_fkey"
  FOREIGN KEY ("continent_id") REFERENCES "continents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fleet_regions" ADD COLUMN "province_id" TEXT;
CREATE INDEX "fleet_regions_province_id_idx" ON "fleet_regions"("province_id");
ALTER TABLE "fleet_regions"
  ADD CONSTRAINT "fleet_regions_province_id_fkey"
  FOREIGN KEY ("province_id") REFERENCES "provinces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "admin_assignments" ADD COLUMN "continent_id" TEXT;
ALTER TABLE "admin_assignments" ADD COLUMN "regional_id" TEXT;

CREATE INDEX "admin_assignments_regional_id_idx" ON "admin_assignments"("regional_id");

DROP INDEX IF EXISTS "admin_assignments_role_country_id_city_id_idx";
CREATE INDEX "admin_assignments_role_continent_id_country_id_regional_id_city_id_idx"
  ON "admin_assignments"("role", "continent_id", "country_id", "regional_id", "city_id");

ALTER TABLE "admin_assignments"
  ADD CONSTRAINT "admin_assignments_continent_id_fkey"
  FOREIGN KEY ("continent_id") REFERENCES "continents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "admin_assignments"
  ADD CONSTRAINT "admin_assignments_regional_id_fkey"
  FOREIGN KEY ("regional_id") REFERENCES "provinces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
