import { env } from '../config/env';
import { logger } from '../lib/logger';
import { ValidationError } from '../utils/errors';

const AUTOCOMPLETE_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

export type GooglePrediction = {
  placeId: string;
  name: string;
  description: string;
};

export type GooglePlaceDetails = {
  placeId: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  types: string[];
  city: string | null;
  area: string | null;
};

export function isGooglePlacesConfigured(): boolean {
  return Boolean(env.GOOGLE_PLACES_API_KEY?.trim());
}

function requireKey(): string {
  const key = env.GOOGLE_PLACES_API_KEY?.trim();
  if (!key) {
    throw new ValidationError(
      'Location search is not configured. Ask Rideality to set GOOGLE_PLACES_API_KEY on the server.',
    );
  }
  return key;
}

async function googleGet<T>(url: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ ...params, key: requireKey() });
  const res = await fetch(`${url}?${qs.toString()}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new ValidationError('Unable to search locations. Try again.');
  }
  return (await res.json()) as T;
}

function component(
  components: Array<{ long_name: string; types: string[] }> | undefined,
  type: string,
): string | null {
  return components?.find((c) => c.types.includes(type))?.long_name ?? null;
}

export function mapGoogleType(types: string[] | undefined): string | null {
  if (!types?.length) return null;
  const map: Record<string, string> = {
    shopping_mall: 'MALL',
    supermarket: 'STORE',
    store: 'STORE',
    restaurant: 'RESTAURANT',
    cafe: 'RESTAURANT',
    airport: 'AIRPORT',
    train_station: 'STATION',
    bus_station: 'STATION',
    transit_station: 'STATION',
    hospital: 'HOSPITAL',
    university: 'UNIVERSITY',
    school: 'SCHOOL',
    mosque: 'MOSQUE',
    park: 'PARK',
    lodging: 'HOTEL',
    point_of_interest: 'POI',
    street_address: 'ADDRESS',
    premise: 'ADDRESS',
    route: 'ADDRESS',
  };
  for (const t of types) {
    if (map[t]) return map[t];
  }
  return types[0]?.toUpperCase() ?? null;
}

export async function autocompletePlaces(input: {
  query: string;
  latitude?: number;
  longitude?: number;
  sessionToken?: string;
}): Promise<GooglePrediction[]> {
  const params: Record<string, string> = {
    input: input.query,
    language: env.GOOGLE_PLACES_LANGUAGE,
    components: `country:${env.GOOGLE_PLACES_COUNTRY}`,
  };
  if (input.latitude != null && input.longitude != null) {
    params.location = `${input.latitude},${input.longitude}`;
    params.radius = '25000';
    params.strictbounds = 'false';
  }
  if (input.sessionToken) params.sessiontoken = input.sessionToken;

  const data = await googleGet<{
    status: string;
    error_message?: string;
    predictions?: Array<{
      place_id: string;
      description: string;
      structured_formatting?: { main_text?: string; secondary_text?: string };
    }>;
  }>(AUTOCOMPLETE_URL, params);

  if (data.status === 'ZERO_RESULTS' || data.status === 'INVALID_REQUEST') return [];
  if (data.status !== 'OK') {
    logger.warn('Google Places autocomplete failed', { status: data.status, error: data.error_message });
    throw new ValidationError('Unable to search locations. Try again.');
  }

  return (data.predictions ?? []).map((row) => ({
    placeId: row.place_id,
    name: row.structured_formatting?.main_text ?? row.description.split(',')[0] ?? row.description,
    description: row.structured_formatting?.secondary_text ?? row.description,
  }));
}

export async function getGooglePlaceDetails(
  placeId: string,
  sessionToken?: string,
): Promise<GooglePlaceDetails> {
  const params: Record<string, string> = {
    place_id: placeId,
    language: env.GOOGLE_PLACES_LANGUAGE,
    fields: 'place_id,name,formatted_address,geometry,types,address_components',
  };
  if (sessionToken) params.sessiontoken = sessionToken;

  const data = await googleGet<{
    status: string;
    error_message?: string;
    result?: {
      place_id: string;
      name?: string;
      formatted_address?: string;
      types?: string[];
      geometry?: { location?: { lat: number; lng: number } };
      address_components?: Array<{ long_name: string; types: string[] }>;
    };
  }>(DETAILS_URL, params);

  if (data.status !== 'OK' || !data.result?.geometry?.location) {
    logger.warn('Google Place details failed', { status: data.status, error: data.error_message, placeId });
    throw new ValidationError('Unable to load that location. Try again.');
  }

  const loc = data.result.geometry.location;
  const comps = data.result.address_components;
  return {
    placeId: data.result.place_id,
    name: data.result.name ?? data.result.formatted_address ?? 'Selected location',
    formattedAddress: data.result.formatted_address ?? data.result.name ?? '',
    latitude: loc.lat,
    longitude: loc.lng,
    types: data.result.types ?? [],
    city:
      component(comps, 'locality') ??
      component(comps, 'administrative_area_level_2') ??
      component(comps, 'administrative_area_level_1'),
    area:
      component(comps, 'sublocality') ??
      component(comps, 'sublocality_level_1') ??
      component(comps, 'neighborhood'),
  };
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<{
  name: string;
  formattedAddress: string;
  city: string | null;
  area: string | null;
  googlePlaceId: string | null;
  types: string[];
}> {
  const data = await googleGet<{
    status: string;
    error_message?: string;
    results?: Array<{
      place_id?: string;
      formatted_address?: string;
      types?: string[];
      address_components?: Array<{ long_name: string; types: string[] }>;
    }>;
  }>(GEOCODE_URL, {
    latlng: `${latitude},${longitude}`,
    language: env.GOOGLE_PLACES_LANGUAGE,
  });

  if (data.status === 'ZERO_RESULTS' || !data.results?.length) {
    return {
      name: 'Current location',
      formattedAddress: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
      city: null,
      area: null,
      googlePlaceId: null,
      types: [],
    };
  }
  if (data.status !== 'OK') {
    logger.warn('Google reverse geocode failed', { status: data.status, error: data.error_message });
    throw new ValidationError('Unable to resolve this location. Try again.');
  }

  const row = data.results[0];
  const comps = row.address_components;
  const area =
    component(comps, 'sublocality') ??
    component(comps, 'sublocality_level_1') ??
    component(comps, 'neighborhood');
  const route = component(comps, 'route');
  return {
    name: area ?? route ?? 'Pinned location',
    formattedAddress: row.formatted_address ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
    city: component(comps, 'locality') ?? component(comps, 'administrative_area_level_2'),
    area,
    googlePlaceId: row.place_id ?? null,
    types: row.types ?? [],
  };
}
