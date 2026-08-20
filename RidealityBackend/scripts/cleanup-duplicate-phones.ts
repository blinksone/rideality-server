/**
 * One-shot cleanup: merge/delete users that share the same normalized phone.
 * Run: npx tsx scripts/cleanup-duplicate-phones.ts
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { normalizePhone } from '../src/utils/phone';

const prisma = new PrismaClient();

type UserRow = Awaited<ReturnType<typeof loadUsers>>[number];

async function loadUsers() {
  return prisma.user.findMany({
    where: { deletedAt: null },
    include: {
      profile: true,
      platformRoles: true,
      driverProfile: true,
      passengerProfile: true,
      wallet: true,
      _count: {
        select: {
          ridesAsPassenger: true,
          ridesAsDriver: true,
          dispatchOffers: true,
        },
      },
    },
  });
}

function score(u: UserRow): number {
  let s = 0;
  s += u._count.ridesAsDriver * 50;
  s += u._count.ridesAsPassenger * 30;
  s += u._count.dispatchOffers * 5;
  s += Number(u.wallet?.balance || 0);
  if (u.driverProfile) s += 40;
  if (u.email) s += 15;
  if (u.profile?.fullName) s += 15;
  if (u.status === 'ACTIVE') s += 20;
  if (u.status === 'PHONE_VERIFIED') s += 5;
  if (u.phone === normalizePhone(u.phone)) s += 10;
  const roles = u.platformRoles.map((r) => r.role);
  if (roles.includes('DRIVER')) s += 25;
  if (roles.includes('FLEET_OWNER')) s += 15;
  if (roles.includes('FINANCE_OFFICER')) s += 15;
  return s;
}

async function reassignUserRefs(fromId: string, toId: string) {
  await prisma.ride.updateMany({ where: { driverUserId: fromId }, data: { driverUserId: toId } });
  await prisma.ride.updateMany({
    where: { passengerUserId: fromId },
    data: { passengerUserId: toId },
  });
  await prisma.dispatchLog.updateMany({
    where: { driverUserId: fromId },
    data: { driverUserId: toId },
  });
  await prisma.rideRating.updateMany({
    where: { raterUserId: fromId },
    data: { raterUserId: toId },
  });
  await prisma.rideRating.updateMany({
    where: { rateeUserId: fromId },
    data: { rateeUserId: toId },
  });
  await prisma.auditLog.updateMany({
    where: { targetUserId: fromId },
    data: { targetUserId: toId },
  });
  await prisma.auditLog.updateMany({ where: { actorId: fromId }, data: { actorId: toId } });
  await prisma.adminNote.updateMany({
    where: { targetUserId: fromId },
    data: { targetUserId: toId },
  });
  await prisma.adminNote.updateMany({
    where: { authorId: fromId },
    data: { authorId: toId },
  });
  await prisma.walletTransaction.updateMany({
    where: { createdById: fromId },
    data: { createdById: toId },
  });
  await prisma.walletAdjustment.updateMany({
    where: { requestedById: fromId },
    data: { requestedById: toId },
  });
  await prisma.walletAdjustment.updateMany({
    where: { reviewedById: fromId },
    data: { reviewedById: toId },
  });
  await prisma.payoutRequest.updateMany({
    where: { requestedById: fromId },
    data: { requestedById: toId },
  });
  await prisma.payoutRequest.updateMany({
    where: { reviewedById: fromId },
    data: { reviewedById: toId },
  });
  await prisma.userBlock.deleteMany({
    where: {
      OR: [
        { blockerId: fromId },
        { blockedId: fromId },
        { blockerId: toId, blockedId: fromId },
        { blockerId: fromId, blockedId: toId },
      ],
    },
  });
}

async function hardDeleteUser(userId: string) {
  await prisma.ride.updateMany({ where: { driverUserId: userId }, data: { driverUserId: null } });
  await prisma.ride.updateMany({
    where: { passengerUserId: userId },
    data: { passengerUserId: null },
  });
  await prisma.dispatchLog.deleteMany({ where: { driverUserId: userId } });
  await prisma.rideRating.deleteMany({
    where: { OR: [{ raterUserId: userId }, { rateeUserId: userId }] },
  });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: userId }, { targetUserId: userId }] },
  });
  await prisma.adminNote.deleteMany({
    where: { OR: [{ authorId: userId }, { targetUserId: userId }] },
  });
  await prisma.walletTransaction.updateMany({
    where: { createdById: userId },
    data: { createdById: null },
  });
  await prisma.walletAdjustment.deleteMany({ where: { requestedById: userId } });
  await prisma.walletAdjustment.updateMany({
    where: { reviewedById: userId },
    data: { reviewedById: null },
  });
  await prisma.payoutRequest.deleteMany({ where: { requestedById: userId } });
  await prisma.payoutRequest.updateMany({
    where: { reviewedById: userId },
    data: { reviewedById: null },
  });
  await prisma.userBlock.deleteMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
  });

  const dp = await prisma.driverProfile.findUnique({ where: { userId } });
  if (dp) {
    await prisma.vehicle.deleteMany({ where: { driverProfileId: dp.id } });
  }

  await prisma.user.delete({ where: { id: userId } });
}

async function main() {
  const users = await loadUsers();
  const groups = new Map<string, UserRow[]>();
  for (const u of users) {
    const n = normalizePhone(u.phone);
    if (!groups.has(n)) groups.set(n, []);
    groups.get(n)!.push(u);
  }

  const dups = [...groups.entries()].filter(([, list]) => list.length > 1);
  console.log(`Found ${dups.length} duplicate phone groups`);

  for (const [norm, list] of dups) {
    const ranked = [...list].sort((a, b) => score(b) - score(a));
    const winner = ranked[0];
    const losers = ranked.slice(1);

    console.log(`\n=== ${norm} ===`);
    console.log(
      `KEEP  ${winner.id} phone=${winner.phone} email=${winner.email} name=${winner.profile?.fullName} score=${score(winner)}`
    );
    for (const l of losers) {
      console.log(
        `DROP  ${l.id} phone=${l.phone} email=${l.email} name=${l.profile?.fullName} score=${score(l)}`
      );
    }

    let extraBalance = new Prisma.Decimal(0);
    for (const l of losers) {
      if (l.wallet?.balance) extraBalance = extraBalance.add(l.wallet.balance);
    }

    for (const l of losers) {
      for (const pr of l.platformRoles) {
        const exists = winner.platformRoles.some((r) => r.role === pr.role);
        if (!exists) {
          await prisma.userPlatformRole.create({
            data: { userId: winner.id, role: pr.role },
          });
          winner.platformRoles.push(pr);
        }
      }
      if (!winner.driverProfile && l.driverProfile) {
        await prisma.driverProfile.create({
          data: {
            userId: winner.id,
            onboardingStatus: l.driverProfile.onboardingStatus,
            licenseNumber: l.driverProfile.licenseNumber,
            licenseExpiry: l.driverProfile.licenseExpiry,
            driverType: l.driverProfile.driverType,
            fleetCompanyId: l.driverProfile.fleetCompanyId,
            isOnline: false,
            totalRides: l.driverProfile.totalRides,
          },
        });
        winner.driverProfile = l.driverProfile;
      }
    }

    if (winner.profile) {
      const betterName =
        winner.profile.fullName ||
        losers.map((l) => l.profile?.fullName).find(Boolean) ||
        null;
      if (betterName && betterName !== winner.profile.fullName) {
        await prisma.userProfile.update({
          where: { userId: winner.id },
          data: { fullName: betterName },
        });
      }
    }

    if (!winner.email) {
      for (const l of losers) {
        if (!l.email) continue;
        await prisma.user.update({ where: { id: l.id }, data: { email: null } });
        await prisma.user.update({ where: { id: winner.id }, data: { email: l.email } });
        winner.email = l.email;
        break;
      }
    }

    const bestStatus = [winner, ...losers].some((u) => u.status === 'ACTIVE')
      ? 'ACTIVE'
      : winner.status;

    for (const l of losers) {
      await reassignUserRefs(l.id, winner.id);
      await hardDeleteUser(l.id);
      console.log(`  deleted ${l.id}`);
    }

    try {
      await prisma.user.update({
        where: { id: winner.id },
        data: { phone: norm, status: bestStatus },
      });
    } catch (e: unknown) {
      console.error('  phone/status update failed', e instanceof Error ? e.message : e);
    }

    if (extraBalance.gt(0) && winner.wallet) {
      await prisma.wallet.update({
        where: { id: winner.wallet.id },
        data: { balance: { increment: extraBalance } },
      });
      console.log(`  wallet +${extraBalance.toString()}`);
    }

    const final = await prisma.user.findUnique({
      where: { id: winner.id },
      select: {
        id: true,
        phone: true,
        email: true,
        status: true,
        profile: { select: { fullName: true } },
        platformRoles: { select: { role: true } },
        wallet: { select: { balance: true } },
        _count: { select: { ridesAsPassenger: true, ridesAsDriver: true } },
      },
    });
    console.log('  FINAL', JSON.stringify(final));
  }

  // Normalize remaining unique awkward PK phones
  const remaining = await prisma.user.findMany({ where: { deletedAt: null } });
  let fixed = 0;
  for (const u of remaining) {
    const n = normalizePhone(u.phone);
    if (n === u.phone) continue;
    if (!/^\+923\d{9}$/.test(n)) continue;
    const clash = await prisma.user.findFirst({
      where: {
        phone: n,
        regionId: u.regionId,
        id: { not: u.id },
        deletedAt: null,
      },
    });
    if (!clash) {
      await prisma.user.update({ where: { id: u.id }, data: { phone: n } });
      fixed++;
      console.log(`normalized singleton ${u.phone} → ${n}`);
    }
  }
  console.log(`\nNormalized ${fixed} singleton phones`);

  const after = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, phone: true },
  });
  const g2 = new Map<string, number>();
  for (const u of after) {
    const n = normalizePhone(u.phone);
    g2.set(n, (g2.get(n) || 0) + 1);
  }
  const left = [...g2.entries()].filter(([, c]) => c > 1);
  console.log('duplicate groups remaining:', left.length, left);
  console.log('total users now:', after.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
