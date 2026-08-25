DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'finance'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'FleetMemberRole')
  ) THEN
    ALTER TYPE "FleetMemberRole" ADD VALUE 'finance';
  END IF;
END $$;
