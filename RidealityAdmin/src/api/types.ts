export type PlatformRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'SUB_ADMIN'
  | 'FINANCE_OFFICER'
  | 'FLEET_OWNER'
  | 'FLEET_MANAGER'
  | 'SUPPORT_AGENT';

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
  | 'export_finance_reports';

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
}

export type FleetAccessTier = 'owner' | 'regional' | 'support';

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
  status: string;
  statusReason?: string | null;
  regionId: string;
  ownerUserId: string;
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
  isActive?: boolean;
  createdAt?: string;
}

export interface CreateRegionPayload {
  code: string;
  name: string;
  currency: string;
  phonePrefix: string;
}

export interface UpdateRegionPayload {
  name?: string;
  currency?: string;
  phonePrefix?: string;
  isActive?: boolean;
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
