import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Button, Chip, IconButton, Menu, MenuItem } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PeopleIcon from '@mui/icons-material/People';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import WifiIcon from '@mui/icons-material/Wifi';
import { useParams, useSearchParams } from 'react-router-dom';
import { listFleetDrivers, removeFleetDriver, updateFleetDriver } from '@/api/fleet.api';
import { getApiErrorMessage } from '@/api/client';
import ConfirmDialog from '@/components/ConfirmDialog';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import FleetContentCard from '@/fleet-portal/components/FleetContentCard';
import FleetMetricCard from '@/fleet-portal/components/FleetMetricCard';
import FleetMetricRow, { FleetMetricCell } from '@/fleet-portal/components/FleetMetricRow';
import FleetPageHero from '@/fleet-portal/components/FleetPageHero';
import FleetDriverDetailDialog from '@/fleet-portal/components/FleetDriverDetailDialog';
import CreditDriverDialog from '@/fleet-portal/components/CreditDriverDialog';
import { useActiveFleetMembership, useFleetAccessTier } from '@/hooks/useFleetPortalMode';
import { useNotify } from '@/services/notification';
import type { FleetDriver } from '@/api/types';
import { formatLabel } from '@/utils/format';

export default function FleetDriversPage() {
  const { companyId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const membership = useActiveFleetMembership(companyId);
  const tier = useFleetAccessTier(companyId);
  const regionId = membership?.fleetRegionId ?? searchParams.get('regionId') ?? undefined;
  const regionName = membership?.fleetRegionName;
  const [anchor, setAnchor] = useState<{ el: HTMLElement; driver: FleetDriver } | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<FleetDriver | null>(null);
  const [creditTarget, setCreditTarget] = useState<FleetDriver | null>(null);
  const isFinance = tier === 'finance';
  const canManageDrivers = tier === 'regional' || tier === 'support';
  const notify = useNotify();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['fleet-drivers', companyId, regionId],
    queryFn: () => listFleetDrivers(companyId, { regionId }),
    enabled: Boolean(companyId),
  });

  const stats = useMemo(() => {
    const drivers = data ?? [];
    return {
      total: drivers.length,
      approved: drivers.filter((d) => d.onboardingStatus === 'approved').length,
      pending: drivers.filter((d) => d.onboardingStatus === 'pending_review' || d.onboardingStatus === 'draft').length,
      online: drivers.filter((d) => d.isOnline).length,
    };
  }, [data]);

  const statusMutation = useMutation({
    mutationFn: ({ userId, onboardingStatus }: { userId: string; onboardingStatus: string }) =>
      updateFleetDriver(companyId, userId, { onboardingStatus }),
    onSuccess: () => {
      notify.success('Driver updated');
      queryClient.invalidateQueries({ queryKey: ['fleet-drivers', companyId] });
      queryClient.invalidateQueries({ queryKey: ['fleet-dashboard', companyId] });
      queryClient.invalidateQueries({ queryKey: ['fleet-driver-detail', companyId] });
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeFleetDriver(companyId, userId),
    onSuccess: () => {
      notify.success('Driver removed from fleet');
      setRemoveTarget(null);
      queryClient.invalidateQueries({ queryKey: ['fleet-drivers', companyId] });
      queryClient.invalidateQueries({ queryKey: ['fleet-dashboard', companyId] });
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const columns: DataTableColumn<FleetDriver>[] = [
    { id: 'name', label: 'Driver', minWidth: 120, render: (d) => d.fullName ?? d.phone },
    { id: 'phone', label: 'Phone', minWidth: 130, nowrap: false, render: (d) => d.phone ?? '—' },
    { id: 'city', label: 'Region', minWidth: 100, render: (d) => d.fleetRegionName ?? '—' },
    {
      id: 'status',
      label: 'Status',
      minWidth: 110,
      render: (d) => (
        <Chip
          size="small"
          label={formatLabel(d.onboardingStatus)}
          color={
            d.onboardingStatus === 'approved'
              ? 'success'
              : d.onboardingStatus === 'pending_review' || d.onboardingStatus === 'draft'
                ? 'warning'
                : d.onboardingStatus === 'rejected'
                  ? 'error'
                  : 'default'
          }
        />
      ),
    },
    {
      id: 'online',
      label: 'Online',
      minWidth: 90,
      render: (d) => (
        <Chip size="small" label={d.isOnline ? 'Online' : 'Offline'} color={d.isOnline ? 'success' : 'default'} variant="outlined" />
      ),
    },
    {
      id: 'actions',
      label: 'Actions',
      align: 'right',
      nowrap: false,
      minWidth: 220,
      width: 220,
      render: (d) => {
        const canReview =
          canManageDrivers &&
          (d.onboardingStatus === 'pending_review' || d.onboardingStatus === 'draft');
        return (
          <Box sx={{ display: 'inline-flex', gap: 1, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'nowrap' }}>
            <Button size="small" variant="outlined" onClick={() => setSelectedDriverId(d.userId)}>
              View
            </Button>
            {isFinance && (
              <Button
                size="small"
                variant="contained"
                onClick={(e) => {
                  e.stopPropagation();
                  setCreditTarget(d);
                }}
              >
                Credit
              </Button>
            )}
            {canReview && (
              <>
                <Button
                  size="small"
                  variant="contained"
                  disabled={statusMutation.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    statusMutation.mutate({ userId: d.userId, onboardingStatus: 'approved' });
                  }}
                >
                  Approve
                </Button>
                <Button
                  size="small"
                  color="error"
                  disabled={statusMutation.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    statusMutation.mutate({ userId: d.userId, onboardingStatus: 'rejected' });
                  }}
                >
                  Reject
                </Button>
              </>
            )}
            {canManageDrivers && (
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); setAnchor({ el: e.currentTarget, driver: d }); }}>
                <MoreVertIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        );
      },
    },
  ];

  const removeLabel = removeTarget?.fullName ?? removeTarget?.phone ?? 'this driver';

  return (
    <Box>
      <FleetPageHero
        badge="Driver operations"
        title={regionName ? `Drivers · ${regionName}` : 'Fleet drivers'}
        description={
          tier === 'finance'
            ? 'Credit a driver for cash or bank payments. The fleet owner must approve before the wallet is updated.'
            : tier === 'owner'
              ? 'All drivers in this fleet. Regional fleet handles onboarding; Fleet Finance submits credits for you to approve.'
            : tier === 'regional'
            ? 'Drivers in your city. Approve onboarding, manage vehicles, and remove drivers if needed.'
            : tier === 'support'
              ? 'Drivers across all cities in this fleet. Document approve/reject stays with regional fleet.'
              : 'Review onboarding status, online availability, and vehicle assignments for your fleet drivers.'
        }
      />
      <FleetMetricRow>
        <FleetMetricCell>
          <FleetMetricCard label="Total drivers" value={stats.total} icon={<PeopleIcon fontSize="small" />} accent="blue" />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard label="Approved" value={stats.approved} icon={<CheckCircleIcon fontSize="small" />} accent="emerald" />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard label="Pending review" value={stats.pending} icon={<PendingActionsIcon fontSize="small" />} accent="amber" />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard label="Online now" value={stats.online} icon={<WifiIcon fontSize="small" />} accent="indigo" />
        </FleetMetricCell>
      </FleetMetricRow>
      <FleetContentCard
        title="Driver roster"
        subtitle={
          isFinance
            ? 'Select a driver and submit a credit. The fleet owner approves before the wallet is updated.'
            : canManageDrivers
              ? 'Approve, manage, or remove fleet-assigned drivers'
              : 'Drivers in this fleet company'
        }
      >
        <DataTable
          columns={columns}
          rows={data ?? []}
          rowKey={(d) => d.userId}
          page={0}
          rowsPerPage={data?.length ?? 20}
          total={data?.length ?? 0}
          onPageChange={() => {}}
          onRowsPerPageChange={() => {}}
          loading={isLoading}
          onRowClick={(d) => setSelectedDriverId(d.userId)}
          paperSx={{ border: 0, boxShadow: 'none' }}
        />
      </FleetContentCard>
      <FleetDriverDetailDialog
        open={Boolean(selectedDriverId)}
        companyId={companyId}
        driverUserId={selectedDriverId}
        onClose={() => setSelectedDriverId(null)}
        actionsPending={statusMutation.isPending}
        onApprove={
          canManageDrivers
            ? (userId) => statusMutation.mutate({ userId, onboardingStatus: 'approved' })
            : undefined
        }
        onReject={
          canManageDrivers
            ? (userId) => statusMutation.mutate({ userId, onboardingStatus: 'rejected' })
            : undefined
        }
      />
      <CreditDriverDialog
        companyId={companyId}
        driver={creditTarget}
        onClose={() => setCreditTarget(null)}
      />
      <Menu anchorEl={anchor?.el} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem
          onClick={() => {
            if (anchor) setSelectedDriverId(anchor.driver.userId);
            setAnchor(null);
          }}
        >
          View details
        </MenuItem>
        {(anchor?.driver.onboardingStatus === 'pending_review' ||
          anchor?.driver.onboardingStatus === 'draft') && (
          <MenuItem
            onClick={() => {
              statusMutation.mutate({ userId: anchor.driver.userId, onboardingStatus: 'approved' });
              setAnchor(null);
            }}
          >
            Approve driver
          </MenuItem>
        )}
        {(anchor?.driver.onboardingStatus === 'pending_review' ||
          anchor?.driver.onboardingStatus === 'draft') && (
          <MenuItem
            onClick={() => {
              statusMutation.mutate({ userId: anchor.driver.userId, onboardingStatus: 'rejected' });
              setAnchor(null);
            }}
          >
            Reject driver
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            setRemoveTarget(anchor!.driver);
            setAnchor(null);
          }}
          sx={{ color: 'error.main' }}
        >
          Remove from fleet
        </MenuItem>
      </Menu>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Remove driver from fleet?"
        message={`Remove ${removeLabel} from this fleet? They will become an independent driver and lose fleet assignment.`}
        confirmLabel="Remove"
        confirmColor="error"
        loading={removeMutation.isPending}
        onConfirm={() => removeTarget && removeMutation.mutate(removeTarget.userId)}
        onCancel={() => {
          if (!removeMutation.isPending) setRemoveTarget(null);
        }}
      />
    </Box>
  );
}
