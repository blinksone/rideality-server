import type { AdminRole, PermissionKey } from '@/api/types';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import SecurityIcon from '@mui/icons-material/Security';
import KeyIcon from '@mui/icons-material/Key';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PublicIcon from '@mui/icons-material/Public';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import HistoryIcon from '@mui/icons-material/History';
import type { SvgIconComponent } from '@mui/icons-material';

export interface NavItem {
  label: string;
  path: string;
  icon: SvgIconComponent;
  permission?: PermissionKey | PermissionKey[];
  anyPermission?: boolean;
  superAdminOnly?: boolean;
  /** If set, only these admin roles see the item (Super Admin still sees all). */
  visibleTo?: AdminRole[];
}

export interface NavGroup {
  id: string;
  label?: string;
  items: NavItem[];
}

const GEO: AdminRole[] = [
  'GLOBAL_ADMIN',
  'CONTINENT_ADMIN',
  'COUNTRY_ADMIN',
  'REGIONAL_ADMIN',
  'CITY_ADMIN',
];
const FLEET_LEAD: AdminRole[] = ['FLEET_OWNER', 'REGIONAL_FLEET'];
const FLEET_ALL: AdminRole[] = ['FLEET_OWNER', 'REGIONAL_FLEET', 'FLEET_SUPPORT', 'FLEET_FINANCE'];
const PLATFORM_USERS: AdminRole[] = ['SUB_ADMIN', ...GEO, ...FLEET_LEAD];
const FLEET_COMPANIES: AdminRole[] = ['SUB_ADMIN', ...GEO, 'FLEET_OWNER', 'REGIONAL_FLEET'];
const FINANCE_VIEW: AdminRole[] = [
  'FINANCE_USER',
  'FLEET_OWNER',
  'FLEET_FINANCE',
  'GLOBAL_ADMIN',
  'CONTINENT_ADMIN',
  'COUNTRY_ADMIN',
];
const FINANCE_OPS: AdminRole[] = ['FINANCE_USER'];
const SUPPORT: AdminRole[] = [
  'SUB_ADMIN',
  'PLATFORM_SUPPORT',
  ...GEO,
];
const AUDIT: AdminRole[] = ['SUB_ADMIN', 'GLOBAL_ADMIN', 'CONTINENT_ADMIN', 'COUNTRY_ADMIN'];

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    items: [{ label: 'Dashboard', path: '/', icon: DashboardIcon }],
  },
  {
    id: 'platform',
    label: 'Platform',
    items: [
      {
        label: 'Regions',
        path: '/regions',
        icon: PublicIcon,
        superAdminOnly: true,
      },
    ],
  },
  {
    id: 'access',
    label: 'Access',
    items: [
      {
        label: 'Platform Users',
        path: '/users',
        icon: PeopleIcon,
        permission: ['manage_users', 'ADMIN_VIEW', 'ADMIN_CREATE'],
        anyPermission: true,
        visibleTo: PLATFORM_USERS,
      },
      {
        label: 'Roles',
        path: '/roles',
        icon: SecurityIcon,
        permission: 'manage_roles',
        superAdminOnly: true,
      },
      {
        label: 'Permissions',
        path: '/permissions',
        icon: KeyIcon,
        permission: 'manage_roles',
        superAdminOnly: true,
      },
      {
        label: 'Audit log',
        path: '/audit-logs',
        icon: HistoryIcon,
        permission: 'view_reports',
        visibleTo: AUDIT,
      },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    items: [
      {
        label: 'Overview',
        path: '/finance',
        icon: AccountBalanceIcon,
        permission: 'view_finance',
        visibleTo: FINANCE_VIEW,
      },
      {
        label: 'Wallets',
        path: '/finance/wallets',
        icon: AccountBalanceIcon,
        permission: 'view_finance',
        visibleTo: FINANCE_VIEW,
      },
      {
        label: 'Adjustments',
        path: '/finance/adjustments',
        icon: AccountBalanceIcon,
        permission: 'view_finance',
        visibleTo: FINANCE_OPS,
      },
      {
        label: 'Payouts',
        path: '/finance/payouts',
        icon: AccountBalanceIcon,
        permission: 'view_finance',
        visibleTo: FINANCE_VIEW,
      },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      {
        label: 'Fleet',
        path: '/fleet',
        icon: LocalShippingIcon,
        permission: ['manage_fleets', 'FLEET_VIEW'],
        anyPermission: true,
        visibleTo: FLEET_COMPANIES,
      },
      {
        label: 'Support',
        path: '/support',
        icon: SupportAgentIcon,
        permission: ['manage_notes', 'manage_users', 'TICKET_VIEW'],
        anyPermission: true,
        visibleTo: SUPPORT,
      },
    ],
  },
];

/** @deprecated Use NAV_GROUPS */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

const FLEET_TEAM_ROLES: AdminRole[] = FLEET_ALL;

export function isFleetTeamRole(role?: AdminRole | null) {
  return Boolean(role && FLEET_TEAM_ROLES.includes(role));
}

export function navItemLabel(item: NavItem, role?: AdminRole | null): string {
  if (item.path === '/users' && isFleetTeamRole(role)) return 'Fleet Team';
  if (item.path === '/fleet' && isFleetTeamRole(role)) return 'My Fleet';
  return item.label;
}

export function navGroupLabel(group: NavGroup, role?: AdminRole | null): string | undefined {
  if (!group.label) return group.label;
  if (isFleetTeamRole(role) && group.id === 'access') return 'Team';
  if (isFleetTeamRole(role) && group.id === 'operations') return 'Fleet';
  return group.label;
}

export function getNavLabelForPath(pathname: string, role?: AdminRole | null): string {
  let best: NavItem | null = null;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const matches = item.path === '/' ? pathname === '/' : pathname.startsWith(item.path);
      if (matches && (!best || item.path.length > best.path.length)) {
        best = item;
      }
    }
  }
  return best ? navItemLabel(best, role) : 'Dashboard';
}
