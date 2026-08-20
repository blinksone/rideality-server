import type { PermissionKey } from '@/api/types';
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
}

export interface NavGroup {
  id: string;
  label?: string;
  items: NavItem[];
}

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
        permission: 'manage_users',
      },
      {
        label: 'Roles',
        path: '/roles',
        icon: SecurityIcon,
        permission: 'manage_roles',
      },
      {
        label: 'Permissions',
        path: '/permissions',
        icon: KeyIcon,
        permission: 'manage_roles',
      },
      {
        label: 'Audit log',
        path: '/audit-logs',
        icon: HistoryIcon,
        permission: 'view_reports',
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
      },
      {
        label: 'Wallets',
        path: '/finance/wallets',
        icon: AccountBalanceIcon,
        permission: 'view_finance',
      },
      {
        label: 'Adjustments',
        path: '/finance/adjustments',
        icon: AccountBalanceIcon,
        permission: 'view_finance',
      },
      {
        label: 'Payouts',
        path: '/finance/payouts',
        icon: AccountBalanceIcon,
        permission: 'view_finance',
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
        permission: 'manage_fleets',
      },
      {
        label: 'Support',
        path: '/support',
        icon: SupportAgentIcon,
        permission: ['manage_notes', 'manage_users'],
        anyPermission: true,
      },
    ],
  },
];

/** @deprecated Use NAV_GROUPS */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

export function getNavLabelForPath(pathname: string): string {
  let best: NavItem | null = null;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const matches = item.path === '/' ? pathname === '/' : pathname.startsWith(item.path);
      if (matches && (!best || item.path.length > best.path.length)) {
        best = item;
      }
    }
  }
  return best?.label ?? 'Dashboard';
}
