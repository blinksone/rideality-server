import { useState } from 'react';
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { Link as RouterLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { logout as logoutApi } from '@/api/auth.api';
import { getFleetDashboard, listFleetNotifications } from '@/api/fleet.api';
import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { logout as logoutAction } from '@/store/authSlice';
import { toggleMode } from '@/store/themeSlice';
import { FleetCompanyProvider, useFleetCompany } from '@/fleet-portal/FleetCompanyProvider';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useFleetAccessTier, useActiveFleetMembership } from '@/hooks/useFleetPortalMode';
import {
  FLEET_NAV_ITEMS,
  TIER_LABEL,
  fleetLandingSegment,
  fleetPath,
  getFleetNavSections,
} from '@/fleet-portal/fleetNavConfig';

const DRAWER_WIDTH = 232;

function getBreadcrumb(segment: string) {
  const item = FLEET_NAV_ITEMS.find((n) => n.segment === segment);
  return item?.label ?? 'Dashboard';
}

function FleetPortalShell() {
  const { companyId: routeCompanyId } = useParams();
  const { user } = useAuth();
  const { company, companies, companyId } = useFleetCompany();
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const themeMode = useAppSelector((s) => s.theme.mode);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const activeId = routeCompanyId ?? companyId ?? '';
  const tier = useFleetAccessTier(activeId || undefined);
  const membership = useActiveFleetMembership(activeId || undefined);
  const navSections = getFleetNavSections(tier);
  const pathParts = location.pathname.split('/').filter(Boolean);
  const pathSegment = pathParts[pathParts.length - 1] ?? 'dashboard';
  const isCityProfile = pathParts.includes('regions') && pathSegment !== 'regions';
  const pageTitle = isCityProfile ? 'City profile' : getBreadcrumb(pathSegment);
  const cityName = membership?.fleetRegionName;
  const tierLabel = tier
    ? cityName && tier !== 'owner'
      ? `${TIER_LABEL[tier]} · ${cityName}`
      : TIER_LABEL[tier]
    : 'Fleet portal';

  const { data: dash } = useQuery({
    queryKey: ['fleet-dashboard', activeId],
    queryFn: () => getFleetDashboard(activeId),
    enabled: Boolean(activeId),
  });

  const { data: notifMeta } = useQuery({
    queryKey: ['fleet-notifications-meta', activeId],
    queryFn: async () => {
      const res = await listFleetNotifications(activeId, { page: 1, limit: 1, unreadOnly: true });
      return res.data;
    },
    enabled: Boolean(activeId),
  });

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

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.75,
          py: 1.5,
          minHeight: 56,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Box
          sx={{
            width: 30,
            height: 30,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            background: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)',
          }}
        >
          <AutoAwesomeIcon sx={{ fontSize: 16 }} />
        </Box>
        <Box>
          <Typography
            sx={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
            }}
          >
            Rideality
          </Typography>
          <Typography
            sx={{
              fontSize: 9,
              fontWeight: 600,
              color: 'primary.main',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {tierLabel}
          </Typography>
        </Box>
      </Box>

      <List sx={{ flex: 1, px: 1, py: 1, overflow: 'auto' }} disablePadding>
        {navSections.map((section) => (
          <Box key={section.title} sx={{ mb: 1.25 }}>
            <Typography
              sx={{
                px: 1.25,
                pt: 0.75,
                pb: 0.5,
                fontSize: 9,
                fontWeight: 700,
                color: 'text.secondary',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              {section.title}
            </Typography>
            {section.items.map((item) => {
              const path = activeId ? fleetPath(activeId, item.segment) : '#';
              const selected = location.pathname.startsWith(path);
              let badge = 0;
              if (item.badge === 'pendingInvites') badge = dash?.pendingInvites ?? 0;
              if (item.badge === 'pendingApprovals') badge = dash?.pendingApprovals ?? 0;
              if (item.badge === 'unreadNotifications') badge = notifMeta?.unreadCount ?? 0;
              const Icon = item.icon;
              return (
                <ListItemButton
                  key={item.segment}
                  component={RouterLink}
                  to={path}
                  selected={selected}
                  disabled={!activeId}
                  onClick={() => setMobileOpen(false)}
                  sx={{
                    py: 0.6,
                    px: 1.25,
                    minHeight: 34,
                    borderRadius: 1.5,
                    mb: 0.25,
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 28, color: selected ? 'primary.main' : 'text.secondary' }}>
                    {badge > 0 ? (
                      <Badge badgeContent={badge} color="warning" sx={{ '& .MuiBadge-badge': { fontSize: 9, height: 14, minWidth: 14 } }}>
                        <Icon sx={{ fontSize: 16 }} />
                      </Badge>
                    ) : (
                      <Icon sx={{ fontSize: 16 }} />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    slotProps={{ primary: { sx: { fontSize: 12.5, fontWeight: selected ? 600 : 500, lineHeight: 1.2 } } }}
                  />
                </ListItemButton>
              );
            })}
          </Box>
        ))}
      </List>

      <Box sx={{ px: 1.5, py: 1.25, borderTop: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ position: 'relative' }}>
            <Avatar
              sx={{
                width: 32,
                height: 32,
                borderRadius: 2,
                bgcolor: 'primary.main',
                fontFamily: '"Space Grotesk", sans-serif',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {(user?.fullName ?? user?.email ?? 'F').slice(0, 1).toUpperCase()}
            </Avatar>
            <Box
              sx={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 10,
                height: 10,
                bgcolor: 'success.main',
                border: '2px solid',
                borderColor: 'background.paper',
                borderRadius: '50%',
              }}
            />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 11 }} noWrap>
              {user?.fullName ?? tierLabel}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ fontFamily: 'monospace', fontSize: 9 }}>
              {user?.email}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="fixed" elevation={0} color="inherit" sx={{ zIndex: (t) => t.zIndex.drawer + 1, bgcolor: 'background.paper' }}>
        <Toolbar sx={{ minHeight: { xs: 56, md: 56 }, gap: 1 }}>
          <IconButton edge="start" sx={{ display: { md: 'none' } }} onClick={() => setMobileOpen(true)}>
            <MenuIcon />
          </IconButton>

          <Box sx={{ flexGrow: { xs: 1, md: 0 }, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
              Fleet / {pageTitle}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, fontFamily: '"Space Grotesk", sans-serif', lineHeight: 1.2 }} noWrap>
              {pageTitle}
            </Typography>
          </Box>

          {companies.length > 0 && (
            <Select
              size="small"
              value={activeId || ''}
              onChange={(e) => navigate(fleetPath(e.target.value, fleetLandingSegment(tier)))}
              sx={{ minWidth: 200, ml: { md: 3 } }}
              displayEmpty
            >
              {companies.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.legalName}
                </MenuItem>
              ))}
            </Select>
          )}

          <Box sx={{ flexGrow: 1 }} />

          <Box sx={{ display: { xs: 'none', lg: 'flex' }, flexDirection: 'column', alignItems: 'flex-end', pr: 1, mr: 1, borderRight: 1, borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main' }} />
              <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600, fontSize: 11 }}>
                System Online
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: 10 }}>
              {company?.legalName ?? 'Fleet portal'}
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
            {(user?.fullName ?? user?.email ?? 'F').slice(0, 1).toUpperCase()}
          </Avatar>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}
      >
        {drawer}
      </Drawer>
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
        open
      >
        {drawer}
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          mt: '56px',
          minHeight: 'calc(100vh - 56px)',
        }}
      >
        <Box sx={{ p: { xs: 2, md: 2.5 }, maxWidth: 1280, mx: 'auto', width: '100%' }}>
          <Outlet />
        </Box>
      </Box>

      <ConfirmDialog
        open={logoutOpen}
        title="Log out?"
        message="You will be signed out of the fleet portal. You can sign in again with your email and password."
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

export default function FleetPortalLayout() {
  const { companyId } = useParams();

  return (
    <FleetCompanyProvider companyId={companyId}>
      <FleetPortalShell />
    </FleetCompanyProvider>
  );
}
