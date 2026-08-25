DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FareProduct') THEN
    CREATE TYPE "FareProduct" AS ENUM ('ride', 'cargo');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "fare_configs" (
  "id" TEXT NOT NULL,
  "country_id" TEXT NOT NULL,
  "city_id" TEXT,
  "product" "FareProduct" NOT NULL,
  "currency" TEXT NOT NULL,
  "base_fare" DECIMAL(12, 2) NOT NULL,
  "per_km" DECIMAL(12, 4) NOT NULL,
  "per_minute" DECIMAL(12, 4) NOT NULL,
  "minimum_fare" DECIMAL(12, 2) NOT NULL,
  "booking_fee" DECIMAL(12, 2) NOT NULL,
  "cancellation_fee" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "cargo_per_kg" DECIMAL(12, 4) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "fare_configs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "fare_configs" DROP CONSTRAINT IF EXISTS "fare_configs_country_id_fkey";
ALTER TABLE "fare_configs"
  ADD CONSTRAINT "fare_configs_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fare_configs" DROP CONSTRAINT IF EXISTS "fare_configs_city_id_fkey";
ALTER TABLE "fare_configs"
  ADD CONSTRAINT "fare_configs_city_id_fkey"
  FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "fare_configs_country_id_product_idx" ON "fare_configs" ("country_id", "product");
CREATE INDEX IF NOT EXISTS "fare_configs_city_id_product_idx" ON "fare_configs" ("city_id", "product");

CREATE UNIQUE INDEX IF NOT EXISTS "fare_configs_city_product_unique"
  ON "fare_configs" ("city_id", "product")
  WHERE "city_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "fare_configs_country_default_unique"
  ON "fare_configs" ("country_id", "product")
  WHERE "city_id" IS NULL;
