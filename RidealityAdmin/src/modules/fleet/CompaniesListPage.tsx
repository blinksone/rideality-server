import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { listAdminFleets } from '@/api/fleet.api';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import PageHeader from '@/components/PageHeader';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermissions } from '@/hooks/usePermissions';
import { useAdminScope } from '@/hooks/useAdminScope';
import type { FleetCompany, FleetCompanyStatus } from '@/api/types';
import { formatDate, formatLabel } from '@/utils/format';

function statusColor(status: string): 'default' | 'success' | 'warning' | 'error' {
  if (status === 'active') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'suspended') return 'error';
  return 'default';
}

export default function CompaniesListPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { role } = useAdminScope();
  const canCreateCompany = can('FLEET_CREATE') && role !== 'CITY_ADMIN';
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FleetCompanyStatus | ''>('');
  const debouncedSearch = useDebounce(search);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['fleet-companies', page, rowsPerPage, debouncedSearch, statusFilter],
    queryFn: () =>
      listAdminFleets({
        page: page + 1,
        limit: rowsPerPage,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
      }),
  });

  const columns: DataTableColumn<FleetCompany>[] = [
    { id: 'legalName', label: 'Company' },
    {
      id: 'status',
      label: 'Status',
      render: (r) => (
        <Chip size="small" label={formatLabel(r.status)} color={statusColor(r.status)} />
      ),
    },
    {
      id: 'region',
      label: 'Region',
      render: (r) => r.region?.name ? `${r.region.name} (${r.region.code})` : r.regionId,
    },
    {
      id: 'owner',
      label: 'Owner',
      render: (r) => r.owner?.profile?.fullName ?? '—',
    },
    { id: 'createdAt', label: 'Created', render: (r) => formatDate(r.createdAt) },
  ];

  return (
    <>
      <PageHeader
        title="Fleet companies"
        subtitle={
          can('manage_users')
            ? 'Review, approve, and manage fleet companies worldwide.'
            : 'Your fleet companies — manage drivers, invites, and wallet.'
        }
        actions={
          canCreateCompany ? (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              component={RouterLink}
              to="/fleet/create"
            >
              Create company
            </Button>
          ) : undefined
        }
      />

      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          label="Search company"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: 240 }}
        />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="fleet-status-filter">Status</InputLabel>
          <Select
            labelId="fleet-status-filter"
            label="Status"
            value={statusFilter}
            displayEmpty
            renderValue={(v) => (v ? String(v).charAt(0).toUpperCase() + String(v).slice(1) : 'All')}
            onChange={(e) => {
              setStatusFilter(e.target.value as FleetCompanyStatus | '');
              setPage(0);
            }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="suspended">Suspended</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(r) => r.id}
        page={page}
        rowsPerPage={rowsPerPage}
        total={data?.pagination.total ?? 0}
        onPageChange={setPage}
        onRowsPerPageChange={(n) => {
          setRowsPerPage(n);
          setPage(0);
        }}
        loading={isLoading || isFetching}
        emptyMessage="No fleet companies found."
        onRowClick={(r) => navigate(`/fleet/${r.id}`)}
      />
    </>
  );
}
