import type { SvgIconComponent } from '@mui/icons-material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import BusinessIcon from '@mui/icons-material/Business';
import PeopleIcon from '@mui/icons-material/People';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import MailOutlineOutlinedIcon from '@mui/icons-material/MailOutlineOutlined';
import RouteIcon from '@mui/icons-material/Route';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AssessmentIcon from '@mui/icons-material/Assessment';
import NotificationsIcon from '@mui/icons-material/Notifications';
import GroupsIcon from '@mui/icons-material/Groups';
import FolderIcon from '@mui/icons-material/Folder';
import SettingsIcon from '@mui/icons-material/Settings';
import PaidIcon from '@mui/icons-material/Paid';
import LocationCityIcon from '@mui/icons-material/LocationCity';
import type { FleetAccessTier } from '@/api/types';

export interface FleetNavItem {
  label: string;
  segment: string;
  icon: SvgIconComponent;
  badge?: 'pendingInvites' | 'pendingApprovals' | 'unreadNotifications';
  /** If set, only these membership tiers see the item. */
  visibleTo?: FleetAccessTier[];
}

export interface FleetNavSection {
  title: string;
  items: FleetNavItem[];
}

const OWNER: FleetAccessTier[] = ['owner'];
const CITY_OPS: FleetAccessTier[] = ['regional', 'support'];
const ALL: FleetAccessTier[] = ['owner', 'regional', 'support'];

export const FLEET_NAV_SECTIONS: FleetNavSection[] = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', segment: 'dashboard', icon: DashboardIcon, visibleTo: ALL }],
  },
  {
    title: 'Region operations',
    items: [
      { label: 'Regions', segment: 'regions', icon: LocationCityIcon, visibleTo: OWNER },
      { label: 'Drivers', segment: 'drivers', icon: PeopleIcon, visibleTo: CITY_OPS },
      { label: 'Vehicles', segment: 'vehicles', icon: DirectionsCarIcon, visibleTo: CITY_OPS },
      { label: 'Invitations', segment: 'invitations', icon: MailOutlineOutlinedIcon, badge: 'pendingInvites', visibleTo: CITY_OPS },
      { label: 'Documents', segment: 'documents', icon: FolderIcon, badge: 'pendingApprovals', visibleTo: CITY_OPS },
      { label: 'Trips', segment: 'trips', icon: RouteIcon, visibleTo: CITY_OPS },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Wallet', segment: 'wallet', icon: AccountBalanceWalletIcon, visibleTo: OWNER },
      { label: 'Transactions', segment: 'transactions', icon: ReceiptLongIcon, visibleTo: OWNER },
      { label: 'Earnings', segment: 'earnings', icon: TrendingUpIcon, visibleTo: OWNER },
      { label: 'Payouts', segment: 'payouts', icon: PaidIcon, visibleTo: OWNER },
    ],
  },
  {
    title: 'Company',
    items: [
      { label: 'Fleet company', segment: 'companies', icon: BusinessIcon, visibleTo: OWNER },
      { label: 'Team Members', segment: 'team', icon: GroupsIcon, visibleTo: OWNER },
      { label: 'Reports', segment: 'reports', icon: AssessmentIcon, visibleTo: OWNER },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Notifications', segment: 'notifications', icon: NotificationsIcon, badge: 'unreadNotifications', visibleTo: ALL },
      { label: 'Settings', segment: 'settings', icon: SettingsIcon, visibleTo: ALL },
    ],
  },
];

export function getFleetNavSections(tier: FleetAccessTier | null): FleetNavSection[] {
  return FLEET_NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      const allowed = item.visibleTo ?? ALL;
      if (!tier) return allowed.includes('regional') || allowed.includes('support');
      return allowed.includes(tier);
    }),
  })).filter((section) => section.items.length > 0);
}

export const TIER_LABEL: Record<FleetAccessTier, string> = {
  owner: 'Fleet Owner',
  regional: 'Regional Fleet',
  support: 'Fleet Support',
};

export function fleetLandingSegment(tier: FleetAccessTier | null) {
  return tier === 'owner' ? 'regions' : 'drivers';
}

/** Flat list for breadcrumb / lookups */
export const FLEET_NAV_ITEMS: FleetNavItem[] = FLEET_NAV_SECTIONS.flatMap((s) => s.items);

export function fleetPath(companyId: string, segment: string) {
  return `/portal/${companyId}/${segment}`;
}
