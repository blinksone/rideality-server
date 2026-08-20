import {
  Checkbox,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';

export interface DataTableColumn<T> {
  id: string;
  label: string;
  minWidth?: number;
  width?: number | string;
  align?: 'left' | 'right' | 'center';
  nowrap?: boolean;
  render?: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  page: number;
  rowsPerPage: number;
  total: number;
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (rowsPerPage: number) => void;
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  paperSx?: object;
}

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  page,
  rowsPerPage,
  total,
  onPageChange,
  onRowsPerPageChange,
  loading = false,
  emptyMessage = 'No records found',
  onRowClick,
  selectable = false,
  selectedIds = new Set(),
  onSelectionChange,
  paperSx,
}: DataTableProps<T>) {
  const rowIds = rows.map(rowKey);
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selectedIds.has(id));
  const someSelected = rowIds.some((id) => selectedIds.has(id));

  const toggleAll = () => {
    if (!onSelectionChange) return;
    const next = new Set(selectedIds);
    if (allSelected) {
      rowIds.forEach((id) => next.delete(id));
    } else {
      rowIds.forEach((id) => next.add(id));
    }
    onSelectionChange(next);
  };

  const toggleOne = (id: string) => {
    if (!onSelectionChange) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  // Keep the first column inset so checkboxes clear the card's left edge /
  // rounded corner (Paper uses overflow:hidden + borderRadius).
  const checkboxCellSx = {
    width: 64,
    pl: 2.5,
    pr: 0.5,
  } as const;

  return (
    <Paper variant="outlined" sx={{ width: '100%', overflow: 'hidden', borderRadius: 3, ...paperSx }}>
      <TableContainer sx={{ maxHeight: 'calc(100vh - 380px)', overflowX: 'auto' }}>
        <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', width: '100%', minWidth: 720 }}>
          <TableHead>
            <TableRow>
              {selectable && (
                <TableCell
                  padding="checkbox"
                  sx={{
                    ...checkboxCellSx,
                    bgcolor: 'background.paper',
                    zIndex: 3,
                  }}
                >
                  <Checkbox
                    size="small"
                    checked={allSelected}
                    indeterminate={!allSelected && someSelected}
                    onChange={toggleAll}
                  />
                </TableCell>
              )}
              {columns.map((col) => (
                <TableCell
                  key={col.id}
                  align={col.align}
                  sx={{
                    minWidth: col.minWidth,
                    width: col.width,
                    fontWeight: 600,
                    bgcolor: 'background.paper',
                    whiteSpace: col.nowrap === false ? 'normal' : 'nowrap',
                    ...(col.nowrap !== false && {
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }),
                  }}
                >
                  {col.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length + (selectable ? 1 : 0)} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={28} />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + (selectable ? 1 : 0)} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">{emptyMessage}</Typography>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const id = rowKey(row);
                const selected = selectedIds.has(id);
                return (
                  <TableRow
                    hover
                    key={id}
                    selected={selected}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    sx={{ cursor: onRowClick ? 'pointer' : 'default' }}
                  >
                    {selectable && (
                      <TableCell
                        padding="checkbox"
                        onClick={(e) => e.stopPropagation()}
                        sx={checkboxCellSx}
                      >
                        <Checkbox size="small" checked={selected} onChange={() => toggleOne(id)} />
                      </TableCell>
                    )}
                    {columns.map((col) => (
                      <TableCell
                        key={col.id}
                        align={col.align}
                        sx={{
                          minWidth: col.minWidth,
                          width: col.width,
                          whiteSpace: col.nowrap === false ? 'normal' : 'nowrap',
                          ...(col.nowrap !== false && {
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }),
                        }}
                      >
                        {col.render ? col.render(row) : (row as Record<string, unknown>)[col.id] as ReactNode}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_, p) => onPageChange(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => onRowsPerPageChange(parseInt(e.target.value, 10))}
        rowsPerPageOptions={[10, 20, 50]}
      />
    </Paper>
  );
}
