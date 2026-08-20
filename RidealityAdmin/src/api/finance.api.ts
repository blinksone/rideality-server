import { apiClient } from '@/api/client';
import type {
  ApiPaginated,
  ApiSuccess,
  FinanceAdjustment,
  FinancePayout,
  FinanceSummary,
  PaginationParams,
  WalletDashboardDetail,
  WalletDetail,
  WalletNote,
  WalletTransaction,
} from '@/api/types';

export type WalletListParams = PaginationParams & {
  ownerType?: string;
  regionId?: string;
  status?: string;
  search?: string;
  currency?: string;
  balanceMin?: number;
  balanceMax?: number;
  updatedFrom?: string;
  updatedTo?: string;
  ids?: string;
};

export async function getFinanceSummary(): Promise<FinanceSummary> {
  const { data } = await apiClient.get<ApiSuccess<FinanceSummary>>('/admin/finance/summary');
  return data.data;
}

export async function listFinanceWallets(params: WalletListParams): Promise<ApiPaginated<WalletDetail>> {
  const { data } = await apiClient.get<ApiPaginated<WalletDetail>>('/admin/finance/wallets', { params });
  return data;
}

export async function getWalletDashboardDetail(id: string): Promise<WalletDashboardDetail> {
  const { data } = await apiClient.get<ApiSuccess<WalletDashboardDetail>>(
    `/admin/finance/wallets/${id}/dashboard`,
  );
  return data.data;
}

export async function createFinanceWallet(payload: {
  ownerType: 'user' | 'fleet';
  userId?: string;
  fleetCompanyId?: string;
  currency?: string;
}): Promise<WalletDetail> {
  const { data } = await apiClient.post<ApiSuccess<WalletDetail>>('/admin/finance/wallets', payload);
  return data.data;
}

export async function bulkUpdateWalletStatus(
  walletIds: string[],
  status: 'active' | 'frozen' | 'closed',
): Promise<{ updated: number; wallets: WalletDetail[] }> {
  const { data } = await apiClient.patch<ApiSuccess<{ updated: number; wallets: WalletDetail[] }>>(
    '/admin/finance/wallets/bulk-status',
    { walletIds, status },
  );
  return data.data;
}

export async function exportFinanceWallets(params: Omit<WalletListParams, 'page' | 'limit'>): Promise<Blob> {
  const { data } = await apiClient.get<Blob>('/admin/finance/wallets/export', {
    params,
    responseType: 'blob',
  });
  return data;
}

export async function addWalletNote(walletId: string, content: string): Promise<WalletNote> {
  const { data } = await apiClient.post<ApiSuccess<WalletNote>>(
    `/admin/finance/wallets/${walletId}/notes`,
    { content },
  );
  return data.data;
}

export async function lookupFinanceWalletsByEmail(email: string): Promise<WalletDetail[]> {
  const { data } = await apiClient.get<ApiSuccess<{ wallets: WalletDetail[] }>>(
    '/admin/finance/wallets/lookup',
    { params: { email } },
  );
  return data.data.wallets;
}

export async function getFinanceWallet(id: string): Promise<WalletDetail> {
  const { data } = await apiClient.get<ApiSuccess<WalletDetail>>(`/admin/finance/wallets/${id}`);
  return data.data;
}

export async function listFinanceWalletTransactions(
  walletId: string,
  params: PaginationParams,
): Promise<ApiPaginated<WalletTransaction>> {
  const { data } = await apiClient.get<ApiPaginated<WalletTransaction>>(
    `/admin/finance/wallets/${walletId}/transactions`,
    { params },
  );
  return data;
}

export async function listFinanceTransactions(
  params: PaginationParams & { walletId?: string; type?: string },
): Promise<ApiPaginated<WalletTransaction>> {
  const { data } = await apiClient.get<ApiPaginated<WalletTransaction>>('/admin/finance/transactions', {
    params,
  });
  return data;
}

export async function listFinanceAdjustments(
  params: PaginationParams & { status?: string; walletId?: string },
): Promise<ApiPaginated<FinanceAdjustment>> {
  const { data } = await apiClient.get<ApiPaginated<FinanceAdjustment>>('/admin/finance/adjustments', {
    params,
  });
  return data;
}

export async function createFinanceAdjustment(payload: {
  walletId: string;
  direction: 'credit' | 'debit';
  amount: number;
  reason: string;
  topupMethod?: string;
  externalRef?: string;
}): Promise<FinanceAdjustment> {
  const { data } = await apiClient.post<ApiSuccess<FinanceAdjustment>>('/admin/finance/adjustments', payload);
  return data.data;
}

export async function reviewFinanceAdjustment(
  id: string,
  payload: { action: 'approve' | 'reject'; reviewNote?: string },
): Promise<FinanceAdjustment> {
  const { data } = await apiClient.patch<ApiSuccess<FinanceAdjustment>>(
    `/admin/finance/adjustments/${id}/review`,
    payload,
  );
  return data.data;
}

export async function listFinancePayouts(
  params: PaginationParams & { status?: string; walletId?: string },
): Promise<ApiPaginated<FinancePayout>> {
  const { data } = await apiClient.get<ApiPaginated<FinancePayout>>('/admin/finance/payouts', { params });
  return data;
}

export async function reviewFinancePayout(
  id: string,
  payload: { action: 'approve' | 'reject'; reviewNote?: string },
): Promise<FinancePayout> {
  const { data } = await apiClient.patch<ApiSuccess<FinancePayout>>(
    `/admin/finance/payouts/${id}/review`,
    payload,
  );
  return data.data;
}

export async function updateWalletStatus(
  walletId: string,
  status: 'active' | 'frozen' | 'closed',
): Promise<WalletDetail> {
  const { data } = await apiClient.patch<ApiSuccess<WalletDetail>>(
    `/admin/finance/wallets/${walletId}/status`,
    { status },
  );
  return data.data;
}
