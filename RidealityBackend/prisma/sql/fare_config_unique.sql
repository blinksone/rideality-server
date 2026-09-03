-- Re-apply after `prisma db push` (push does not create partial unique indexes).
CREATE UNIQUE INDEX IF NOT EXISTS "fare_configs_city_service_product_unique"
  ON "fare_configs" ("city_id", "service_product_code")
  WHERE "city_id" IS NOT NULL AND "service_product_code" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "fare_configs_country_service_product_unique"
  ON "fare_configs" ("country_id", "service_product_code")
  WHERE "city_id" IS NULL AND "service_product_code" IS NOT NULL;
