-- Remap legacy fleet membership/invite roles after the new enum values are committed.
-- manager (city admin) → regional
-- dispatcher (fleet support) → support

UPDATE "fleet_memberships" SET "role" = 'regional' WHERE "role" = 'manager';
UPDATE "fleet_memberships" SET "role" = 'support' WHERE "role" = 'dispatcher';
UPDATE "fleet_invites" SET "member_role" = 'regional' WHERE "member_role" = 'manager';
UPDATE "fleet_invites" SET "member_role" = 'support' WHERE "member_role" = 'dispatcher';
