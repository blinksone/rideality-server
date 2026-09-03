import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import LocationCityIcon from '@mui/icons-material/LocationCity';
import PeopleIcon from '@mui/icons-material/People';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import {
  createFleetRegion,
  getFleetCompany,
  listFleetCityServices,
  listFleetTeam,
  listManagedFleetRegions,
  updateFleetCityServices,
  type FleetRegionRow,
} from '@/api/fleet.api';
import { getApiErrorMessage } from '@/api/client';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import FleetContentCard from '@/fleet-portal/components/FleetContentCard';
import CreateFleetStaffDialog from '@/fleet-portal/components/CreateFleetStaffDialog';
import FleetMetricCard from '@/fleet-portal/components/FleetMetricCard';
import FleetMetricRow, { FleetMetricCell } from '@/fleet-portal/components/FleetMetricRow';
import FleetPageHero from '@/fleet-portal/components/FleetPageHero';
import { fleetPath } from '@/fleet-portal/fleetNavConfig';
import { useFleetAccessTier } from '@/hooks/useFleetPortalMode';
import { useNotify } from '@/services/notification';
import { formatDate } from '@/utils/format';

export default function FleetRegionsPage() {
  const { companyId = '' } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const tier = useFleetAccessTier(companyId);
  const canManage = tier === 'owner';

  const [createOpen, setCreateOpen] = useState(false);
  const [cityName, setCityName] = useState('');
  const [staffCity, setStaffCity] = useState<FleetRegionRow | null>(null);
  const [serviceCityId, setServiceCityId] = useState('');

  const { data: company } = useQuery({
    queryKey: ['fleet-company', companyId],
    queryFn: () => getFleetCompany(companyId),
    enabled: Boolean(companyId),
  });

  const { data: team = [] } = useQuery({
    queryKey: ['fleet-team', companyId],
    queryFn: () => listFleetTeam(companyId),
    enabled: Boolean(companyId),
  });

  const supportCount = team.filter((m) => m.role === 'support' || m.role === 'dispatcher').length;

  const { data: regions = [], isLoading } = useQuery({
    queryKey: ['fleet-managed-regions', companyId],
    queryFn: () => listManagedFleetRegions(companyId),
    enabled: Boolean(companyId),
  });

  const activeServiceCityId = useMemo(() => {
    if (regions.some((r) => r.id === serviceCityId)) return serviceCityId;
    return regions[0]?.id ?? '';
  }, [regions, serviceCityId]);

  const { data: cityServices = [], isLoading: servicesLoading } = useQuery({
    queryKey: ['fleet-city-services', companyId, activeServiceCityId],
    queryFn: () => listFleetCityServices(companyId, activeServiceCityId),
    enabled: Boolean(companyId && activeServiceCityId && canManage),
  });

  const servicesMutation = useMutation({
    mutationFn: (products: Array<{ code: string; enabled: boolean }>) =>
      updateFleetCityServices(companyId, activeServiceCityId, products),
    onSuccess: () => {
      notify.success('City services updated');
      queryClient.invalidateQueries({ queryKey: ['fleet-city-services', companyId, activeServiceCityId] });
      queryClient.invalidateQueries({ queryKey: ['fleet-city-profile', companyId, activeServiceCityId] });
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const createMutation = useMutation({
    mutationFn: () => createFleetRegion(companyId, { name: cityName.trim() }),
    onSuccess: () => {
      notify.success('City created');
      queryClient.invalidateQueries({ queryKey: ['fleet-managed-regions', companyId] });
      setCreateOpen(false);
      setCityName('');
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const occupiedCityIds = new Set(
    team
      .filter((m) => (m.role === 'regional' || m.role === 'manager') && m.fleetRegionId)
      .map((m) => m.fleetRegionId as string),
  );

  const columns: DataTableColumn<FleetRegionRow>[] = [
    { id: 'name', label: 'City', render: (r) => r.name },
    { id: 'drivers', label: 'Drivers', render: (r) => r.driverCount },
    {
      id: 'regional',
      label: 'Regional user',
      render: (r) => {
        const member = team.find(
          (m) => (m.role === 'regional' || m.role === 'manager') && m.fleetRegionId === r.id,
        );
        return member?.fullName ?? member?.email ?? '—';
      },
    },
    { id: 'created', label: 'Created', render: (r) => formatDate(r.createdAt) },
    {
      id: 'actions',
      label: '',
      align: 'right',
      render: (r) =>
        canManage ? (
          occupiedCityIds.has(r.id) ? null : (
            <Button
              size="small"
              startIcon={<PersonAddIcon />}
              onClick={(e) => {
                e.stopPropagation();
                setStaffCity(r);
              }}
            >
              Add regional user
            </Button>
          )
        ) : null,
    },
  ];

  return (
    <Box>
      <FleetPageHero
        badge="Coverage"
        title="Cities"
        description="Each city is a regional fleet. Enable taxi and cargo products below, or open a city for drivers and tickets."
        actions={
          canManage ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
              Add city
            </Button>
          ) : undefined
        }
      />
      <FleetMetricRow>
        <FleetMetricCell>
          <FleetMetricCard label="Cities" value={regions.length} icon={<LocationCityIcon fontSize="small" />} accent="blue" />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard
            label="Drivers"
            value={regions.reduce((n, r) => n + r.driverCount, 0)}
            icon={<PeopleIcon fontSize="small" />}
            accent="emerald"
          />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard
            label="Support"
            value={supportCount}
            icon={<SupportAgentIcon fontSize="small" />}
            accent="indigo"
          />
        </FleetMetricCell>
      </FleetMetricRow>
      <FleetContentCard title="City roster" subtitle="Click a city to open its profile">
        <DataTable
          columns={columns}
          rows={regions}
          rowKey={(r) => r.id}
          page={0}
          rowsPerPage={Math.max(regions.length, 10)}
          total={regions.length}
          onPageChange={() => {}}
          onRowsPerPageChange={() => {}}
          loading={isLoading}
          onRowClick={(r) => navigate(`${fleetPath(companyId, 'regions')}/${r.id}`)}
          paperSx={{ border: 0, boxShadow: 'none' }}
        />
      </FleetContentCard>

      {canManage && (
        <FleetContentCard
          title="Services in this city"
          subtitle="What this fleet offers here. Riders only see enabled products with the city fare."
        >
          {regions.length > 1 && (
            <FormControl size="small" sx={{ minWidth: 220, mb: 2 }}>
              <InputLabel id="owner-service-city-label">City</InputLabel>
              <Select
                labelId="owner-service-city-label"
                label="City"
                value={activeServiceCityId}
                onChange={(e) => setServiceCityId(e.target.value)}
              >
                {regions.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          {servicesLoading ? (
            <Typography color="text.secondary">Loading services…</Typography>
          ) : !activeServiceCityId || cityServices.length === 0 ? (
            <Typography color="text.secondary">
              {regions.length === 0
                ? 'Add a city first, then enable Bike, Economy, AC, and cargo.'
                : 'No catalog products yet for this city.'}
            </Typography>
          ) : (
            <Box>
              {(['taxi', 'cargo'] as const).map((family) => {
                const rows = cityServices.filter((s) => s.family === family);
                if (!rows.length) return null;
                return (
                  <Box key={family} sx={{ mb: 1.5 }}>
                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                      {family === 'taxi' ? 'Taxi' : 'Cargo'}
                    </Typography>
                    {rows.map((row) => (
                      <FormControlLabel
                        key={row.code}
                        sx={{ display: 'flex', ml: 0 }}
                        control={
                          <Switch
                            checked={row.enabled}
                            disabled={servicesMutation.isPending}
                            onChange={(_, enabled) =>
                              servicesMutation.mutate(
                                cityServices.map((item) =>
                                  item.code === row.code
                                    ? { code: item.code, enabled }
                                    : { code: item.code, enabled: item.enabled },
                                ),
                              )
                            }
                          />
                        }
                        label={`${row.label} (${row.code})`}
                      />
                    ))}
                  </Box>
                );
              })}
            </Box>
          )}
        </FleetContentCard>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add city</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="City name"
            value={cityName}
            onChange={(e) => setCityName(e.target.value.slice(0, 80))}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={cityName.trim().length < 2 || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <CreateFleetStaffDialog
        open={Boolean(staffCity)}
        companyId={companyId}
        role="regional"
        cities={staffCity ? [{ id: staffCity.id, name: staffCity.name }] : []}
        defaultCityId={staffCity?.id}
        lockCity
        phonePrefix={company?.region?.phonePrefix}
        onClose={() => setStaffCity(null)}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['fleet-managed-regions', companyId] });
          queryClient.invalidateQueries({ queryKey: ['fleet-team', companyId] });
        }}
      />
    </Box>
  );
}
