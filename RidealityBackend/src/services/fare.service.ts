import { FareProduct, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import {
  isSuperAdminRole,
  type AdminAssignmentRecord,
} from './admin-scope.service';

export type FareProductValue = 'ride' | 'cargo';

export type FareConfigInput = {
  countryId: string;
  cityId?: string | null;
  product?: FareProductValue;
  serviceProductCode?: string;
  baseFare: number;
  perKm: number;
  perMinute: number;
  minimumFare: number;
  bookingFee: number;
  cancellationFee?: number;
  cargoPerKg?: number;
};

const COUNTRY_DEFAULT_ROLES = new Set([
  'SUPER_ADMIN',
  'GLOBAL_ADMIN',
  'CONTINENT_ADMIN',
  'COUNTRY_ADMIN',
]);

function money(value: number): number {
  return Math.round(Number(value) * 100) / 100;
}

function mapFare(row: {
  id: string;
  countryId: string;
  cityId: string | null;
  product: FareProduct;
  serviceProductCode?: string | null;
  currency: string;
  baseFare: Prisma.Decimal | number;
  perKm: Prisma.Decimal | number;
  perMinute: Prisma.Decimal | number;
  minimumFare: Prisma.Decimal | number;
  bookingFee: Prisma.Decimal | number;
  cancellationFee: Prisma.Decimal | number;
  cargoPerKg: Prisma.Decimal | number;
  createdAt: Date;
  updatedAt: Date;
  country?: { id: string; name: string; code: string; currency: string };
  city?: { id: string; name: string; provinceId: string; province?: { name: string } } | null;
  serviceProduct?: { code: string; label: string } | null;
}) {
  return {
    id: row.id,
    countryId: row.countryId,
    cityId: row.cityId,
    product: row.product,
    serviceProductCode: row.serviceProductCode ?? row.serviceProduct?.code ?? null,
    productLabel: row.serviceProduct?.label ?? (row.product === 'cargo' ? 'Cargo' : 'Economy'),
    currency: row.currency,
    baseFare: Number(row.baseFare),
    perKm: Number(row.perKm),
    perMinute: Number(row.perMinute),
    minimumFare: Number(row.minimumFare),
    bookingFee: Number(row.bookingFee),
    cancellationFee: Number(row.cancellationFee),
    cargoPerKg: Number(row.cargoPerKg),
    isCountryDefault: !row.cityId,
    countryName: row.country?.name ?? null,
    countryCode: row.country?.code ?? null,
    cityName: row.city?.name ?? null,
    provinceName: row.city?.province?.name ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function canManageCountryDefault(assignment?: AdminAssignmentRecord | null): boolean {
  if (!assignment) return true;
  return isSuperAdminRole(assignment.role) || COUNTRY_DEFAULT_ROLES.has(assignment.role);
}

async function assertCanMutateCity(
  cityId: string | null,
  countryId: string,
  assignment?: AdminAssignmentRecord | null,
) {
  if (!assignment || isSuperAdminRole(assignment.role) || assignment.scopeType === 'PLATFORM' || assignment.scopeType === 'GLOBAL') {
    return;
  }
  if (!cityId) {
    if (!canManageCountryDefault(assignment)) {
      throw new ForbiddenError('Only country admins and above can set a country default fare');
    }
    if (assignment.scopeType === 'CONTINENT' && assignment.continentId) {
      const country = await prisma.region.findUnique({
        where: { id: countryId },
        select: { continentId: true },
      });
      if (!country || country.continentId !== assignment.continentId) {
        throw new ForbiddenError('Country is outside your assigned continent');
      }
    }
    if (assignment.scopeType === 'COUNTRY' && assignment.countryId && assignment.countryId !== countryId) {
      throw new ForbiddenError('Country is outside your assigned scope');
    }
    return;
  }

  const city = await prisma.city.findUnique({
    where: { id: cityId },
    select: {
      id: true,
      provinceId: true,
      province: { select: { countryId: true, country: { select: { continentId: true } } } },
    },
  });
  if (!city) throw new NotFoundError('City not found');
  if (city.province.countryId !== countryId) {
    throw new ValidationError('City does not belong to the selected country');
  }
  if (assignment.scopeType === 'CITY' && assignment.cityId !== cityId) {
    throw new ForbiddenError('You can only manage fares for your assigned city');
  }
  if (assignment.scopeType === 'REGIONAL' && assignment.regionalId !== city.provinceId) {
    throw new ForbiddenError('City is outside your assigned region');
  }
  if (assignment.scopeType === 'COUNTRY' && assignment.countryId !== city.province.countryId) {
    throw new ForbiddenError('City is outside your assigned country');
  }
  if (assignment.scopeType === 'CONTINENT' && assignment.continentId !== city.province.country.continentId) {
    throw new ForbiddenError('City is outside your assigned continent');
  }
}

const FARE_INCLUDE = {
  country: { select: { id: true, name: true, code: true, currency: true } },
  city: {
    select: {
      id: true,
      name: true,
      provinceId: true,
      province: { select: { name: true } },
    },
  },
  serviceProduct: { select: { code: true, label: true } },
} as const;

function canEditRow(
  row: { cityId: string | null; countryId: string; city?: { provinceId: string } | null },
  assignment?: AdminAssignmentRecord | null,
): boolean {
  if (!assignment || isSuperAdminRole(assignment.role) || assignment.scopeType === 'PLATFORM' || assignment.scopeType === 'GLOBAL') {
    return true;
  }
  if (!row.cityId) return canManageCountryDefault(assignment) && (
    assignment.scopeType !== 'COUNTRY' || assignment.countryId === row.countryId
  );
  if (assignment.scopeType === 'CITY') return assignment.cityId === row.cityId;
  if (assignment.scopeType === 'REGIONAL') return row.city?.provinceId === assignment.regionalId;
  if (assignment.scopeType === 'COUNTRY') return assignment.countryId === row.countryId;
  if (assignment.scopeType === 'CONTINENT') return true;
  return false;
}

export async function listFareConfigs(
  query: { countryId?: string; cityId?: string; product?: FareProductValue; serviceProductCode?: string },
  assignment?: AdminAssignmentRecord | null,
) {
  const where: Prisma.FareConfigWhereInput = {};
  if (query.serviceProductCode) where.serviceProductCode = query.serviceProductCode;
  else if (query.product) where.product = query.product;
  if (query.cityId) where.cityId = query.cityId;
  if (query.countryId) where.countryId = query.countryId;

  if (assignment && !isSuperAdminRole(assignment.role) && assignment.scopeType !== 'PLATFORM' && assignment.scopeType !== 'GLOBAL') {
    if (assignment.scopeType === 'CITY' && assignment.cityId) {
      where.OR = [
        { cityId: assignment.cityId },
        ...(assignment.countryId
          ? [{ countryId: assignment.countryId, cityId: null }]
          : []),
      ];
    } else if (assignment.scopeType === 'REGIONAL' && assignment.regionalId) {
      where.OR = [
        { city: { provinceId: assignment.regionalId } },
        ...(assignment.countryId
          ? [{ countryId: assignment.countryId, cityId: null }]
          : []),
      ];
    } else if (assignment.scopeType === 'COUNTRY' && assignment.countryId) {
      where.countryId = assignment.countryId;
    } else if (assignment.scopeType === 'CONTINENT' && assignment.continentId) {
      where.country = { continentId: assignment.continentId };
    }
  }

  const rows = await prisma.fareConfig.findMany({
    where,
    include: FARE_INCLUDE,
    orderBy: [{ country: { name: 'asc' } }, { city: { name: 'asc' } }, { product: 'asc' }],
  });

  return rows.map((row) => ({
    ...mapFare(row),
    canEdit: canEditRow(row, assignment),
  }));
}

export async function createFareConfig(
  data: FareConfigInput,
  assignment?: AdminAssignmentRecord | null,
) {
  let cityId = data.cityId?.trim() || null;
  let countryId = data.countryId;

  if (assignment?.scopeType === 'CITY' && assignment.cityId) {
    cityId = assignment.cityId;
    if (assignment.countryId) countryId = assignment.countryId;
  }

  const country = await prisma.region.findUnique({
    where: { id: countryId },
    select: { id: true, currency: true, name: true },
  });
  if (!country) throw new NotFoundError('Country not found');

  await assertCanMutateCity(cityId, country.id, assignment);

  const productCode =
    data.serviceProductCode ?? (data.product === 'cargo' ? 'cargo' : 'economy');
  const catalog = await prisma.serviceProduct.findUnique({ where: { code: productCode } });
  if (!catalog) throw new ValidationError('Unknown service product');
  const familyProduct: FareProductValue =
    catalog.family === 'cargo' || data.product === 'cargo' ? 'cargo' : 'ride';

  try {
    const created = await prisma.fareConfig.create({
      data: {
        countryId: country.id,
        cityId,
        product: familyProduct,
        serviceProductCode: productCode,
        currency: country.currency,
        baseFare: data.baseFare,
        perKm: data.perKm,
        perMinute: data.perMinute,
        minimumFare: data.minimumFare,
        bookingFee: data.bookingFee,
        cancellationFee: data.cancellationFee ?? 0,
        cargoPerKg: data.cargoPerKg ?? 0,
      },
      include: FARE_INCLUDE,
    });
    return { ...mapFare(created), canEdit: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError(
        cityId
          ? 'A fare config already exists for this city and product'
          : 'A country default already exists for this product',
        'FARE_EXISTS',
      );
    }
    throw err;
  }
}

export async function updateFareConfig(
  id: string,
  data: Partial<FareConfigInput>,
  assignment?: AdminAssignmentRecord | null,
) {
  const existing = await prisma.fareConfig.findUnique({
    where: { id },
    include: { city: { select: { provinceId: true } } },
  });
  if (!existing) throw new NotFoundError('Fare config not found');
  if (!canEditRow(existing, assignment)) {
    throw new ForbiddenError('You cannot edit this fare config');
  }

  const updated = await prisma.fareConfig.update({
    where: { id },
    data: {
      ...(data.baseFare !== undefined ? { baseFare: data.baseFare } : {}),
      ...(data.perKm !== undefined ? { perKm: data.perKm } : {}),
      ...(data.perMinute !== undefined ? { perMinute: data.perMinute } : {}),
      ...(data.minimumFare !== undefined ? { minimumFare: data.minimumFare } : {}),
      ...(data.bookingFee !== undefined ? { bookingFee: data.bookingFee } : {}),
      ...(data.cancellationFee !== undefined ? { cancellationFee: data.cancellationFee } : {}),
      ...(data.cargoPerKg !== undefined ? { cargoPerKg: data.cargoPerKg } : {}),
    },
    include: FARE_INCLUDE,
  });
  return { ...mapFare(updated), canEdit: true };
}

export async function deleteFareConfig(id: string, assignment?: AdminAssignmentRecord | null) {
  const existing = await prisma.fareConfig.findUnique({
    where: { id },
    include: { city: { select: { provinceId: true } } },
  });
  if (!existing) throw new NotFoundError('Fare config not found');
  if (!canEditRow(existing, assignment)) {
    throw new ForbiddenError('You cannot delete this fare config');
  }
  await prisma.fareConfig.delete({ where: { id } });
  return { id };
}

export async function estimateTripFare(input: {
  countryId: string;
  cityId?: string | null;
  product: FareProductValue;
  serviceProductCode?: string | null;
  fareMultiplier?: number;
  distanceMeters: number;
  cargoWeightKg?: number;
}): Promise<{
  fare: number;
  currency: string;
  fareConfigId: string | null;
  bookingFee: number;
  platformCommissionPercent: number;
}> {
  const km = input.distanceMeters / 1000;
  const minutes = Math.max(1, (km / 22) * 60);
  const code = input.serviceProductCode || (input.product === 'cargo' ? 'cargo' : 'economy');
  const multiplier = input.fareMultiplier ?? 1;

  const byCodeCity = input.cityId
    ? await prisma.fareConfig.findFirst({
        where: { cityId: input.cityId, serviceProductCode: code },
      })
    : null;
  const byCodeCountry = await prisma.fareConfig.findFirst({
    where: { countryId: input.countryId, cityId: null, serviceProductCode: code },
  });
  const cityConfig = input.cityId
    ? await prisma.fareConfig.findFirst({
        where: { cityId: input.cityId, product: input.product },
      })
    : null;
  const countryConfig =
    byCodeCity ??
    byCodeCountry ??
    cityConfig ??
    (await prisma.fareConfig.findFirst({
      where: { countryId: input.countryId, cityId: null, product: input.product },
    }));

  const country = await prisma.region.findUnique({
    where: { id: input.countryId },
    select: { currency: true, platformCommissionPercent: true },
  });
  const currency = countryConfig?.currency ?? country?.currency ?? 'PKR';
  const platformCommissionPercent = Number(country?.platformCommissionPercent ?? 0);

  if (!countryConfig) {
    let fare = (150 + km * 40) * multiplier;
    if (input.product === 'cargo' && input.cargoWeightKg) {
      fare += input.cargoWeightKg * 8;
    }
    return {
      fare: money(fare),
      currency,
      fareConfigId: null,
      bookingFee: 0,
      platformCommissionPercent,
    };
  }

  const bookingFee = Number(countryConfig.bookingFee);
  let fare =
    Number(countryConfig.baseFare) +
    km * Number(countryConfig.perKm) +
    minutes * Number(countryConfig.perMinute) +
    bookingFee;
  if (input.product === 'cargo' && input.cargoWeightKg) {
    fare += input.cargoWeightKg * Number(countryConfig.cargoPerKg);
  }
  fare = Math.max(Number(countryConfig.minimumFare), fare);
  if (countryConfig.serviceProductCode !== code) {
    fare = fare * multiplier;
  }
  return {
    fare: money(fare),
    currency,
    fareConfigId: countryConfig.id,
    bookingFee: money(bookingFee),
    platformCommissionPercent,
  };
}
