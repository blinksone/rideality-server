-- Scope-based admin RBAC: AdminAssignment (role + permission + scope) on existing users.

CREATE TYPE "AdminRole" AS ENUM (
  'SUPER_ADMIN',
  'SUB_ADMIN',
  'FINANCE_USER',
  'PLATFORM_SUPPORT',
  'FLEET_OWNER',
  'REGIONAL_FLEET',
  'FLEET_SUPPORT'
);

CREATE TYPE "ScopeType" AS ENUM ('PLATFORM', 'COUNTRY', 'CITY');

CREATE TABLE "admin_assignments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "scope_type" "ScopeType" NOT NULL,
    "country_id" TEXT,
    "city_id" TEXT,
    "invited_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_assignments_user_id_key" ON "admin_assignments"("user_id");
CREATE INDEX "admin_assignments_role_country_id_city_id_idx" ON "admin_assignments"("role", "country_id", "city_id");
CREATE INDEX "admin_assignments_invited_by_id_idx" ON "admin_assignments"("invited_by_id");
CREATE INDEX "admin_assignments_city_id_idx" ON "admin_assignments"("city_id");

ALTER TABLE "admin_assignments"
  ADD CONSTRAINT "admin_assignments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "admin_assignments"
  ADD CONSTRAINT "admin_assignments_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "admin_assignments"
  ADD CONSTRAINT "admin_assignments_city_id_fkey"
  FOREIGN KEY ("city_id") REFERENCES "fleet_regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "admin_assignments"
  ADD CONSTRAINT "admin_assignments_invited_by_id_fkey"
  FOREIGN KEY ("invited_by_id") REFERENCES "admin_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "admin_permission_grants" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_permission_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_permission_grants_assignment_id_key_key" ON "admin_permission_grants"("assignment_id", "key");

ALTER TABLE "admin_permission_grants"
  ADD CONSTRAINT "admin_permission_grants_assignment_id_fkey"
  FOREIGN KEY ("assignment_id") REFERENCES "admin_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
