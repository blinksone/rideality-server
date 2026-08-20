import {
  AppBar,
  Avatar,
  Box,
  Collapse,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LogoutIcon from '@mui/icons-material/Logout';
import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { logout as logoutApi } from '@/api/auth.api';
import type { AdminRole, PermissionKey } from '@/api/types';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useAdminScope } from '@/hooks/useAdminScope';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { logout as logoutAction } from '@/store/authSlice';
import { toggleMode } from '@/store/themeSlice';
import {
  NAV_GROUPS,
  getNavLabelForPath,
  navGroupLabel,
  navItemLabel,
  type NavGroup,
  type NavItem,
} from '@/routes/navConfig';
import { hasPermission } from '@/utils/permissions';
import { formatAdminRole } from '@/utils/format';
import ConfirmDialog from '@/components/ConfirmDialog';

const DRAWER_WIDTH = 256;
const MINI_DRAWER_WIDTH = 72;
const SIDEBAR_COLLAPSED_KEY = 'rideality_sidebar_collapsed';
const NAV_GROUPS_COLLAPSED_KEY = 'rideality_nav_groups_collapsed';

function loadSidebarCollapsed(): boolean {
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
}

function loadCollapsedGroups(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(NAV_GROUPS_COLLAPSED_KEY);
    return stored ? (JSON.parse(stored) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function isNavItemActive(
  item: NavItem,
  pathname: string,
  siblings: NavItem[] = [],
): boolean {
  if (item.path === '/') return pathname === '/';
  if (!pathname.startsWith(item.path)) return false;
  // RID-8 — longest matching sibling wins (e.g. /finance/wallets vs /finance)
  const moreSpecific = siblings.some(
    (other) =>
      other.path !== item.path &&
      other.path.length > item.path.length &&
      pathname.startsWith(other.path) &&
      (other.path.startsWith(item.path + '/') || item.path === '/finance'),
  );
  if (moreSpecific) return false;
  // Parent /finance should not stay active when a child path is selected
  if (item.path === '/finance' && pathname !== '/finance' && pathname.startsWith('/finance/')) {
    return false;
  }
  return true;
}

function filterVisibleNavGroups(
  groups: NavGroup[],
  permissions: PermissionKey[],
  isSuperAdmin: boolean,
  adminRole: AdminRole | null,
): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      label: navGroupLabel(group, adminRole),
      items: group.items.filter((item) => {
        if (item.superAdminOnly && !isSuperAdmin) return false;
        if (item.visibleTo?.length && !isSuperAdmin) {
          if (!adminRole || !item.visibleTo.includes(adminRole)) return false;
        }
        if (!item.permission) return true;
        const perms = Array.isArray(item.permission) ? item.permission : [item.permission];
        if (item.anyPermission) {
          return perms.some((p) => hasPermission(permissions, p, isSuperAdmin));
        }
        return hasPermission(permissions, item.permission, isSuperAdmin);
      }),
    }))
    .filter((group) => group.items.length > 0);
}

export default function AdminLayout() {
  const themeMode = useAppSelector((s) => s.theme.mode);
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const { permissions, isSuperAdmin } = usePermissions();
  const { role } = useAdminScope();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useMediaQuery('(max-width:900px)');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(loadCollapsedGroups);

  const drawerWidth = sidebarCollapsed ? MINI_DRAWER_WIDTH : DRAWER_WIDTH;
  const pageTitle = getNavLabelForPath(location.pathname, role);

  const visibleNavGroups = useMemo(
    () => filterVisibleNavGroups(NAV_GROUPS, permissions, isSuperAdmin, role),
    [permissions, isSuperAdmin, role],
  );

  useEffect(() => {
    setCollapsedGroups((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const group of visibleNavGroups) {
        if (!group.label) continue;
        const hasActiveItem = group.items.some((item) =>
          isNavItemActive(item, location.pathname, group.items),
        );
        if (hasActiveItem && next[group.id]) {
          next[group.id] = false;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [location.pathname, visibleNavGroups]);

  useEffect(() => {
    localStorage.setItem(NAV_GROUPS_COLLAPSED_KEY, JSON.stringify(collapsedGroups));
  }, [collapsedGroups]);

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const refreshToken = localStorage.getItem('rideality_refresh_token') ?? undefined;
      try {
        await logoutApi(refreshToken);
      } catch {
        // proceed with local logout
      }
    },
    onSettled: () => {
      dispatch(logoutAction());
      queryClient.clear();
      navigate('/login');
    },
  });

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  };

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const selected = isNavItemActive(item, location.pathname, visibleNavGroups.flatMap((g) => g.items));
    const label = navItemLabel(item, role);
    const button = (
      <ListItemButton
        key={item.path}
        component={RouterLink}
        to={item.path}
        selected={selected}
        dense
        onClick={() => setMobileOpen(false)}
        sx={{
          borderRadius: 2,
          mb: 0.25,
          minHeight: 40,
          px: sidebarCollapsed ? 1.25 : 1.75,
          py: 1.25,
          justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
        }}
      >
        <ListItemIcon
          sx={{
            minWidth: sidebarCollapsed ? 0 : 36,
            justifyContent: 'center',
            color: selected ? 'primary.main' : 'text.secondary',
          }}
        >
          <Icon sx={{ fontSize: 18 }} />
        </ListItemIcon>
        {!sidebarCollapsed && (
          <ListItemText
            primary={label}
            slotProps={{ primary: { sx: { fontSize: 13, fontWeight: selected ? 600 : 500 }, noWrap: true } }}
          />
        )}
      </ListItemButton>
    );

    if (sidebarCollapsed) {
      return (
        <Tooltip key={item.path} title={label} placement="right">
          {button}
        </Tooltip>
      );
    }

    return button;
  };

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: sidebarCollapsed ? 0 : 1.25,
          px: sidebarCollapsed ? 1 : 2.5,
          py: 2.5,
          minHeight: 73,
          borderBottom: 1,
          borderColor: 'divider',
          justifyContent: sidebarCollapsed ? 'center' : 'space-between',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              flexShrink: 0,
              background: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)',
            }}
          >
            <AutoAwesomeIcon sx={{ fontSize: 20 }} />
          </Box>
          {!sidebarCollapsed && (
            <Box sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  fontFamily: '"Space Grotesk", sans-serif',
                  fontWeight: 700,
                  fontSize: 18,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.1,
                }}
                noWrap
              >
                Rideality
              </Typography>
              <Typography
                sx={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'primary.main',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  mt: -0.25,
                }}
              >
                {role ? formatAdminRole(role) : 'Platform Admin'}
              </Typography>
            </Box>
          )}
        </Box>
        {!isMobile && !sidebarCollapsed && (
          <IconButton size="small" onClick={toggleSidebar} aria-label="Collapse sidebar">
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
      {!isMobile && sidebarCollapsed && (
        <Box sx={{ display: 'flex', justifyContent: 'center', pb: 0.5 }}>
          <IconButton size="small" onClick={toggleSidebar} aria-label="Expand sidebar">
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Box>
      )}
      <List dense disablePadding sx={{ flex: 1, px: 1.5, py: 2, overflowY: 'auto' }}>
        {visibleNavGroups.map((group) => {
          const isGroupCollapsed = Boolean(collapsedGroups[group.id]);

          if (!group.label || sidebarCollapsed) {
            return (
              <Box key={group.id} sx={{ mb: 0.5 }}>
                {group.items.map((item) => renderNavItem(item))}
              </Box>
            );
          }

          return (
            <Box key={group.id} sx={{ mb: 0.5 }}>
              <ListSubheader
                component="div"
                disableSticky
                onClick={() => toggleGroup(group.id)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  lineHeight: 1.2,
                  py: 0.75,
                  px: 1,
                  bgcolor: 'transparent',
                  cursor: 'pointer',
                  userSelect: 'none',
                  '&:hover': { bgcolor: 'action.hover', borderRadius: 1 },
                }}
              >
                <Typography
                  sx={{
                    px: 1.5,
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                  }}
                >
                  {group.label}
                </Typography>
                {isGroupCollapsed ? (
                  <ExpandMoreIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                ) : (
                  <ExpandLessIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                )}
              </ListSubheader>
              <Collapse in={!isGroupCollapsed}>
                <Box sx={{ pl: 0.5 }}>{group.items.map((item) => renderNavItem(item))}</Box>
              </Collapse>
            </Box>
          );
        })}
      </List>
      <Box sx={{ p: sidebarCollapsed ? 1 : 2, borderTop: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
        {sidebarCollapsed ? (
          <Tooltip
            title={`${user?.profile?.fullName ?? user?.email ?? 'Admin'} · ${formatAdminRole(user?.adminRole ?? user?.platformRoles?.[0] ?? 'Admin')}`}
            placement="right"
          >
            <Avatar sx={{ mx: 'auto', width: 40, height: 40, borderRadius: 3, bgcolor: 'primary.main', fontSize: 14 }}>
              {(user?.profile?.fullName ?? user?.email ?? 'A').charAt(0).toUpperCase()}
            </Avatar>
          </Tooltip>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ position: 'relative' }}>
              <Avatar
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 3,
                  bgcolor: 'primary.main',
                  fontFamily: '"Space Grotesk", sans-serif',
                  fontWeight: 600,
                }}
              >
                {(user?.profile?.fullName ?? user?.email ?? 'A').charAt(0).toUpperCase()}
              </Avatar>
              <Box
                sx={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: 12,
                  height: 12,
                  bgcolor: 'success.main',
                  border: '2px solid',
                  borderColor: 'background.paper',
                  borderRadius: '50%',
                }}
              />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 12 }} noWrap>
                {user?.profile?.fullName ?? user?.email ?? 'Admin'}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ fontFamily: 'monospace', fontSize: 10 }}>
                {formatAdminRole(user?.adminRole ?? user?.platformRoles?.[0] ?? 'Platform')}
              </Typography>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          zIndex: (t) => t.zIndex.drawer + 1,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          bgcolor: 'background.paper',
          transition: (theme) =>
            theme.transitions.create(['width', 'margin'], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.leavingScreen,
            }),
        }}
      >
        <Toolbar sx={{ minHeight: 73, gap: 1 }}>
          {isMobile && (
            <IconButton edge="start" onClick={() => setMobileOpen(true)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
          )}
          <Box sx={{ flexGrow: { xs: 1, md: 0 }, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
              Admin / {pageTitle}
            </Typography>
            <Typography
              variant="h6"
              sx={{ fontWeight: 700, fontFamily: '"Space Grotesk", sans-serif', lineHeight: 1.2 }}
              noWrap
            >
              {pageTitle}
            </Typography>
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <Box
            sx={{
              display: { xs: 'none', lg: 'flex' },
              flexDirection: 'column',
              alignItems: 'flex-end',
              pr: 1,
              mr: 1,
              borderRight: 1,
              borderColor: 'divider',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main' }} />
              <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600, fontSize: 11 }}>
                System Online
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: 10 }}>
              {formatAdminRole(user?.adminRole ?? user?.platformRoles?.[0] ?? 'Admin')}
            </Typography>
          </Box>
          <Tooltip title="Toggle theme">
            <IconButton
              onClick={() => dispatch(toggleMode())}
              size="small"
              sx={{ border: 1, borderColor: 'divider', borderRadius: 3 }}
            >
              {themeMode === 'dark' ? <Brightness7Icon fontSize="small" /> : <Brightness4Icon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Logout">
            <IconButton
              onClick={() => setLogoutOpen(true)}
              disabled={logoutMutation.isPending}
              size="small"
              sx={{ border: 1, borderColor: 'divider', borderRadius: 3, color: 'error.main' }}
            >
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: 13, ml: 0.5 }}>
            {(user?.profile?.fullName ?? user?.email ?? 'A').charAt(0).toUpperCase()}
          </Avatar>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{
          width: { md: drawerWidth },
          flexShrink: { md: 0 },
          transition: (theme) =>
            theme.transitions.create('width', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.leavingScreen,
            }),
        }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              boxSizing: 'border-box',
              overflowX: 'hidden',
              transition: (theme) =>
                theme.transitions.create('width', {
                  easing: theme.transitions.easing.sharp,
                  duration: theme.transitions.duration.leavingScreen,
                }),
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          mt: '73px',
          minHeight: 'calc(100vh - 73px)',
          transition: (theme) =>
            theme.transitions.create(['width', 'margin'], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.leavingScreen,
            }),
        }}
      >
        <Box sx={{ p: 3, maxWidth: 1280, mx: 'auto', width: '100%' }}>
          <Outlet />
        </Box>
      </Box>

      <ConfirmDialog
        open={logoutOpen}
        title="Log out?"
        message="You will be signed out of the admin portal. You can sign in again with your email and password."
        confirmLabel="Log out"
        confirmColor="error"
        loading={logoutMutation.isPending}
        onConfirm={() => logoutMutation.mutate()}
        onCancel={() => {
          if (!logoutMutation.isPending) setLogoutOpen(false);
        }}
      />
    </Box>
  );
}
