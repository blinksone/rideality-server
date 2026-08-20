import { PrismaClient, PlatformRole } from '@prisma/client';
import { hashPassword } from '../src/utils/crypto';

const prisma = new PrismaClient();

async function main() {
  const region = await prisma.region.upsert({
    where: { code: 'PK' },
    create: {
      code: 'PK',
      name: 'Pakistan',
      currency: 'PKR',
      phonePrefix: '+92',
    },
    update: {},
  });

  console.log('Region seeded:', region.code);

  const usRegion = await prisma.region.upsert({
    where: { code: 'US' },
    create: {
      code: 'US',
      name: 'United States',
      currency: 'USD',
      phonePrefix: '+1',
    },
    update: {},
  });

  console.log('Region seeded:', usRegion.code);

  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@rideality.com';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin@123456';
  const passwordHash = await hashPassword(adminPassword);

  const adminPhone = '+920000000001';

  const admin = await prisma.user.upsert({
    where: { phone_regionId: { phone: adminPhone, regionId: region.id } },
    create: {
      phone: adminPhone,
      email: adminEmail,
      passwordHash,
      phoneVerifiedAt: new Date(),
      status: 'ACTIVE',
      regionId: region.id,
      platformRoles: {
        create: [{ role: PlatformRole.SUPER_ADMIN }, { role: PlatformRole.ADMIN }],
      },
    },
    update: {
      email: adminEmail,
      passwordHash,
      status: 'ACTIVE',
    },
  });

  await prisma.userProfile.upsert({
    where: { userId: admin.id },
    create: { userId: admin.id, fullName: 'Platform Admin' },
    update: { fullName: 'Platform Admin' },
  });

  await prisma.passengerProfile.upsert({
    where: { userId: admin.id },
    create: { userId: admin.id },
    update: {},
  });

  await prisma.wallet.upsert({
    where: { userId: admin.id },
    create: { userId: admin.id, currency: region.currency },
    update: {},
  });

  await prisma.notificationPreference.upsert({
    where: { userId: admin.id },
    create: { userId: admin.id },
    update: {},
  });

  console.log('Admin user seeded:', adminEmail);
  console.log('Admin password:', adminPassword);

  const { DEFAULT_PERMISSIONS, DEFAULT_ROLE_TEMPLATES } = await import('../src/constants/permissions');

  const permissionMap = new Map<string, string>();
  for (const p of DEFAULT_PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { key: p.key },
      create: { key: p.key, meaning: p.meaning, isSystem: true },
      update: { meaning: p.meaning, isSystem: true },
    });
    permissionMap.set(p.key, permission.id);
  }
  console.log('Permissions seeded:', DEFAULT_PERMISSIONS.length);

  for (const template of DEFAULT_ROLE_TEMPLATES) {
    const role = await prisma.role.upsert({
      where: { slug: template.slug },
      create: {
        name: template.name,
        slug: template.slug,
        description: template.description,
        isSystem: template.isSystem,
      },
      update: {
        name: template.name,
        description: template.description,
        isSystem: template.isSystem,
      },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: template.permissionKeys.map((key) => ({
        roleId: role.id,
        permissionId: permissionMap.get(key)!,
      })),
    });
  }
  console.log('Roles seeded:', DEFAULT_ROLE_TEMPLATES.map((r) => r.slug).join(', '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
