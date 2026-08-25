import { z } from 'zod';

const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);

export const nearbyPlacesQuerySchema = z.object({
  latitude: lat,
  longitude: lng,
  radius: z.coerce.number().min(0.2).max(50).default(8),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const searchPlacesQuerySchema = z.object({
  query: z.string().trim().min(2).max(120),
  latitude: lat.optional(),
  longitude: lng.optional(),
  sessionToken: z.string().max(80).optional(),
});

export const suggestionsQuerySchema = z.object({
  latitude: lat,
  longitude: lng,
  radius: z.coerce.number().min(0.2).max(50).default(8),
  limit: z.coerce.number().int().min(1).max(30).default(12),
});

export const reverseGeocodeQuerySchema = z.object({
  latitude: lat,
  longitude: lng,
});

export const googlePlaceParamsSchema = z.object({
  placeId: z.string().min(4).max(256),
});

export const googlePlaceQuerySchema = z.object({
  sessionToken: z.string().max(80).optional(),
});

export const upsertPlaceSchema = z.object({
  googlePlaceId: z.string().min(4).max(256),
  name: z.string().trim().min(1).max(255),
  formattedAddress: z.string().trim().max(500).optional(),
  latitude: lat,
  longitude: lng,
  type: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  area: z.string().trim().max(150).optional(),
});

export const selectPlaceSchema = z
  .object({
    googlePlaceId: z.string().min(4).max(256).optional(),
    placeId: z.string().uuid().optional(),
    latitude: lat.optional(),
    longitude: lng.optional(),
    sessionToken: z.string().max(80).optional(),
    source: z.enum(['search', 'nearby', 'recent', 'saved', 'current', 'pin']).optional(),
  })
  .refine((d) => Boolean(d.googlePlaceId || d.placeId || (d.latitude != null && d.longitude != null)), {
    message: 'Provide googlePlaceId, placeId, or latitude/longitude',
  });

export const adminListPlacesQuerySchema = z.object({
  city: z.string().trim().max(100).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminCreatePlaceSchema = z.object({
  name: z.string().trim().min(1).max(255),
  formattedAddress: z.string().trim().max(500).optional(),
  latitude: lat,
  longitude: lng,
  city: z.string().trim().max(100).optional(),
  area: z.string().trim().max(150).optional(),
  type: z.string().trim().max(100).optional(),
  priority: z.coerce.number().int().min(0).max(100).optional(),
  googlePlaceId: z.string().min(4).max(256).optional(),
});

export const adminUpdatePlaceSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  formattedAddress: z.string().trim().max(500).optional(),
  latitude: lat.optional(),
  longitude: lng.optional(),
  city: z.string().trim().max(100).optional(),
  area: z.string().trim().max(150).optional(),
  type: z.string().trim().max(100).optional(),
  priority: z.coerce.number().int().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
});
