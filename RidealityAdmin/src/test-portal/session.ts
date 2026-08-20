const ACCESS = 'rideality_test_access';
const REFRESH = 'rideality_test_refresh';
const USER = 'rideality_test_user';

export interface TestSessionUser {
  id: string;
  phone: string;
  email?: string | null;
  status: string;
  activeMode: string;
  regionId: string;
  isNewUser?: boolean;
}

export function getTestAccessToken() {
  return sessionStorage.getItem(ACCESS);
}

export function getTestRefreshToken() {
  return sessionStorage.getItem(REFRESH);
}

export function getTestUser(): TestSessionUser | null {
  const raw = sessionStorage.getItem(USER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TestSessionUser;
  } catch {
    return null;
  }
}

export function setTestSession(
  accessToken: string,
  refreshToken: string,
  user: TestSessionUser,
) {
  sessionStorage.setItem(ACCESS, accessToken);
  sessionStorage.setItem(REFRESH, refreshToken);
  sessionStorage.setItem(USER, JSON.stringify(user));
}

export function clearTestSession() {
  sessionStorage.removeItem(ACCESS);
  sessionStorage.removeItem(REFRESH);
  sessionStorage.removeItem(USER);
}

export function updateTestUser(patch: Partial<TestSessionUser>) {
  const current = getTestUser();
  if (!current) return;
  sessionStorage.setItem(USER, JSON.stringify({ ...current, ...patch }));
}
