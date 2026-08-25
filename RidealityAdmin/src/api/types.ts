export type PlatformRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'SUB_ADMIN'
  | 'FINANCE_OFFICER'
  | 'FLEET_OWNER'
  | 'FLEET_MANAGER'
  | 'SUPPORT_AGENT';

export type AdminRole =
  | 'SUPER_ADMIN'
  | 'SUB_ADMIN'
  | 'FINANCE_USER'
  | 'PLATFORM_SUPPORT'
  | 'GLOBAL_ADMIN'
  | 'CONTINENT_ADMIN'
  | 'COUNTRY_ADMIN'
  | 'REGIONAL_ADMIN'
  | 'CITY_ADMIN'
  | 'FLEET_OWNER'
  | 'REGIONAL_FLEET'
  | 'FLEET_SUPPORT'
  | 'FLEET_FINANCE';

export type ScopeType = 'PLATFORM' | 'GLOBAL' | 'CONTINENT' | 'COUNTRY' | 'REGIONAL' | 'CITY';

export type PermissionKey =
  | 'manage_users'
  | 'manage_drivers'
  | 'manage_fleets'
  | 'manage_roles'
  | 'view_reports'
  | 'manage_documents'
  | 'manage_penalties'
  | 'manage_notes'
  | 'view_finance'
  | 'manage_wallet_adjustments'
  | 'approve_wallet_adjustments'
  | 'manage_payouts'
  | 'export_finance_reports'
  | 'ADMIN_VIEW'
  | 'ADMIN_CREATE'
  | 'ADMIN_UPDATE'
  | 'ADMIN_SUSPEND'
  | 'DRIVER_VIEW'
  | 'DRIVER_DOCUMENT_VIEW'
  | 'DRIVER_APPROVE'
  | 'DRIVER_REJECT'
  | 'DRIVER_SUSPEND'
  | 'PASSENGER_VIEW'
  | 'PASSENGER_SUSPEND'
  | 'FLEET_VIEW'
  | 'FLEET_CREATE'
  | 'FLEET_UPDATE'
  | 'FLEET_SUSPEND'
  | 'FINANCE_VIEW'
  | 'WALLET_VIEW'
  | 'PAYOUT_VIEW'
  | 'PAYOUT_APPROVE'
  | 'FINANCE_REPORT_VIEW'
  | 'TICKET_VIEW'
  | 'TICKET_ASSIGN'
  | 'TICKET_RESPOND'
  | 'TICKET_ESCALATE'
  | 'TICKET_RESOLVE'
  | 'COUNTRY_VIEW'
  | 'COUNTRY_CREATE'
  | 'CITY_VIEW'
  | 'CITY_CREATE'
  | 'CONTINENT_VIEW'
  | 'CONTINENT_CREATE'
  | 'REGIONAL_VIEW'
  | 'REGIONAL_CREATE'
  | 'FARE_MANAGE';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'PENDING';

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiPaginated<T> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResponse extends AuthTokens {
  mustResetPassword?: boolean;
  user: {
    id: string;
    email: string | null;
    roles: PlatformRole[];
    mustResetPassword?: boolean;
  };
}

export interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
}

export interface PortalUser {
  id: string;
  phone: string;
  email: string | null;
  status: UserStatus;
  activeMode: string;
  regionId?: string;
  region?: { id: string; code: string; name: string } | null;
  fullName?: string | null;
  platformRoles: PlatformRole[];
  effectivePermissions: PermissionKey[];
  isSuperAdmin: boolean;
  mustResetPassword?: boolean;
  profile?: {
    fullName?: string | null;
    avatarUrl?: string | null;
  };
  fleetMemberships?: FleetMembershipSummary[];
  adminRole?: AdminRole | null;
  scopeType?: ScopeType | null;
  continentId?: string | null;
  countryId?: string | null;
  regionalId?: string | null;
  cityId?: string | null;
  canInvite?: AdminRole[];
}

export type FleetAccessTier = 'owner' | 'regional' | 'support' | 'finance';

export interface FleetMembershipSummary {
  id: string;
  companyId: string;
  companyName: string;
  companyStatus: string;
  role: FleetAccessTier;
  rawRole: string;
  fleetRegionId: string | null;
  fleetRegionName: string | null;
}

export interface DashboardStats {
  totalUsers: number;
  totalDrivers: number;
  pendingDriverApprovals: number;
  pendingDocuments: number;
  totalFleets: number;
  activeFleetDrivers: number;
  myFleets: number;
  myFleetDrivers: number;
  pendingInvites: number;
  roleScope: {
    isSuperAdmin: boolean;
    isAdmin: boolean;
    isFleet: boolean;
    isSupport: boolean;
  };
}

export interface UserListItem {
  id: string;
  phone: string;
  email: string | null;
  status: UserStatus;
  activeMode: string;
  regionId?: string | null;
  fullName?: string | null;
  roles: PlatformRole[];
  driverStatus?: string | null;
  loyaltyTier?: string | null;
  createdAt: string;
}

export interface UserListParams extends PaginationParams {
  status?: string;
  role?: string;
  regionId?: string;
  search?: string;
  driverStatus?: string;
}

export interface AdminNote {
  id: string;
  content: string;
  authorName: string;
  createdAt: string;
}

export interface VerificationDocument {
  id: string;
  type: string;
  status: string;
  fileUrl?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserDetail {
  id: string;
  phone: string;
  email: string | null;
  status: UserStatus;
  activeMode: string;
  createdAt: string;
  temporaryPassword?: string;
  region?: { id: string; code: string; name: string } | null;
  adminRole?: AdminRole | null;
  scopeType?: ScopeType | null;
  adminAssignment?: {
    role: AdminRole;
    scopeType: ScopeType;
    continent?: { id: string; code: string; name: string } | null;
    country?: { id: string; code: string; name: string } | null;
    province?: { id: string; name: string; code: string | null } | null;
    city?: { id: string; name: string } | null;
    canInvite: AdminRole[];
    invitedBy?: {
      userId: string;
      role: AdminRole;
      fullName: string | null;
      email: string | null;
    } | null;
    team: Array<{
      userId: string;
      role: AdminRole;
      fullName: string | null;
      email: string | null;
      phone: string;
      scopeLabel: string;
      createdAt: string;
    }>;
  } | null;
  profile?: {
    fullName?: string | null;
    avatarUrl?: string | null;
  } | null;
  platformRoles: { role: PlatformRole }[];
  driverProfile?: {
    id: string;
    onboardingStatus: string;
    licenseNumber?: string | null;
    fleetCompany?: { id: string; legalName: string } | null;
    vehicle?: unknown;
  } | null;
  documents: VerificationDocument[];
  adminNotes: AdminNote[];
  wallet?: { balance: number; currency: string } | null;
  fleetMemberships?: FleetMembershipSummary[];
  abuseRecords?: unknown[];
}

export interface ResetUserPasswordResult {
  userId: string;
  email: string;
  temporaryPassword: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  actorId?: string | null;
  targetUserId?: string | null;
  metadata?: unknown;
  ipAddress?: string | null;
  createdAt: string;
}

export interface GlobalAuditLogEntry {
  id: string;
  action: string;
  details?: unknown;
  actorId?: string | null;
  actorName?: string | null;
  targetUserId?: string | null;
  targetName?: string | null;
  ipAddress?: string | null;
  createdAt: string;
}

export interface AuditLogParams extends PaginationParams {
  action?: string;
  actorId?: string;
  from?: string;
  to?: string;
}

export interface CreateUserPayload {
  phone: string;
  email: string;
  password?: string;
  fullName: string;
  regionId: string;
  platformRole: PlatformRole;
  roleIds?: string[];
  permissionIds?: string[];
}

export interface UserAccess {
  userId: string;
  platformRoles: PlatformRole[];
  roles: Array<{
    id: string;
    name: string;
    slug: string;
    assignedAt: string;
    permissions: PermissionItem[];
  }>;
  directPermissions: Array<PermissionItem & { assignedAt: string; source: 'direct' }>;
  effectivePermissions: PermissionKey[];
}

export interface PermissionItem {
  id: string;
  permission: PermissionKey;
  meaning: string;
}

export interface Role {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: PermissionItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateRolePayload {
  name: string;
  slug?: string;
  description?: string;
  permissionIds: string[];
}

export interface UpdateRolePayload {
  name?: string;
  description?: string;
  permissionIds?: string[];
}

export interface CreatePermissionPayload {
  key: PermissionKey;
  meaning: string;
}

export interface UpdatePermissionPayload {
  meaning: string;
}

export interface FleetCompany {
  id: string;
  legalName: string;
  taxId?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  status: string;
  statusReason?: string | null;
  regionId: string;
  ownerUserId: string;
  fleetTakePercent?: number;
  createdAt: string;
  updatedAt: string;
  region?: { id: string; code: string; name: string; phonePrefix?: string; currency?: string };
  owner?: { id: string; email?: string | null; profile?: { fullName?: string | null } };
  memberships?: Array<{
    id: string;
    role: string;
    user: { id: string; profile?: { fullName?: string | null } };
  }>;
}

export interface CreateFleetPayload {
  legalName: string;
  taxId?: string;
  regionId: string;
}

export type FleetCompanyStatus = 'pending' | 'active' | 'suspended';

export interface AdminUpdateFleetPayload {
  legalName?: string;
  taxId?: string | null;
  regionId?: string;
  status?: FleetCompanyStatus;
  statusReason?: string | null;
  ownerUserId?: string;
}

export interface AdminCreateFleetPayload extends CreateFleetPayload {
  ownerUserId: string;
}

export interface Region {
  id: string;
  code: string;
  name: string;
  currency: string;
  phonePrefix: string;
  continentId?: string | null;
  isActive?: boolean;
  platformCommissionPercent?: number;
  createdAt?: string;
}

export interface Continent {
  id: string;
  code: string;
  name: string;
}

export interface Province {
  id: string;
  name: string;
  code: string | null;
  countryId: string;
}

export interface GeoCity {
  id: string;
  name: string;
  provinceId: string | null;
  province?: { id: string; name: string; countryId?: string } | null;
  fleetCompany?: { id: string; legalName: string; regionId: string };
}

export type FareProduct = 'ride' | 'cargo';

export interface ServiceProduct {
  code: string;
  label: string;
  family: 'taxi' | 'cargo';
  sortOrder: number;
  fareMultiplier: number;
}

export interface FareConfig {
  id: string;
  countryId: string;
  cityId: string | null;
  product: FareProduct;
  serviceProductCode: string | null;
  productLabel: string | null;
  currency: string;
  baseFare: number;
  perKm: number;
  perMinute: number;
  minimumFare: number;
  bookingFee: number;
  cancellationFee: number;
  cargoPerKg: number;
  isCountryDefault: boolean;
  countryName: string | null;
  countryCode: string | null;
  cityName: string | null;
  provinceName: string | null;
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FareConfigPayload {
  countryId: string;
  cityId?: string | null;
  product?: FareProduct;
  serviceProductCode?: string;
  baseFare: number;
  perKm: number;
  perMinute: number;
  minimumFare: number;
  bookingFee: number;
  cancellationFee?: number;
  cargoPerKg?: number;
}

export interface AdminPlace {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  city: string | null;
  area: string | null;
  type: string | null;
  source: string;
  priority: number;
  usageCount: number;
  isActive: boolean;
  googlePlaceId: string | null;
}

export interface AdminPlacePayload {
  name: string;
  formattedAddress?: string;
  latitude: number;
  longitude: number;
  city?: string;
  area?: string;
  type?: string;
  priority?: number;
  googlePlaceId?: string;
}

export interface CreateRegionPayload {
  code: string;
  name: string;
  currency: string;
  phonePrefix: string;
  platformCommissionPercent?: number;
}

export interface UpdateRegionPayload {
  name?: string;
  currency?: string;
  phonePrefix?: string;
  isActive?: boolean;
  platformCommissionPercent?: number;
}

export interface FleetInvite {
  inviteId: string;
  token: string;
  expiresAt: string;
}

export interface FleetInviteCandidate {
  id: string;
  phone: string;
  email: string | null;
  fullName: string | null;
  status?: string;
  roles: PlatformRole[];
  driverOnboardingStatus?: string | null;
}

export interface FleetDriver {
  userId: string;
  fullName?: string | null;
  phone?: string;
  email?: string | null;
  onboardingStatus: string;
  isOnline?: boolean;
  driverType?: string;
  fleetRegionId?: string | null;
  fleetRegionName?: string | null;
  vehicle?: { make?: string | null; model?: string | null; plateNumber?: string | null } | null;
  /** Present on admin company detail responses */
  id?: string;
  user?: {
    id: string;
    phone: string;
    profile?: { fullName?: string | null };
  };
}

export interface WalletDetail {
  id: string;
  ownerType: 'user' | 'fleet' | 'platform';
  userId: string | null;
  fleetCompanyId: string | null;
  regionId: string | null;
  balance: number;
  currency: string;
  status: 'active' | 'frozen' | 'closed';
  ownerStatus?: string | null;
  ownerLabel: string;
  createdAt: string;
  updatedAt: string;
  pendingBalance?: number;
  availableBalance?: number;
  lastTransaction?: WalletLastTransaction | null;
  user?: { id: string; email: string | null; phone: string; status?: string | null; fullName: string | null } | null;
  fleetCompany?: { id: string; legalName: string; region?: { code: string; name: string } | null } | null;
}

export interface WalletLastTransaction {
  id: string;
  type: string;
  amount: number;
  currency: string;
  description: string | null;
  createdAt: string;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  currency: string;
  referenceType: string | null;
  referenceId: string | null;
  description: string | null;
  createdAt: string;
  createdBy?: { id: string; email: string | null; fullName: string | null } | null;
  wallet?: { id: string; ownerType: string; ownerLabel: string } | null;
}

export interface FinanceAdjustment {
  id: string;
  walletId: string;
  direction: 'credit' | 'debit';
  amount: number;
  currency: string;
  reason: string;
  topupMethod: string | null;
  externalRef: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  requestedById: string;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  transactionId: string | null;
  createdAt: string;
  updatedAt: string;
  wallet?: { id: string; ownerType: string; currency: string; ownerLabel: string };
  requestedBy?: { id: string; email: string | null; fullName: string | null };
  reviewedBy?: { id: string; email: string | null; fullName: string | null } | null;
}

export interface FleetDriverCredit extends FinanceAdjustment {
  driverUserId?: string | null;
  driverPhone?: string | null;
}

export interface FinanceSummary {
  totalWallets?: number;
  negativeWallets?: number;
  frozenWalletCount?: number;
  frozenBalance?: number;
  todayTransactionCount?: number;
  walletsByType: Array<{ ownerType: string; count: number; totalBalance: number }>;
  balancesByCurrency: Array<{ currency: string; count: number; totalBalance: number }>;
  volumeByCurrency: Array<{ currency: string; totalVolume: number }>;
  pendingAdjustments: number;
  pendingPayouts: number;
  last24hTransactionVolume: number;
}

export interface WalletDashboardDetail {
  wallet: WalletDetail;
  recentTransactions: WalletTransaction[];
  recentAdjustments: FinanceAdjustment[];
  recentPayouts: FinancePayout[];
  auditHistory: Array<{
    id: string;
    action: string;
    details: Record<string, unknown>;
    createdAt: string;
    actor: { id: string; email: string | null; fullName: string | null } | null;
  }>;
  notes: Array<{
    id: string;
    content: string;
    createdAt: string;
    author: { id: string; email: string | null; fullName: string | null } | null;
  }>;
}

export interface WalletNote {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; email: string | null; fullName: string | null } | null;
}

export interface FinancePayout {
  id: string;
  walletId: string;
  amount: number;
  currency: string;
  bankName: string | null;
  accountNumber: string | null;
  accountTitle: string | null;
  status: 'pending' | 'approved' | 'processing' | 'completed' | 'rejected' | 'cancelled';
  requestedById: string;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  transactionId: string | null;
  createdAt: string;
  updatedAt: string;
  wallet?: { id: string; ownerType: string; currency: string; ownerLabel: string };
  requestedBy?: { id: string; email: string | null; fullName: string | null };
  reviewedBy?: { id: string; email: string | null; fullName: string | null } | null;
}
