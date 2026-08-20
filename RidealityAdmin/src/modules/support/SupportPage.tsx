import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Box, Button, Paper, Tab, Tabs, TextField, Typography } from '@mui/material';
import { addNote, getAuditLog, listUsers } from '@/api/users.api';
import { getApiErrorMessage } from '@/api/client';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import PageHeader from '@/components/PageHeader';
import { useDebounce } from '@/hooks/useDebounce';
import { useNotify } from '@/services/notification';
import type { AuditLogEntry, UserListItem } from '@/api/types';
import { formatDate } from '@/utils/format';

export default function SupportPage() {
  const navigate = useNavigate();
  const notify = useNotify();
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [auditPage, setAuditPage] = useState(0);
  const [auditRows, setAuditRows] = useState(10);

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['support-users', debouncedSearch],
    queryFn: () => listUsers({ page: 1, limit: 10, search: debouncedSearch || undefined }),
    enabled: tab === 0 && debouncedSearch.length >= 2,
  });

  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ['support-audit', selectedUserId, auditPage, auditRows],
    queryFn: () => getAuditLog(selectedUserId, { page: auditPage + 1, limit: auditRows }),
    enabled: tab === 2 && Boolean(selectedUserId),
  });

  const noteMutation = useMutation({
    mutationFn: () => addNote(selectedUserId, noteContent),
    onSuccess: () => {
      notify.success('Note added');
      setNoteContent('');
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const userColumns: DataTableColumn<UserListItem>[] = [
    { id: 'fullName', label: 'Name', render: (r) => r.fullName ?? '—' },
    { id: 'email', label: 'Email', render: (r) => r.email ?? '—' },
    { id: 'phone', label: 'Phone' },
    { id: 'status', label: 'Status' },
  ];

  const auditColumns: DataTableColumn<AuditLogEntry>[] = [
    { id: 'action', label: 'Action' },
    { id: 'createdAt', label: 'When', render: (r) => formatDate(r.createdAt) },
  ];

  return (
    <>
      <PageHeader title="Support" subtitle="Search users, add notes, and review audit logs" />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="User search" />
        <Tab label="Notes" />
        <Tab label="Audit log" />
      </Tabs>

      {tab === 0 && (
        <>
          <TextField
            size="small"
            label="Search users (min 2 chars)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
            sx={{ mb: 2, maxWidth: 480 }}
          />
          <DataTable
            columns={userColumns}
            rows={usersData?.data ?? []}
            rowKey={(r) => r.id}
            page={0}
            rowsPerPage={10}
            total={usersData?.pagination.total ?? 0}
            onPageChange={() => undefined}
            onRowsPerPageChange={() => undefined}
            loading={usersLoading}
            emptyMessage={debouncedSearch.length < 2 ? 'Type to search users' : 'No users found'}
            onRowClick={(r) => navigate(`/users/${r.id}`)}
          />
        </>
      )}

      {tab === 1 && (
        <Paper variant="outlined" sx={{ p: 2, maxWidth: 560 }}>
          <TextField
            label="User ID"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
          />
          <TextField
            label="Note"
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            fullWidth
            multiline
            minRows={3}
            sx={{ mb: 2 }}
          />
          <Button
            variant="contained"
            disabled={!selectedUserId || !noteContent.trim() || noteMutation.isPending}
            onClick={() => noteMutation.mutate()}
          >
            Add note
          </Button>
        </Paper>
      )}

      {tab === 2 && (
        <>
          <Box sx={{ mb: 2, maxWidth: 480 }}>
            <TextField
              label="User ID for audit log"
              value={selectedUserId}
              onChange={(e) => {
                setSelectedUserId(e.target.value);
                setAuditPage(0);
              }}
              fullWidth
            />
          </Box>
          {!selectedUserId ? (
            <Typography color="text.secondary">Enter a user ID to load audit entries.</Typography>
          ) : (
            <DataTable
              columns={auditColumns}
              rows={auditData?.data ?? []}
              rowKey={(r) => r.id}
              page={auditPage}
              rowsPerPage={auditRows}
              total={auditData?.pagination.total ?? 0}
              onPageChange={setAuditPage}
              onRowsPerPageChange={setAuditRows}
              loading={auditLoading}
            />
          )}
        </>
      )}
    </>
  );
}
