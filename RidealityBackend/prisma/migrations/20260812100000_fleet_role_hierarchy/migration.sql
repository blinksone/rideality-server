-- Fleet role hierarchy: city regions, membership/driver region scope, SUB_ADMIN.
-- Enum values are added here; role remap runs in the next migration after COMMIT.

ALTER TYPE "PlatformRole" ADD VALUE IF NOT EXISTS 'SUB_ADMIN';
ALTER TYPE "FleetMemberRole" ADD VALUE IF NOT EXISTS 'regional';
ALTER TYPE "FleetMemberRole" ADD VALUE IF NOT EXISTS 'support';

CREATE TABLE IF NOT EXISTS "fleet_regions" (
    "id" TEXT NOT NULL,
    "fleet_company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fleet_regions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "fleet_regions_fleet_company_id_idx" ON "fleet_regions"("fleet_company_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fleet_regions_fleet_company_id_fkey'
  ) THEN
    ALTER TABLE "fleet_regions"
      ADD CONSTRAINT "fleet_regions_fleet_company_id_fkey"
      FOREIGN KEY ("fleet_company_id") REFERENCES "fleet_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "fleet_memberships" ADD COLUMN IF NOT EXISTS "fleet_region_id" TEXT;
ALTER TABLE "fleet_memberships" ADD COLUMN IF NOT EXISTS "invited_by_user_id" TEXT;

CREATE INDEX IF NOT EXISTS "fleet_memberships_fleet_region_id_idx" ON "fleet_memberships"("fleet_region_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fleet_memberships_fleet_region_id_fkey'
  ) THEN
    ALTER TABLE "fleet_memberships"
      ADD CONSTRAINT "fleet_memberships_fleet_region_id_fkey"
      FOREIGN KEY ("fleet_region_id") REFERENCES "fleet_regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fleet_memberships_invited_by_user_id_fkey'
  ) THEN
    ALTER TABLE "fleet_memberships"
      ADD CONSTRAINT "fleet_memberships_invited_by_user_id_fkey"
      FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "fleet_invites" ADD COLUMN IF NOT EXISTS "fleet_region_id" TEXT;
CREATE INDEX IF NOT EXISTS "fleet_invites_fleet_region_id_idx" ON "fleet_invites"("fleet_region_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fleet_invites_fleet_region_id_fkey'
  ) THEN
    ALTER TABLE "fleet_invites"
      ADD CONSTRAINT "fleet_invites_fleet_region_id_fkey"
      FOREIGN KEY ("fleet_region_id") REFERENCES "fleet_regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "driver_profiles" ADD COLUMN IF NOT EXISTS "fleet_region_id" TEXT;
CREATE INDEX IF NOT EXISTS "driver_profiles_fleet_region_id_idx" ON "driver_profiles"("fleet_region_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'driver_profiles_fleet_region_id_fkey'
  ) THEN
    ALTER TABLE "driver_profiles"
      ADD CONSTRAINT "driver_profiles_fleet_region_id_fkey"
      FOREIGN KEY ("fleet_region_id") REFERENCES "fleet_regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
