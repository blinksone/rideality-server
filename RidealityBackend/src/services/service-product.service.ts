import { FleetCompanyStatus, ServiceFamily } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { estimateTripFare, type FareProductValue } from './fare.service';
import { haversineMeters, searchNearbyDrivers } from './location.service';

export type ServiceProductDto = {
  code: string;
  label: string;
  family: 'taxi' | 'cargo';
  sortOrder: number;
  fareMultiplier: number;
};

const ALIASES: Record<string, string> = {
  sedan: 'economy',
  car: 'economy',
  eco: 'economy',
  economy: 'economy',
  'non-ac': 'economy',
  non_ac: 'economy',
  nonac: 'economy',
  ac: 'ac',
  bike: 'bike',
  motorcycle: 'bike',
  moto: 'bike',
  rickshaw: 'rickshaw',
  qingqi: 'rickshaw',
  cargo: 'cargo',
  van: 'cargo',
  pickup: 'cargo',
  suv: 'economy',
};

export function normalizeVehicleType(raw?: string | null): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return ALIASES[key] ?? key.replace(/\s+/g, '_');
}

export function familyForProduct(code: string, bookingType?: 'ride' | 'cargo'): FareProductValue {
  if (bookingType === 'cargo' || code === 'cargo') return 'cargo';
  return 'ride';
}

export async function listServiceCatalog(family?: 'taxi' | 'cargo'): Promise<ServiceProductDto[]> {
  const rows = await prisma.serviceProduct.findMany({
    where: {
      isActive: true,
      ...(family ? { family: family === 'cargo' ? ServiceFamily.cargo : ServiceFamily.taxi } : {}),
    },
    orderBy: { sortOrder: 'asc' },
  });
  return rows.map((row) => ({
    code: row.code,
    label: row.label,
    family: row.family === ServiceFamily.cargo ? 'cargo' : 'taxi',
    sortOrder: row.sortOrder,
    fareMultiplier: Number(row.fareMultiplier),
  }));
}

export async function listEnabledProductCodes(countryId: string): Promise<Set<string>> {
  const rows = await prisma.fleetRegionService.findMany({
    where: {
      enabled: true,
      fleetRegion: {
        fleetCompany: { regionId: countryId, status: FleetCompanyStatus.active },
      },
    },
    select: { productCode: true },
  });
  return new Set(rows.map((row) => row.productCode));
}

export async function quoteTrip(input: {
  countryId: string;
  cityId?: string | null;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  bookingType: 'ride' | 'cargo';
  cargoWeightKg?: number;
}) {
  const family = input.bookingType === 'cargo' ? 'cargo' : 'taxi';
  const catalog = await listServiceCatalog(family);
  const enrolled = await listEnabledProductCodes(input.countryId);
  const offer = enrolled.size === 0 ? catalog : catalog.filter((row) => enrolled.has(row.code));

  const distanceMeters = haversineMeters(
    input.pickupLat,
    input.pickupLng,
    input.dropoffLat,
    input.dropoffLng,
  );
  const distanceKm = Math.round((distanceMeters / 1000) * 100) / 100;
  const durationMin = Math.max(1, Math.round((distanceKm / 22) * 60));

  const nearby = await searchNearbyDrivers(input.pickupLng, input.pickupLat, 8, 40).catch(() => []);

  const options = await Promise.all(
    offer.map(async (product) => {
      const quoted = await estimateTripFare({
        countryId: input.countryId,
        cityId: input.cityId,
        product: familyForProduct(product.code, input.bookingType),
        serviceProductCode: product.code,
        fareMultiplier: product.fareMultiplier,
        distanceMeters,
        cargoWeightKg: input.bookingType === 'cargo' ? input.cargoWeightKg : undefined,
      });
      const nearest = nearby.find((d) => normalizeVehicleType(d.vehicleType) === product.code);
      const etaMin = nearest
        ? Math.max(2, Math.round(nearest.distanceMeters / 400))
        : durationMin;
      return {
        vehicleType: product.code,
        label: product.label,
        family: product.family,
        fare: quoted.fare,
        currency: quoted.currency,
        etaMin,
        available: Boolean(nearest) || enrolled.size === 0 || enrolled.has(product.code),
        badge: null as string | null,
      };
    }),
  );

  const available = options.filter((row) => row.available);
  const fastest = available.reduce<number | null>(
    (min, row) => (min == null || row.etaMin < min ? row.etaMin : min),
    null,
  );
  if (fastest != null) {
    const match = available.find((row) => row.etaMin === fastest);
    if (match) match.badge = 'Fastest';
  }

  return {
    currency: options[0]?.currency ?? 'PKR',
    distanceKm,
    durationMin,
    bookingType: input.bookingType,
    options,
  };
}
