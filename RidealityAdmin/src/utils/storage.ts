const ACCESS_TOKEN_KEY = 'rideality_access_token';
const REFRESH_TOKEN_KEY = 'rideality_refresh_token';
const FLEET_IDS_KEY = 'rideality_fleet_company_ids';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function getStoredFleetIds(): string[] {
  try {
    const raw = localStorage.getItem(FLEET_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function addStoredFleetId(id: string): void {
  const ids = getStoredFleetIds();
  if (!ids.includes(id)) {
    localStorage.setItem(FLEET_IDS_KEY, JSON.stringify([id, ...ids]));
  }
}

export function removeStoredFleetId(id: string): void {
  const ids = getStoredFleetIds().filter((x) => x !== id);
  localStorage.setItem(FLEET_IDS_KEY, JSON.stringify(ids));
}
