-- Applied via `npx prisma db push` on 2026-08-10 (DB was not previously under Prisma Migrate).
-- Name: trip_fsm_dispatch_log
--
-- Extends RideStatus, nullable driver/fleet, fareEstimate, DispatchLog table.

-- This file documents the intended delta for ops; production should baseline migrate
-- or re-run `prisma db push` / generate a formal migration from a clean snapshot.

-- RideStatus enum values added: accepted, driver_en_route, arrived, picked_up
-- rides.driver_user_id nullable, rides.fleet_company_id nullable
-- rides.fare_estimate, vehicle_type, cancel_reason, cancelled_at
-- table dispatch_logs
