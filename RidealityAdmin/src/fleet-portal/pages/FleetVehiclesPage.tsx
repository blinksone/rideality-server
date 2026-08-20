import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  TextField,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import BuildIcon from '@mui/icons-material/Build';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import VerifiedIcon from '@mui/icons-material/Verified';
import AddIcon from '@mui/icons-material/Add';
import {
  createFleetVehicle,
  deleteFleetVehicle,
  listFleetDrivers,
  listFleetVehicles,
  updateFleetVehicle,
} from '@/api/fleet.api';
import { getApiErrorMessage } from '@/api/client';
import ConfirmDialog from '@/components/ConfirmDialog';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import FleetContentCard from '@/fleet-portal/components/FleetContentCard';
import FleetFilters, { type FleetFilterValues } from '@/fleet-portal/components/FleetFilters';
import FleetMetricCard from '@/fleet-portal/components/FleetMetricCard';
import FleetMetricRow, { FleetMetricCell } from '@/fleet-portal/components/FleetMetricRow';
import FleetPageHero from '@/fleet-portal/components/FleetPageHero';
import { useNotify } from '@/services/notification';
import { formatDate, formatLabel } from '@/utils/format';
import type { FleetVehicle } from '@/api/fleet.api';
import type { FleetDriver } from '@/api/types';

const STATUS_COLOR: Record<string, 'success' | 'warning' | 'default'> = {
  active: 'success',
  maintenance: 'warning',
  offline: 'default',
};

const VEHICLE_TYPES = ['Car', 'SUV', 'Van', 'Bike', 'Rickshaw'];

type VehicleForm = {
  driverUserId: string;
  vehicleType: string;
  model: string;
  numberPlate: string;
  color: string;
  year: string;
  availableSeats: string;
};

const EMPTY_FORM: VehicleForm = {
  driverUserId: '',
  vehicleType: 'Car',
  model: '',
  numberPlate: '',
  color: '',
  year: '',
  availableSeats: '4',
};

function driverLabel(d: FleetDriver) {
  return d.fullName ?? d.phone ?? d.userId;
}

export default function FleetVehiclesPage() {
  const { companyId = '' } = useParams();
  const queryClient = useQueryClient();
  const notify = useNotify();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [filters, setFilters] = useState<FleetFilterValues>({ search: '', status: '', from: '', to: '' });
  const [anchor, setAnchor] = useState<{ el: HTMLElement; vehicle: FleetVehicle } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [assignVehicle, setAssignVehicle] = useState<FleetVehicle | null>(null);
  const [removeTarget, setRemoveTarget] = useState<FleetVehicle | null>(null);
  const [form, setForm] = useState<VehicleForm>(EMPTY_FORM);
  const [assignDriverId, setAssignDriverId] = useState('');

  const params = useMemo(
    () => ({
      page: page + 1,
      limit: rowsPerPage,
      search: filters.search || undefined,
      status: filters.status || undefined,
    }),
    [page, rowsPerPage, filters],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['fleet-vehicles', companyId, params],
    queryFn: () => listFleetVehicles(companyId, params),
    enabled: Boolean(companyId),
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['fleet-drivers', companyId],
    queryFn: () => listFleetDrivers(companyId),
    enabled: Boolean(companyId) && (addOpen || Boolean(assignVehicle)),
  });

  const rows = data?.data ?? [];
  const stats = useMemo(
    () => ({
      total: data?.pagination.total ?? rows.length,
      active: rows.filter((v) => v.operationalStatus === 'active').length,
      maintenance: rows.filter((v) => v.operationalStatus === 'maintenance').length,
      verified: rows.filter((v) => v.isVerified).length,
    }),
    [data, rows],
  );

  const driversWithoutVehicle = useMemo(
    () => drivers.filter((d) => !d.vehicle),
    [drivers],
  );

  const assignDriverOptions = useMemo(() => {
    if (!assignVehicle) return [];
    return drivers.filter(
      (d) => !d.vehicle || d.userId === assignVehicle.driverUserId,
    );
  }, [drivers, assignVehicle]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['fleet-vehicles', companyId] });
    queryClient.invalidateQueries({ queryKey: ['fleet-drivers', companyId] });
    queryClient.invalidateQueries({ queryKey: ['fleet-dashboard', companyId] });
  };

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateFleetVehicle(companyId, id, { operationalStatus: status }),
    onSuccess: () => {
      notify.success('Vehicle status updated');
      invalidate();
      setAnchor(null);
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createFleetVehicle(companyId, {
        ...(form.driverUserId ? { driverUserId: form.driverUserId } : {}),
        vehicleType: form.vehicleType,
        model: form.model.trim(),
        numberPlate: form.numberPlate.trim(),
        color: form.color.trim() || undefined,
        year: form.year ? Number(form.year) : undefined,
        availableSeats: form.availableSeats ? Number(form.availableSeats) : undefined,
      }),
    onSuccess: () => {
      notify.success('Vehicle added');
      setAddOpen(false);
      setForm(EMPTY_FORM);
      invalidate();
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      updateFleetVehicle(companyId, assignVehicle!.id, {
        driverUserId: assignDriverId ? assignDriverId : null,
      }),
    onSuccess: (_data, _vars) => {
      notify.success(assignDriverId ? 'Driver updated for vehicle' : 'Driver unassigned from vehicle');
      setAssignVehicle(null);
      setAssignDriverId('');
      setAnchor(null);
      invalidate();
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const removeMutation = useMutation({
    mutationFn: (vehicleId: string) => deleteFleetVehicle(companyId, vehicleId),
    onSuccess: () => {
      notify.success('Vehicle removed');
      setRemoveTarget(null);
      setAnchor(null);
      invalidate();
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setAddOpen(true);
  };

  const openAssign = (vehicle: FleetVehicle) => {
    setAssignVehicle(vehicle);
    setAssignDriverId(vehicle.driverUserId ?? '');
    setAnchor(null);
  };

  const columns: DataTableColumn<FleetVehicle>[] = [
    { id: 'plate', label: 'Plate', render: (v) => v.numberPlate },
    { id: 'model', label: 'Vehicle', render: (v) => `${v.model} (${formatLabel(v.vehicleType)})` },
    { id: 'driver', label: 'Driver', render: (v) => v.driverName ?? '—' },
    {
      id: 'status',
      label: 'Status',
      render: (v) => (
        <Chip size="small" label={formatLabel(v.operationalStatus)} color={STATUS_COLOR[v.operationalStatus] ?? 'default'} />
      ),
    },
    { id: 'verified', label: 'Verified', render: (v) => (v.isVerified ? 'Yes' : 'No') },
    { id: 'updated', label: 'Updated', render: (v) => formatDate(v.updatedAt) },
    {
      id: 'actions',
      label: '',
      align: 'right',
      render: (v) => (
        <IconButton size="small" onClick={(e) => setAnchor({ el: e.currentTarget, vehicle: v })}>
          <MoreVertIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  const addValid =
    Boolean(form.vehicleType.trim()) &&
    Boolean(form.model.trim()) &&
    Boolean(form.numberPlate.trim());

  return (
    <Box>
      <FleetPageHero
        badge="Fleet assets"
        title="Vehicle registry"
        description="Track fleet vehicles, operational status, driver assignments, and verification state."
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
            Add vehicle
          </Button>
        }
      />
      <FleetMetricRow>
        <FleetMetricCell>
          <FleetMetricCard label="Total vehicles" value={stats.total} icon={<DirectionsCarIcon fontSize="small" />} accent="blue" />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard label="Active" value={stats.active} icon={<PowerSettingsNewIcon fontSize="small" />} accent="emerald" />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard label="In maintenance" value={stats.maintenance} icon={<BuildIcon fontSize="small" />} accent="amber" />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard label="Verified" value={stats.verified} icon={<VerifiedIcon fontSize="small" />} accent="teal" />
        </FleetMetricCell>
      </FleetMetricRow>
      <FleetFilters
        values={filters}
        onChange={(next) => {
          setFilters((f) => ({ ...f, ...next }));
          setPage(0);
        }}
        statusOptions={[
          { value: 'active', label: 'Active' },
          { value: 'maintenance', label: 'Maintenance' },
          { value: 'offline', label: 'Offline' },
        ]}
      />
      <FleetContentCard title="Vehicle list" subtitle="Add vehicles, assign drivers, and update operational status">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(v) => v.id}
          page={page}
          rowsPerPage={rowsPerPage}
          total={data?.pagination.total ?? 0}
          onPageChange={setPage}
          onRowsPerPageChange={(n) => {
            setRowsPerPage(n);
            setPage(0);
          }}
          loading={isLoading}
          paperSx={{ border: 0, boxShadow: 'none' }}
        />
      </FleetContentCard>

      <Menu open={Boolean(anchor)} anchorEl={anchor?.el} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => anchor && openAssign(anchor.vehicle)}>
          {anchor?.vehicle.driverUserId ? 'Change / unassign driver' : 'Assign driver'}
        </MenuItem>
        {(['active', 'maintenance', 'offline'] as const).map((status) => (
          <MenuItem
            key={status}
            onClick={() => anchor && statusMutation.mutate({ id: anchor.vehicle.id, status })}
          >
            Mark {formatLabel(status)}
          </MenuItem>
        ))}
        <MenuItem
          sx={{ color: 'error.main' }}
          onClick={() => {
            if (!anchor) return;
            setRemoveTarget(anchor.vehicle);
            setAnchor(null);
          }}
        >
          Remove vehicle
        </MenuItem>
      </Menu>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add vehicle</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            select
            label="Assign to driver (optional)"
            value={form.driverUserId}
            onChange={(e) => setForm((f) => ({ ...f, driverUserId: e.target.value }))}
            fullWidth
            helperText={
              driversWithoutVehicle.length === 0
                ? 'No free drivers — you can still add the vehicle unassigned.'
                : 'Leave empty to add the vehicle without a driver.'
            }
          >
            <MenuItem value="">
              <em>Unassigned</em>
            </MenuItem>
            {driversWithoutVehicle.map((d) => (
              <MenuItem key={d.userId} value={d.userId}>
                {driverLabel(d)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Vehicle type"
            value={form.vehicleType}
            onChange={(e) => setForm((f) => ({ ...f, vehicleType: e.target.value }))}
            fullWidth
          >
            {VEHICLE_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Model"
            placeholder="e.g. Toyota Corolla"
            value={form.model}
            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
            fullWidth
          />
          <TextField
            label="Number plate"
            placeholder="e.g. ABC-123"
            value={form.numberPlate}
            onChange={(e) => setForm((f) => ({ ...f, numberPlate: e.target.value }))}
            fullWidth
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Color"
              value={form.color}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Year"
              type="number"
              value={form.year}
              onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Seats"
              type="number"
              value={form.availableSeats}
              onChange={(e) => setForm((f) => ({ ...f, availableSeats: e.target.value }))}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!addValid || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Add vehicle
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(assignVehicle)} onClose={() => setAssignVehicle(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {assignVehicle?.driverUserId ? 'Change / unassign driver' : 'Assign driver'}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            label="Vehicle"
            value={
              assignVehicle
                ? `${assignVehicle.numberPlate} · ${assignVehicle.model}`
                : ''
            }
            slotProps={{ input: { readOnly: true } }}
            fullWidth
          />
          <TextField
            select
            label="Assigned driver"
            value={assignDriverId}
            onChange={(e) => setAssignDriverId(e.target.value)}
            fullWidth
            helperText="Choose Unassigned to keep the vehicle and free the current driver."
          >
            <MenuItem value="">
              <em>Unassigned</em>
            </MenuItem>
            {assignDriverOptions.map((d) => (
              <MenuItem key={d.userId} value={d.userId}>
                {driverLabel(d)}
                {d.userId === assignVehicle?.driverUserId ? ' (current)' : ''}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignVehicle(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={
              (assignDriverId || null) === (assignVehicle?.driverUserId || null) ||
              assignMutation.isPending
            }
            onClick={() => assignMutation.mutate()}
          >
            {assignDriverId ? 'Update driver' : 'Unassign driver'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Remove vehicle?"
        message={
          removeTarget
            ? `Remove ${removeTarget.numberPlate} (${removeTarget.model}) from ${removeTarget.driverName ?? 'this driver'}? The driver will have no vehicle until you add or assign another one.`
            : ''
        }
        confirmLabel="Remove vehicle"
        confirmColor="error"
        loading={removeMutation.isPending}
        onConfirm={() => removeTarget && removeMutation.mutate(removeTarget.id)}
        onCancel={() => {
          if (!removeMutation.isPending) setRemoveTarget(null);
        }}
      />
    </Box>
  );
}
