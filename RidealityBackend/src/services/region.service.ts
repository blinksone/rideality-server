import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import { isSuperAdminRole, type AdminAssignmentRecord } from './admin-scope.service';

function countryFilter(assignment?: AdminAssignmentRecord | null): Prisma.RegionWhereInput {
  if (!assignment || isSuperAdminRole(assignment.role) || assignment.scopeType === 'PLATFORM' || assignment.scopeType === 'GLOBAL') {
    return {};
  }
  if (assignment.scopeType === 'CONTINENT' && assignment.continentId) {
    return { continentId: assignment.continentId };
  }
  if (assignment.countryId) {
    return { id: assignment.countryId };
  }
  return { id: '__none__' };
}

export async function listContinents(assignment?: AdminAssignmentRecord | null) {
  const where: Prisma.ContinentWhereInput = {};
  if (assignment?.scopeType === 'CONTINENT' && assignment.continentId) {
    where.id = assignment.continentId;
  } else if (assignment?.continentId && assignment.scopeType !== 'PLATFORM' && assignment.scopeType !== 'GLOBAL' && !isSuperAdminRole(assignment.role)) {
    where.id = assignment.continentId;
  }
  return prisma.continent.findMany({
    where,
    orderBy: { name: 'asc' },
    select: { id: true, code: true, name: true },
  });
}

export async function listProvinces(countryId: string, assignment?: AdminAssignmentRecord | null) {
  const allowedCountries = countryFilter(assignment);
  if (allowedCountries.id && allowedCountries.id !== countryId && allowedCountries.id !== '__none__') {
    throw new ForbiddenError('Forbidden: outside your assigned scope');
  }
  if (allowedCountries.continentId) {
    const country = await prisma.region.findUnique({
      where: { id: countryId },
      select: { continentId: true },
    });
    if (!country || country.continentId !== allowedCountries.continentId) {
      throw new ForbiddenError('Forbidden: outside your assigned scope');
    }
  }
  if (assignment?.scopeType === 'REGIONAL' && assignment.regionalId) {
    return prisma.province.findMany({
      where: { id: assignment.regionalId, countryId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, countryId: true },
    });
  }
  return prisma.province.findMany({
    where: { countryId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true, countryId: true },
  });
}

export async function listCities(query: {
  countryId?: string;
  provinceId?: string;
}, assignment?: AdminAssignmentRecord | null) {
  const where: Prisma.CityWhereInput = {};
  if (query.provinceId) where.provinceId = query.provinceId;
  if (query.countryId) where.province = { countryId: query.countryId };
  if (assignment?.scopeType === 'CITY' && assignment.cityId) {
    where.id = assignment.cityId;
  } else if (assignment?.scopeType === 'REGIONAL' && assignment.regionalId) {
    where.provinceId = assignment.regionalId;
  } else if (assignment?.scopeType === 'COUNTRY' && assignment.countryId) {
    where.province = { countryId: assignment.countryId };
  } else if (assignment?.scopeType === 'CONTINENT' && assignment.continentId) {
    where.province = { country: { continentId: assignment.continentId } };
  }
  return prisma.city.findMany({
    where,
    orderBy: { name: 'asc' },
    take: 500,
    select: {
      id: true,
      name: true,
      provinceId: true,
      province: { select: { id: true, name: true, countryId: true } },
    },
  });
}

export async function createCity(
  data: { name: string; provinceId: string },
  assignment?: AdminAssignmentRecord | null,
) {
  const name = data.name.trim().replace(/\s+/g, ' ');
  if (name.length < 2) throw new ValidationError('City name must be at least 2 characters');

  const province = await prisma.province.findUnique({
    where: { id: data.provinceId },
    select: {
      id: true,
      name: true,
      countryId: true,
      country: { select: { continentId: true } },
    },
  });
  if (!province) throw new NotFoundError('Province not found');

  if (assignment && !isSuperAdminRole(assignment.role) && assignment.scopeType !== 'PLATFORM' && assignment.scopeType !== 'GLOBAL') {
    if (assignment.scopeType === 'CITY') {
      throw new ForbiddenError('City admins cannot create cities');
    }
    if (assignment.scopeType === 'REGIONAL' && assignment.regionalId !== province.id) {
      throw new ForbiddenError('Province is outside your assigned region');
    }
    if (assignment.scopeType === 'COUNTRY' && assignment.countryId && assignment.countryId !== province.countryId) {
      throw new ForbiddenError('Province is outside your assigned country');
    }
    if (assignment.scopeType === 'CONTINENT' && assignment.continentId && province.country.continentId !== assignment.continentId) {
      throw new ForbiddenError('Province is outside your assigned continent');
    }
  }

  const existing = await prisma.city.findFirst({
    where: { provinceId: province.id, name: { equals: name, mode: 'insensitive' } },
    select: {
      id: true,
      name: true,
      provinceId: true,
      province: { select: { id: true, name: true, countryId: true } },
    },
  });
  if (existing) return existing;

  return prisma.city.create({
    data: { provinceId: province.id, name },
    select: {
      id: true,
      name: true,
      provinceId: true,
      province: { select: { id: true, name: true, countryId: true } },
    },
  });
}

export async function listActiveRegions(assignment?: AdminAssignmentRecord | null) {
  return prisma.region.findMany({
    where: { isActive: true, ...countryFilter(assignment) },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      code: true,
      name: true,
      currency: true,
      phonePrefix: true,
      continentId: true,
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
