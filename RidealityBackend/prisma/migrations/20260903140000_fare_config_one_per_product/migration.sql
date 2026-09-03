UPDATE fare_configs
SET service_product_code = 'economy'
WHERE product = 'ride' AND (service_product_code IS NULL OR service_product_code = '');

UPDATE fare_configs
SET service_product_code = 'cargo'
WHERE product = 'cargo' AND (service_product_code IS NULL OR service_product_code = '');

DELETE FROM fare_configs a
USING fare_configs b
WHERE a.city_id IS NOT NULL
  AND b.city_id IS NOT NULL
  AND a.service_product_code IS NOT NULL
  AND a.city_id = b.city_id
  AND a.service_product_code = b.service_product_code
  AND a.id <> b.id
  AND (
    a.updated_at < b.updated_at
    OR (a.updated_at = b.updated_at AND a.id < b.id)
  );

DELETE FROM fare_configs a
USING fare_configs b
WHERE a.city_id IS NULL
  AND b.city_id IS NULL
  AND a.service_product_code IS NOT NULL
  AND a.country_id = b.country_id
  AND a.service_product_code = b.service_product_code
  AND a.id <> b.id
  AND (
    a.updated_at < b.updated_at
    OR (a.updated_at = b.updated_at AND a.id < b.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS "fare_configs_city_product_uidx"
  ON "fare_configs" ("city_id", "service_product_code");

CREATE UNIQUE INDEX IF NOT EXISTS "fare_configs_city_service_product_unique"
  ON "fare_configs" ("city_id", "service_product_code")
  WHERE "city_id" IS NOT NULL AND "service_product_code" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "fare_configs_country_service_product_unique"
  ON "fare_configs" ("country_id", "service_product_code")
  WHERE "city_id" IS NULL AND "service_product_code" IS NOT NULL;
