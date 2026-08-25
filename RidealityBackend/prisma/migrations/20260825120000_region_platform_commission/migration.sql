ALTER TABLE "regions"
  ADD COLUMN IF NOT EXISTS "platform_commission_percent" DECIMAL(5, 2) NOT NULL DEFAULT 0;

ALTER TABLE "rides"
  ADD COLUMN IF NOT EXISTS "booking_fee" DECIMAL(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE "rides"
  ADD COLUMN IF NOT EXISTS "platform_commission_percent" DECIMAL(5, 2) NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "wallets_platform_region_currency_unique"
  ON "wallets" ("region_id", "currency")
  WHERE "owner_type" = 'platform' AND "region_id" IS NOT NULL;
