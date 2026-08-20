import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError } from '../utils/errors';

export async function listActiveRegions() {
  return prisma.region.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      code: true,
      name: true,
      currency: true,
      phonePrefix: true,
    },
  });
}

export async function listRegions(query: {
  page: number;
  limit: number;
  search?: string;
  activeOnly?: boolean;
}) {
  const where: Prisma.RegionWhereInput = {};

  if (query.activeOnly !== undefined) {
    where.isActive = query.activeOnly;
  }

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { code: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const [regions, total] = await Promise.all([
    prisma.region.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.region.count({ where }),
  ]);

  return { regions, total };
}

export async function getRegion(regionId: string) {
  const region = await prisma.region.findUnique({ where: { id: regionId } });
  if (!region) throw new NotFoundError('Region not found');
  return region;
}

export async function createRegion(data: {
  code: string;
  name: string;
  currency: string;
  phonePrefix: string;
}) {
  const existing = await prisma.region.findUnique({ where: { code: data.code } });
  if (existing) throw new ConflictError('Region code already exists', 'REGION_CODE_EXISTS');

  return prisma.region.create({
    data: {
      code: data.code.toUpperCase(),
      name: data.name,
      currency: data.currency.toUpperCase(),
      phonePrefix: data.phonePrefix,
      isActive: true,
    },
  });
}

export async function updateRegion(
  regionId: string,
  data: {
    name?: string;
    currency?: string;
    phonePrefix?: string;
    isActive?: boolean;
  },
) {
  await getRegion(regionId);

  return prisma.region.update({
    where: { id: regionId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.currency !== undefined ? { currency: data.currency.toUpperCase() } : {}),
      ...(data.phonePrefix !== undefined ? { phonePrefix: data.phonePrefix } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
}

export async function assertActiveRegion(regionId: string) {
  const region = await prisma.region.findUnique({ where: { id: regionId } });
  if (!region) throw new NotFoundError('Region not found');
  if (!region.isActive) {
    throw new NotFoundError('Region is not active', 'REGION_INACTIVE');
  }
  return region;
}
