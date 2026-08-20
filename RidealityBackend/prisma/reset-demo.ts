/**
 * Wipe all application data and re-seed a clean demo baseline.
 *
 * Keeps schema intact. After wipe, runs the normal seed:
 *   - Regions PK + US
 *   - System permissions + default roles
 *   - Platform Super Admin (ADMIN_EMAIL / ADMIN_PASSWORD from env)
 *
 * Usage:
 *   npx tsx prisma/reset-demo.ts
 *   npm run db:reset-demo
 */
import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'child_process';
import path from 'path';

const prisma = new PrismaClient();

const TABLES = [
  'ride_ratings',
  'rides',
  'fleet_notifications',
  'fleet_invites',
  'fleet_memberships',
  'vehicles',
  'driver_profiles',
  'payout_requests',
  'wallet_adjustments',
  'wallet_transactions',
  'wallets',
  'fleet_companies',
  'admin_notes',
  'audit_logs',
  'abuse_reports',
  'abuse_records',
  'user_blocks',
  'refresh_tokens',
  'user_devices',
  'consent_records',
  'notification_preferences',
  'verification_documents',
  'saved_locations',
  'passenger_profiles',
  'user_profiles',
  'user_permissions',
  'user_role_assignments',
  'role_permissions',
  'user_platform_roles',
  'roles',
  'permissions',
  'users',
  'regions',
];

async function main() {
  const confirm = process.argv.includes('--yes') || process.env.CONFIRM_RESET === 'yes';
  if (!confirm) {
    console.error('Refusing to wipe without confirmation.');
    console.error('Run: npx tsx prisma/reset-demo.ts --yes');
    process.exit(1);
  }

  console.log('Counting current data…');
  const before = {
    users: await prisma.user.count(),
    roles: await prisma.role.count(),
    fleets: await prisma.fleetCompany.count(),
    wallets: await prisma.wallet.count(),
    auditLogs: await prisma.auditLog.count(),
  };
  console.log(before);

  console.log('\nTruncating all tables…');
  const list = TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
  console.log('Truncate complete.');

  console.log('\nRe-seeding baseline…');
  const seedPath = path.join(__dirname, 'seed.ts');
  const result = spawnSync('npx', ['tsx', seedPath], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`Seed failed with exit code ${result.status}`);
  }

  const after = {
    users: await prisma.user.count(),
    roles: await prisma.role.count(),
    permissions: await prisma.permission.count(),
    regions: await prisma.region.count(),
    fleets: await prisma.fleetCompany.count(),
    wallets: await prisma.wallet.count(),
  };
  console.log('\nFresh baseline:');
  console.log(after);
  console.log('\nDemo DB reset complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
