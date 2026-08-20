import { Box, Button, Stack, TextField, MenuItem } from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import SearchIcon from '@mui/icons-material/Search';

export interface FleetFilterValues {
  search: string;
  status: string;
  from: string;
  to: string;
}

interface FleetFiltersProps {
  values: FleetFilterValues;
  onChange: (next: Partial<FleetFilterValues>) => void;
  statusOptions?: Array<{ value: string; label: string }>;
  onExport?: () => void;
  exportLabel?: string;
}

export default function FleetFilters({
  values,
  onChange,
  statusOptions,
  onExport,
  exportLabel = 'Export CSV',
}: FleetFiltersProps) {
  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={1.5}
      sx={{ mb: 2, alignItems: { md: 'center' } }}
    >
      <TextField
        size="small"
        placeholder="Search…"
        value={values.search}
        onChange={(e) => onChange({ search: e.target.value })}
        slotProps={{
          input: {
            startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
          },
        }}
        sx={{ minWidth: 220 }}
      />
      {statusOptions && (
        <TextField
          select
          size="small"
          label="Status"
          value={values.status}
          onChange={(e) => onChange({ status: e.target.value })}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All</MenuItem>
          {statusOptions.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
      )}
      <TextField
        size="small"
        type="date"
        label="From"
        value={values.from}
        onChange={(e) => onChange({ from: e.target.value })}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        size="small"
        type="date"
        label="To"
        value={values.to}
        onChange={(e) => onChange({ to: e.target.value })}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <Box sx={{ flexGrow: 1 }} />
      {onExport && (
        <Button variant="outlined" startIcon={<FileDownloadIcon />} onClick={onExport}>
          {exportLabel}
        </Button>
      )}
    </Stack>
  );
}
