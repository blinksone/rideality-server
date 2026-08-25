-- Service catalog (Bike, Economy, AC, Cargo) + fleet city opt-in + fare per product.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ServiceFamily') THEN
    CREATE TYPE "ServiceFamily" AS ENUM ('taxi', 'cargo');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "service_products" (
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "family" "ServiceFamily" NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "fare_multiplier" DECIMAL(6, 3) NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_products_pkey" PRIMARY KEY ("code")
);

INSERT INTO "service_products" ("code", "label", "family", "sort_order", "is_active", "fare_multiplier")
VALUES
  ('bike', 'Bike', 'taxi', 10, TRUE, 0.380),
  ('rickshaw', 'Rickshaw', 'taxi', 20, TRUE, 0.670),
  ('economy', 'Economy', 'taxi', 30, TRUE, 1.000),
  ('ac', 'AC', 'taxi', 40, TRUE, 1.280),
  ('cargo', 'Cargo', 'cargo', 50, TRUE, 1.000)
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "fare_configs" ADD COLUMN IF NOT EXISTS "service_product_code" TEXT;

UPDATE "fare_configs"
SET "service_product_code" = 'economy'
WHERE "product" = 'ride' AND ("service_product_code" IS NULL OR "service_product_code" = '');

UPDATE "fare_configs"
SET "service_product_code" = 'cargo'
WHERE "product" = 'cargo' AND ("service_product_code" IS NULL OR "service_product_code" = '');

ALTER TABLE "fare_configs" DROP CONSTRAINT IF EXISTS "fare_configs_service_product_code_fkey";
ALTER TABLE "fare_configs"
  ADD CONSTRAINT "fare_configs_service_product_code_fkey"
  FOREIGN KEY ("service_product_code") REFERENCES "service_products"("code")
  ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "fare_configs_city_product_unique";
DROP INDEX IF EXISTS "fare_configs_country_default_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "fare_configs_city_service_product_unique"
  ON "fare_configs" ("city_id", "service_product_code")
  WHERE "city_id" IS NOT NULL AND "service_product_code" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "fare_configs_country_service_product_unique"
  ON "fare_configs" ("country_id", "service_product_code")
  WHERE "city_id" IS NULL AND "service_product_code" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "fare_configs_service_product_code_idx"
  ON "fare_configs" ("service_product_code");

CREATE TABLE IF NOT EXISTS "fleet_region_services" (
  "id" TEXT NOT NULL,
  "fleet_region_id" TEXT NOT NULL,
  "product_code" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "fleet_region_services_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "fleet_region_services" DROP CONSTRAINT IF EXISTS "fleet_region_services_fleet_region_id_fkey";
ALTER TABLE "fleet_region_services"
  ADD CONSTRAINT "fleet_region_services_fleet_region_id_fkey"
  FOREIGN KEY ("fleet_region_id") REFERENCES "fleet_regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fleet_region_services" DROP CONSTRAINT IF EXISTS "fleet_region_services_product_code_fkey";
ALTER TABLE "fleet_region_services"
  ADD CONSTRAINT "fleet_region_services_product_code_fkey"
  FOREIGN KEY ("product_code") REFERENCES "service_products"("code") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "fleet_region_services_fleet_region_id_product_code_key"
  ON "fleet_region_services" ("fleet_region_id", "product_code");
CREATE INDEX IF NOT EXISTS "fleet_region_services_product_code_idx"
  ON "fleet_region_services" ("product_code");

INSERT INTO "fleet_region_services" ("id", "fleet_region_id", "product_code", "enabled")
SELECT md5(random()::text || r."id" || p."code"), r."id", p."code", TRUE
FROM "fleet_regions" r
CROSS JOIN "service_products" p
WHERE p."is_active" = TRUE
ON CONFLICT ("fleet_region_id", "product_code") DO NOTHING;
