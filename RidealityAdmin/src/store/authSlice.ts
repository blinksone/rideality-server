import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { PermissionKey, PlatformRole, PortalUser } from '@/api/types';
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '@/utils/storage';

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: PortalUser | null;
  permissions: PermissionKey[];
  platformRoles: PlatformRole[];
  isSuperAdmin: boolean;
  initialized: boolean;
}

const initialState: AuthState = {
  accessToken: getAccessToken(),
  refreshToken: getRefreshToken(),
  user: null,
  permissions: [],
  platformRoles: [],
  isSuperAdmin: false,
  initialized: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials(
      state,
      action: PayloadAction<{
        accessToken: string;
        refreshToken: string;
        user?: PortalUser | null;
      }>,
    ) {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      setTokens(action.payload.accessToken, action.payload.refreshToken);
      if (action.payload.user) {
        state.user = action.payload.user;
        state.permissions = action.payload.user.effectivePermissions;
        state.platformRoles = action.payload.user.platformRoles;
        state.isSuperAdmin = action.payload.user.isSuperAdmin;
      }
    },
    setUser(state, action: PayloadAction<PortalUser>) {
      state.user = action.payload;
      state.permissions = action.payload.effectivePermissions;
      state.platformRoles = action.payload.platformRoles;
      state.isSuperAdmin = action.payload.isSuperAdmin;
    },
    setInitialized(state, action: PayloadAction<boolean>) {
      state.initialized = action.payload;
    },
    logout(state) {
      state.accessToken = null;
      state.refreshToken = null;
      state.user = null;
      state.permissions = [];
      state.platformRoles = [];
      state.isSuperAdmin = false;
      clearTokens();
    },
  },
});

export const { setCredentials, setUser, setInitialized, logout } = authSlice.actions;
export default authSlice.reducer;
