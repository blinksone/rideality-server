-- Safe to run before `prisma db push`. No-op if fare_configs does not exist yet.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'fare_configs'
  ) THEN
    RETURN;
  END IF;

  UPDATE fare_configs
  SET service_product_code = 'economy'
  WHERE product = 'ride' AND (service_product_code IS NULL OR service_product_code = '');

  UPDATE fare_configs
  SET service_product_code = 'cargo'
  WHERE product = 'cargo' AND (service_product_code IS NULL OR service_product_code = '');

  -- Keep the newest row per city + product.
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

  -- Keep the newest country default per country + product.
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
END $$;
