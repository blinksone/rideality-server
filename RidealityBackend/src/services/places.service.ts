import { PlaceSource, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../utils/errors';
import {
  autocompletePlaces,
  getGooglePlaceDetails,
  isGooglePlacesConfigured,
  mapGoogleType,
  reverseGeocode,
} from '../clients/google-places.client';

export type SelectedLocation = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  googlePlaceId: string | null;
  databaseId: string | null;
  type: string | null;
  city: string | null;
  area: string | null;
  distanceKm: number | null;
};

export type PlaceSearchHit = {
  placeId: string | null;
  databaseId: string | null;
  name: string;
  description: string;
  source: 'LOCAL' | 'GOOGLE';
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
};

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function formatPlace(
  place: {
    id: string;
    name: string;
    formattedAddress: string | null;
    latitude: Prisma.Decimal | number;
    longitude: Prisma.Decimal | number;
    type: string | null;
    city: string | null;
    area: string | null;
    googlePlaceId: string | null;
  },
  origin?: { latitude: number; longitude: number },
): SelectedLocation {
  const latitude = Number(place.latitude);
  const longitude = Number(place.longitude);
  return {
    name: place.name,
    address: place.formattedAddress ?? [place.area, place.city].filter(Boolean).join(', '),
    latitude,
    longitude,
    googlePlaceId: place.googlePlaceId,
    databaseId: place.id,
    type: place.type,
    city: place.city,
    area: place.area,
    distanceKm: origin ? Number(haversineKm(origin.latitude, origin.longitude, latitude, longitude).toFixed(2)) : null,
  };
}

async function recordUserRecent(userId: string, placeId: string) {
  await prisma.placeUsage.upsert({
    where: { userId_placeId: { userId, placeId } },
    create: { userId, placeId, usedAt: new Date() },
    update: { usedAt: new Date() },
  });
}

async function recordUsage(userId: string, placeId: string) {
  const now = new Date();
  await prisma.$transaction([
    prisma.place.update({
      where: { id: placeId },
      data: { usageCount: { increment: 1 }, lastUsedAt: now },
    }),
    prisma.placeUsage.upsert({
      where: { userId_placeId: { userId, placeId } },
      create: { userId, placeId, usedAt: now },
      update: { usedAt: now },
    }),
  ]);
}

export async function listNearbyPlaces(query: {
  latitude: number;
  longitude: number;
  radius: number;
  limit: number;
}): Promise<SelectedLocation[]> {
  const latDelta = query.radius / 111;
  const cosLat = Math.cos(toRad(query.latitude));
  const lngDelta = query.radius / (111 * Math.max(0.2, Math.abs(cosLat)));

  const candidates = await prisma.place.findMany({
    where: {
      isActive: true,
      latitude: { gte: query.latitude - latDelta, lte: query.latitude + latDelta },
      longitude: { gte: query.longitude - lngDelta, lte: query.longitude + lngDelta },
    },
    take: Math.min(200, query.limit * 8),
  });

  return candidates
    .map((place) => formatPlace(place, { latitude: query.latitude, longitude: query.longitude }))
    .filter((row) => (row.distanceKm ?? 99) <= query.radius)
    .sort((a, b) => {
      const dist = (a.distanceKm ?? 99) - (b.distanceKm ?? 99);
      if (Math.abs(dist) > 0.15) return dist;
      const placeA = candidates.find((p) => p.id === a.databaseId);
      const placeB = candidates.find((p) => p.id === b.databaseId);
      const priority = (placeB?.priority ?? 0) - (placeA?.priority ?? 0);
      if (priority) return priority;
      return (placeB?.usageCount ?? 0) - (placeA?.usageCount ?? 0);
    })
    .slice(0, query.limit);
}

export async function searchPlaces(query: {
  query: string;
  latitude?: number;
  longitude?: number;
  sessionToken?: string;
}): Promise<PlaceSearchHit[]> {
  const q = query.query.trim();
  const origin =
    query.latitude != null && query.longitude != null
      ? { latitude: query.latitude, longitude: query.longitude }
      : undefined;

  const local = await prisma.place.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { area: { contains: q, mode: 'insensitive' } },
        { formattedAddress: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: 24,
  });

  const localHits: PlaceSearchHit[] = local
    .map((place) => {
      const formatted = formatPlace(place, origin);
      return {
        placeId: place.googlePlaceId,
        databaseId: place.id,
        name: formatted.name,
        description: formatted.address,
        source: 'LOCAL' as const,
        latitude: formatted.latitude,
        longitude: formatted.longitude,
        distanceKm: formatted.distanceKm,
      };
    })
    .sort((a, b) => {
      const dist = (a.distanceKm ?? 99) - (b.distanceKm ?? 99);
      if (Math.abs(dist) > 0.15) return dist;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 6);

  const knownGoogleIds = new Set(
    local.map((place) => place.googlePlaceId).filter((id): id is string => Boolean(id)),
  );

  let googleHits: PlaceSearchHit[] = [];
  if (isGooglePlacesConfigured()) {
    try {
      const predictions = await autocompletePlaces(query);
      googleHits = predictions
        .filter((row) => !knownGoogleIds.has(row.placeId))
        .map((row) => ({
          placeId: row.placeId,
          databaseId: null,
          name: row.name,
          description: row.description,
          source: 'GOOGLE' as const,
          latitude: null,
          longitude: null,
          distanceKm: null,
        }));
    } catch (err) {
      if (localHits.length === 0) throw err;
    }
  }

  return [...localHits, ...googleHits];
}

/** @deprecated Use searchPlaces — kept for any leftover callers. */
export async function searchGooglePlaces(query: {
  query: string;
  latitude?: number;
  longitude?: number;
  sessionToken?: string;
}) {
  return searchPlaces(query);
}

export async function getGooglePlace(placeId: string, sessionToken?: string) {
  const details = await getGooglePlaceDetails(placeId, sessionToken);
  return {
    placeId: details.placeId,
    name: details.name,
    formattedAddress: details.formattedAddress,
    latitude: details.latitude,
    longitude: details.longitude,
    types: details.types,
    city: details.city,
    area: details.area,
  };
}

export async function upsertGooglePlace(
  userId: string | null,
  input: {
    googlePlaceId: string;
    name: string;
    formattedAddress?: string;
    latitude: number;
    longitude: number;
    type?: string;
    city?: string;
    area?: string;
  },
): Promise<SelectedLocation> {
  const place = await prisma.place.upsert({
    where: { googlePlaceId: input.googlePlaceId },
    create: {
      name: input.name,
      formattedAddress: input.formattedAddress,
      latitude: input.latitude,
      longitude: input.longitude,
      type: input.type ?? null,
      city: input.city ?? null,
      area: input.area ?? null,
      googlePlaceId: input.googlePlaceId,
      source: PlaceSource.GOOGLE,
      usageCount: 1,
      lastUsedAt: new Date(),
    },
    update: {
      name: input.name,
      formattedAddress: input.formattedAddress ?? undefined,
      latitude: input.latitude,
      longitude: input.longitude,
      type: input.type ?? undefined,
      city: input.city ?? undefined,
      area: input.area ?? undefined,
      usageCount: { increment: 1 },
      lastUsedAt: new Date(),
      isActive: true,
    },
  });

  if (userId) await recordUserRecent(userId, place.id);
  return formatPlace(place);
}

export async function selectPlace(
  userId: string,
  input: {
    googlePlaceId?: string;
    placeId?: string;
    latitude?: number;
    longitude?: number;
    sessionToken?: string;
    source?: string;
  },
): Promise<SelectedLocation> {
  if (input.placeId) {
    const place = await prisma.place.findFirst({
      where: { id: input.placeId, isActive: true },
    });
    if (!place) throw new NotFoundError('Place not found');
    await recordUsage(userId, place.id);
    return formatPlace(place);
  }

  if (input.googlePlaceId) {
    const details = await getGooglePlaceDetails(input.googlePlaceId, input.sessionToken);
    return upsertGooglePlace(userId, {
      googlePlaceId: details.placeId,
      name: details.name,
      formattedAddress: details.formattedAddress,
      latitude: details.latitude,
      longitude: details.longitude,
      type: mapGoogleType(details.types) ?? undefined,
      city: details.city ?? undefined,
      area: details.area ?? undefined,
    });
  }

  if (input.latitude == null || input.longitude == null) {
    throw new ValidationError('Provide googlePlaceId, placeId, or latitude/longitude');
  }

  const geo = await safeReverseGeocode(input.latitude, input.longitude);
  // Map pin / current location: resolve address, do not pollute the popular catalog.
  if (input.source === 'current' || input.source === 'pin' || !geo.googlePlaceId) {
    return {
      name: input.source === 'current' ? 'Current location' : geo.name,
      address: geo.formattedAddress,
      latitude: input.latitude,
      longitude: input.longitude,
      googlePlaceId: geo.googlePlaceId,
      databaseId: null,
      type: mapGoogleType(geo.types),
      city: geo.city,
      area: geo.area,
      distanceKm: 0,
    };
  }

  return upsertGooglePlace(userId, {
    googlePlaceId: geo.googlePlaceId,
    name: geo.name,
    formattedAddress: geo.formattedAddress,
    latitude: input.latitude,
    longitude: input.longitude,
    type: mapGoogleType(geo.types) ?? undefined,
    city: geo.city ?? undefined,
    area: geo.area ?? undefined,
  });
}

export async function listRecentPlaces(userId: string, limit = 8): Promise<SelectedLocation[]> {
  const rows = await prisma.placeUsage.findMany({
    where: { userId, place: { isActive: true } },
    include: { place: true },
    orderBy: { usedAt: 'desc' },
    take: limit,
  });
  return rows.map((row) => formatPlace(row.place));
}

function formatSavedLocation(
  row: { label: string; address: string; latitude: Prisma.Decimal | number; longitude: Prisma.Decimal | number },
  origin: { latitude: number; longitude: number },
): SelectedLocation {
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  return {
    name: row.label === 'home' ? 'Home' : row.label === 'work' ? 'Work' : row.label,
    address: row.address,
    latitude,
    longitude,
    googlePlaceId: null,
    databaseId: null,
    type: row.label.toUpperCase(),
    city: null,
    area: null,
    distanceKm: Number(haversineKm(origin.latitude, origin.longitude, latitude, longitude).toFixed(2)),
  };
}

async function safeReverseGeocode(latitude: number, longitude: number) {
  if (!isGooglePlacesConfigured()) {
    return {
      name: 'Current location',
      formattedAddress: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
      city: null as string | null,
      area: null as string | null,
      googlePlaceId: null as string | null,
      types: [] as string[],
    };
  }
  try {
    return await reverseGeocode(latitude, longitude);
  } catch {
    return {
      name: 'Current location',
      formattedAddress: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
      city: null as string | null,
      area: null as string | null,
      googlePlaceId: null as string | null,
      types: [] as string[],
    };
  }
}

export async function listPickupSuggestions(userId: string, query: {
  latitude: number;
  longitude: number;
  radius: number;
  limit: number;
}) {
  const [current, saved, recents, nearby] = await Promise.all([
    safeReverseGeocode(query.latitude, query.longitude),
    prisma.savedLocation.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    }),
    listRecentPlaces(userId, 6),
    listNearbyPlaces(query),
  ]);

  const origin = { latitude: query.latitude, longitude: query.longitude };
  const home = saved.find((row) => row.label === 'home');
  const work = saved.find((row) => row.label === 'work');
  const recentIds = new Set(recents.map((r) => r.databaseId));
  return {
    current: {
      name: 'Current location',
      address: current.formattedAddress,
      latitude: query.latitude,
      longitude: query.longitude,
      googlePlaceId: current.googlePlaceId,
      databaseId: null,
      type: 'CURRENT',
      city: current.city,
      area: current.area,
      distanceKm: 0,
    } satisfies SelectedLocation,
    saved: saved.map((row) => formatSavedLocation(row, origin)),
    savedSlots: {
      home: home ? formatSavedLocation(home, origin) : null,
      work: work ? formatSavedLocation(work, origin) : null,
    },
    recents,
    nearby: nearby.filter((row) => !recentIds.has(row.databaseId)),
    searchEnabled: isGooglePlacesConfigured(),
  };
}

export async function reverseGeocodePin(latitude: number, longitude: number): Promise<SelectedLocation> {
  const geo = await safeReverseGeocode(latitude, longitude);
  return {
    name: geo.name,
    address: geo.formattedAddress,
    latitude,
    longitude,
    googlePlaceId: geo.googlePlaceId,
    databaseId: null,
    type: mapGoogleType(geo.types),
    city: geo.city,
    area: geo.area,
    distanceKm: 0,
  };
}

export async function listAdminPlaces(query: {
  city?: string;
  search?: string;
  page: number;
  limit: number;
}) {
  const where: Prisma.PlaceWhereInput = {};
  if (query.city) where.city = { equals: query.city, mode: 'insensitive' };
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { area: { contains: query.search, mode: 'insensitive' } },
      { formattedAddress: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  const skip = (query.page - 1) * query.limit;
  const [total, rows] = await Promise.all([
    prisma.place.count({ where }),
    prisma.place.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { usageCount: 'desc' }, { name: 'asc' }],
      skip,
      take: query.limit,
    }),
  ]);
  return {
    data: rows.map((row) => ({
      id: row.id,
      name: row.name,
      address: row.formattedAddress,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      city: row.city,
      area: row.area,
      type: row.type,
      source: row.source,
      priority: row.priority,
      usageCount: row.usageCount,
      isActive: row.isActive,
      googlePlaceId: row.googlePlaceId,
    })),
    pagination: { page: query.page, limit: query.limit, total },
  };
}

export async function createAdminPlace(input: {
  name: string;
  formattedAddress?: string;
  latitude: number;
  longitude: number;
  city?: string;
  area?: string;
  type?: string;
  priority?: number;
  googlePlaceId?: string;
}) {
  const row = await prisma.place.create({
    data: {
      name: input.name,
      formattedAddress: input.formattedAddress,
      latitude: input.latitude,
      longitude: input.longitude,
      city: input.city,
      area: input.area,
      type: input.type,
      priority: input.priority ?? 80,
      googlePlaceId: input.googlePlaceId,
      source: PlaceSource.ADMIN,
    },
  });
  return formatAdminPlace(row);
}

export async function updateAdminPlace(
  id: string,
  input: {
    name?: string;
    formattedAddress?: string;
    latitude?: number;
    longitude?: number;
    city?: string;
    area?: string;
    type?: string;
    priority?: number;
    isActive?: boolean;
  },
) {
  const existing = await prisma.place.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Place not found');
  const row = await prisma.place.update({
    where: { id },
    data: {
      name: input.name,
      formattedAddress: input.formattedAddress,
      latitude: input.latitude,
      longitude: input.longitude,
      city: input.city,
      area: input.area,
      type: input.type,
      priority: input.priority,
      isActive: input.isActive,
    },
  });
  return formatAdminPlace(row);
}

function formatAdminPlace(row: {
  id: string;
  name: string;
  formattedAddress: string | null;
  latitude: Prisma.Decimal | number;
  longitude: Prisma.Decimal | number;
  city: string | null;
  area: string | null;
  type: string | null;
  source: PlaceSource;
  priority: number;
  usageCount: number;
  isActive: boolean;
  googlePlaceId: string | null;
}) {
  return {
    id: row.id,
    name: row.name,
    address: row.formattedAddress,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    city: row.city,
    area: row.area,
    type: row.type,
    source: row.source,
    priority: row.priority,
    usageCount: row.usageCount,
    isActive: row.isActive,
    googlePlaceId: row.googlePlaceId,
  };
}
