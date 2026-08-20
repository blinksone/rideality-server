import React, { useState } from 'react';
import {
  Wallet,
  Landmark,
  FileText,
  Coins,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle,
  XCircle,
  Plus,
  Filter,
  Sparkles,
  Search,
  Check,
  X,
  CreditCard
} from 'lucide-react';
import { Wallet as WalletType, Adjustment, Payout, OwnerType, RequestStatus } from '../types';

interface FinanceViewProps {
  wallets: WalletType[];
  setWallets: React.Dispatch<React.SetStateAction<WalletType[]>>;
  adjustments: Adjustment[];
  setAdjustments: React.Dispatch<React.SetStateAction<Adjustment[]>>;
  payouts: Payout[];
  setPayouts: React.Dispatch<React.SetStateAction<Payout[]>>;
  addDispatchLog: (type: 'pickup' | 'dropoff' | 'request' | 'cancel' | 'payment', message: string) => void;
  searchTerm: string;
  subTab: 'overview' | 'wallets' | 'adjustments' | 'payouts';
  setSubTab: (tab: 'overview' | 'wallets' | 'adjustments' | 'payouts') => void;
}

export default function FinanceView({
  wallets,
  setWallets,
  adjustments,
  setAdjustments,
  payouts,
  setPayouts,
  addDispatchLog,
  searchTerm,
  subTab,
  setSubTab
}: FinanceViewProps) {
  // Filtering states
  const [currencyFilter, setCurrencyFilter] = useState('ALL');
  const [ownerTypeFilter, setOwnerTypeFilter] = useState('ALL');

  // Adjustment form states
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [adjWalletId, setAdjWalletId] = useState('');
  const [adjType, setAdjType] = useState<'Credit' | 'Debit'>('Credit');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');

  // Filter Wallet logic
  const filteredWallets = wallets.filter(w => {
    const matchesSearch = w.owner.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          w.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          w.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCurrency = currencyFilter === 'ALL' || w.currency === currencyFilter;
    const matchesOwnerType = ownerTypeFilter === 'ALL' || w.ownerType === ownerTypeFilter;
    return matchesSearch && matchesCurrency && matchesOwnerType;
  });

  // Calculate high-fidelity aggregated sums per currency for overview
  const currenciesSupported = ['AED', 'PKR', 'USD', 'RUP', 'OMR'];
  const ledgerMetrics = currenciesSupported.map(curr => {
    const matchedWallets = wallets.filter(w => w.currency === curr);
    const availableSum = matchedWallets.reduce((sum, w) => sum + w.available, 0);
    const pendingSum = matchedWallets.reduce((sum, w) => sum + w.pending, 0);
    return { currency: curr, available: availableSum, pending: pendingSum, count: matchedWallets.length };
  });

  // Freeze/Unfreeze wallet
  const handleToggleWalletStatus = (id: string, owner: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'Active' ? 'Frozen' : 'Active';
    setWallets(prev => prev.map(w => w.id === id ? { ...w, status: nextStatus as any } : w));
    addDispatchLog('cancel', `Wallet security override: Account wallet belonging to ${owner} set to ${nextStatus.toUpperCase()}`);
  };

  // Submit Adjustment Request
  const handleRequestAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjWalletId || !adjAmount || !adjReason) return;

    const selectedWallet = wallets.find(w => w.id === adjWalletId);
    if (!selectedWallet) {
      alert("Invalid Wallet ID specified.");
      return;
    }

    const newAdjustment: Adjustment = {
      id: `adj-${Date.now()}`,
      walletId: adjWalletId,
      owner: selectedWallet.owner,
      type: adjType,
      reason: adjReason,
      status: 'Pending',
      amount: parseFloat(adjAmount),
      currency: selectedWallet.currency,
      requestedBy: 'Irfan Finince',
      created: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    };

    setAdjustments(prev => [newAdjustment, ...prev]);
    addDispatchLog('request', `New balance adjustment request filed for ${selectedWallet.owner}: ${adjType} of ${newAdjustment.amount} ${newAdjustment.currency}`);
    
    // Reset fields
    setAdjWalletId('');
    setAdjAmount('');
    setAdjReason('');
    setShowAdjModal(false);
  };

  // Approve Ledger Adjustment (Mutates live wallet available balance!)
  const handleApproveAdjustment = (id: string) => {
    const adj = adjustments.find(a => a.id === id);
    if (!adj || adj.status !== 'Pending') return;

    // Mutate wallets
    setWallets(prev => prev.map(w => {
      if (w.id === adj.walletId) {
        const adjustmentVal = adj.type === 'Credit' ? adj.amount : -adj.amount;
        const nextAvailable = Math.max(0, w.available + adjustmentVal);
        return {
          ...w,
          available: nextAvailable,
          lastTransaction: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        };
      }
      return w;
    }));

    // Mark adjustment as approved
    setAdjustments(prev => prev.map(a => a.id === id ? { ...a, status: 'Approved' } : a));
    addDispatchLog('payment', `Balance adjustment APPROVED and settled. ${adj.type === 'Credit' ? 'Added' : 'Deducted'} ${adj.amount} ${adj.currency} in ${adj.owner}'s wallet.`);
  };

  // Reject Ledger Adjustment
  const handleRejectAdjustment = (id: string) => {
    setAdjustments(prev => prev.map(a => a.id === id ? { ...a, status: 'Rejected' } : a));
    addDispatchLog('cancel', `Ledger adjustment request REJECTED by financial compliance officer.`);
  };

  // Approve Payout Request (Mutates live wallet balances!)
  const handleApprovePayout = (id: string) => {
    const pay = payouts.find(p => p.id === id);
    if (!pay || pay.status !== 'Pending') return;

    // Find the wallet and verify funds are available
    const wallet = wallets.find(w => w.id === pay.walletId);
    if (wallet && wallet.available < pay.amount) {
      alert(`Insufficient funds in wallet of ${pay.owner}. Available: ${wallet.available} ${wallet.currency}`);
      return;
    }

    // Mutate wallets - subtract from available
    setWallets(prev => prev.map(w => {
      if (w.id === pay.walletId) {
        return {
          ...w,
          available: Math.max(0, w.available - pay.amount),
          lastTransaction: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        };
      }
      return w;
    }));

    // Mark payout as approved
    setPayouts(prev => prev.map(p => p.id === id ? { ...p, status: 'Approved' } : p));
    addDispatchLog('payment', `Payout of ${pay.amount} ${pay.currency} APPROVED for ${pay.owner}. Direct transfer processed to bank accounts.`);
  };

  // Reject Payout Request
  const handleRejectPayout = (id: string) => {
    setPayouts(prev => prev.map(p => p.id === id ? { ...p, status: 'Rejected' } : p));
    addDispatchLog('cancel', `Payout request of ${payouts.find(p => p.id === id)?.amount} REJECTED by administrative desk.`);
  };

  return (
    <div id="finance-view-container" className="space-y-6">
      {/* Sub Tabs */}
      <div className="flex border-b border-slate-100 bg-white p-2.5 rounded-2xl shadow-sm gap-2">
        <button
          id="finance-tab-overview"
          onClick={() => setSubTab('overview')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            subTab === 'overview'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>Platform Ledger</span>
        </button>

        <button
          id="finance-tab-wallets"
          onClick={() => setSubTab('wallets')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            subTab === 'wallets'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Landmark className="w-4 h-4" />
          <span>Wallet Accounts</span>
        </button>

        <button
          id="finance-tab-adjustments"
          onClick={() => setSubTab('adjustments')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            subTab === 'adjustments'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Ledger Adjustments</span>
        </button>

        <button
          id="finance-tab-payouts"
          onClick={() => setSubTab('payouts')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            subTab === 'payouts'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Coins className="w-4 h-4" />
          <span>Payout Approvals</span>
        </button>
      </div>

      {/* View 1: Platform Ledger (Overview) */}
      {subTab === 'overview' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <h2 className="text-base font-bold font-display text-slate-800">Operational Balances Summary</h2>
            <p className="text-xs text-slate-400">Aggregated liquid capital and pending driver escrows tracked per regional market currency</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {ledgerMetrics.map((met) => (
              <div key={met.currency} className="bg-white border border-slate-100/80 rounded-2xl p-5 hover:shadow-sm transition-all space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-400 text-xs bg-slate-50 border border-slate-100 px-2.5 py-0.5 rounded">
                    {met.currency} ZONE
                  </span>
                  <span className="text-[11px] text-slate-400 font-semibold">{met.count} Active Wallets</span>
                </div>

                <div className="space-y-1 pt-1">
                  <span className="text-[11px] text-slate-400 uppercase font-semibold">Available Liquid Reserves</span>
                  <p className="text-2xl font-bold text-slate-800 font-display">
                    {met.available.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-50 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Escrow Pending:</span>
                  <span className="font-bold text-slate-600">
                    {met.pending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {met.currency}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View 2: Wallet Accounts */}
      {subTab === 'wallets' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div>
              <h2 className="text-base font-bold font-display text-slate-800">Ledger Wallets Register</h2>
              <p className="text-xs text-slate-400">Audit specific ride-share operators and fleet account wallet lines</p>
            </div>

            {/* In-view Filtering */}
            <div className="flex flex-wrap gap-2.5">
              <select
                value={currencyFilter}
                onChange={(e) => setCurrencyFilter(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white font-semibold text-slate-600 focus:outline-none"
              >
                <option value="ALL">All Currencies</option>
                {currenciesSupported.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              <select
                value={ownerTypeFilter}
                onChange={(e) => setOwnerTypeFilter(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white font-semibold text-slate-600 focus:outline-none"
              >
                <option value="ALL">All Owner Types</option>
                <option value="User">Operators</option>
                <option value="Fleet">Fleets</option>
              </select>
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="p-4 pl-6">Wallet Holder</th>
                    <th className="p-4">Owner Class</th>
                    <th className="p-4">Available Balance</th>
                    <th className="p-4">Pending Escrow</th>
                    <th className="p-4">Last Activity</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right pr-6">Override Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[13px] text-slate-600 font-medium">
                  {filteredWallets.length > 0 ? (
                    filteredWallets.map((wallet) => (
                      <tr key={wallet.id} className="hover:bg-slate-50/40 transition-colors">
                        {/* Owner & Email */}
                        <td className="p-4 pl-6">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800">{wallet.owner}</span>
                            <span className="text-xs text-slate-400 font-normal">{wallet.email}</span>
                          </div>
                        </td>

                        {/* Type */}
                        <td className="p-4">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            wallet.ownerType === 'Fleet'
                              ? 'bg-purple-50 text-purple-600 border border-purple-100'
                              : 'bg-blue-50 text-blue-600 border border-blue-100'
                          }`}>
                            {wallet.ownerType}
                          </span>
                        </td>

                        {/* Available Balance */}
                        <td className="p-4 font-bold text-slate-800 font-display">
                          {wallet.available.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="font-mono text-xs text-slate-400 font-semibold">{wallet.currency}</span>
                        </td>

                        {/* Pending Escrow */}
                        <td className="p-4 text-slate-500 font-display">
                          {wallet.pending.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="font-mono text-xs text-slate-400 font-semibold">{wallet.currency}</span>
                        </td>

                        {/* Last activity */}
                        <td className="p-4 text-slate-400 text-xs font-mono">
                          {wallet.lastTransaction}
                        </td>

                        {/* Status */}
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${
                            wallet.status === 'Active'
                              ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                              : 'bg-rose-50 text-rose-600 border border-rose-100'
                          }`}>
                            <span className={`w-1 h-1 rounded-full ${wallet.status === 'Active' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                            <span>{wallet.status}</span>
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="p-4 text-right pr-6">
                          <button
                            id={`wallet-toggle-${wallet.id}`}
                            onClick={() => handleToggleWalletStatus(wallet.id, wallet.owner, wallet.status)}
                            className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all border ${
                              wallet.status === 'Active'
                                ? 'text-rose-600 border-rose-100 hover:bg-rose-50'
                                : 'text-emerald-600 border-emerald-100 hover:bg-emerald-50'
                            }`}
                          >
                            {wallet.status === 'Active' ? 'Freeze' : 'Unfreeze'}
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-slate-400 text-xs">
                        No ledger wallets matching "{searchTerm}"
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* View 3: Ledger Adjustments */}
      {subTab === 'adjustments' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div>
              <h2 className="text-base font-bold font-display text-slate-800">Ledger Adjustment History</h2>
              <p className="text-xs text-slate-400">View direct credit and debit balance adjustment tickets filed by administrative operators</p>
            </div>
            <button
              id="file-adjustment-btn"
              onClick={() => setShowAdjModal(true)}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-2 self-start md:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>File Balance Adjustment</span>
            </button>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="p-4 pl-6">Target Wallet Owner</th>
                    <th className="p-4">Adjustment Scope</th>
                    <th className="p-4">Type</th>
                    <th className="p-4">Delta Amount</th>
                    <th className="p-4">Filer</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right pr-6">Settlement Decisions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[13px] text-slate-600 font-medium">
                  {adjustments.map((adj) => (
                    <tr key={adj.id} className="hover:bg-slate-50/40 transition-colors">
                      {/* Target Wallet Owner */}
                      <td className="p-4 pl-6">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800">{adj.owner}</span>
                          <span className="text-[10.5px] font-mono text-slate-400">{adj.walletId}</span>
                        </div>
                      </td>

                      {/* Reason */}
                      <td className="p-4 text-xs text-slate-500 font-normal max-w-xs truncate" title={adj.reason}>
                        {adj.reason}
                      </td>

                      {/* Type */}
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded ${
                          adj.type === 'Credit'
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                            : 'bg-rose-50 text-rose-600 border border-rose-100'
                        }`}>
                          {adj.type === 'Credit' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                          {adj.type}
                        </span>
                      </td>

                      {/* Delta Amount */}
                      <td className="p-4 font-bold font-display text-slate-800">
                        {adj.type === 'Credit' ? '+' : '-'}{adj.amount.toFixed(2)} <span className="font-mono text-xs text-slate-400 font-semibold">{adj.currency}</span>
                      </td>

                      {/* Filer */}
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="text-xs text-slate-600 font-semibold">{adj.requestedBy}</span>
                          <span className="text-[10px] font-mono text-slate-400">{adj.created}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${
                          adj.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                          adj.status === 'Rejected' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                          'bg-amber-50 text-amber-600 border border-amber-100'
                        }`}>
                          <span>{adj.status}</span>
                        </span>
                      </td>

                      {/* Decision buttons */}
                      <td className="p-4 text-right pr-6">
                        {adj.status === 'Pending' ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              id={`approve-adj-${adj.id}`}
                              onClick={() => handleApproveAdjustment(adj.id)}
                              className="p-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-600 rounded-lg transition-all"
                              title="Approve Settlement"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              id={`reject-adj-${adj.id}`}
                              onClick={() => handleRejectAdjustment(adj.id)}
                              className="p-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 rounded-lg transition-all"
                              title="Reject Adjustment"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-mono">Ledger Settled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* View 4: Payout Approvals */}
      {subTab === 'payouts' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <h2 className="text-base font-bold font-display text-slate-800">Fleet Payout Approvals Desk</h2>
            <p className="text-xs text-slate-400">Release pending fleet company wallet balances to their verified external bank account details</p>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="p-4 pl-6">Fleet Company</th>
                    <th className="p-4">Bank Routing & IBAN</th>
                    <th className="p-4">Disbursement Amount</th>
                    <th className="p-4">Requested Date</th>
                    <th className="p-4">Disbursement Status</th>
                    <th className="p-4 text-right pr-6">Execute Settlement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[13px] text-slate-600 font-medium">
                  {payouts.map((pay) => (
                    <tr key={pay.id} className="hover:bg-slate-50/40 transition-colors">
                      {/* Fleet Name */}
                      <td className="p-4 pl-6">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800">{pay.owner}</span>
                          <span className="text-[10px] font-mono text-slate-400">Filer: {pay.requestedBy}</span>
                        </div>
                      </td>

                      {/* Bank details */}
                      <td className="p-4 text-xs font-mono text-slate-500 max-w-xs truncate" title={pay.bankDetails}>
                        {pay.bankDetails}
                      </td>

                      {/* Amount */}
                      <td className="p-4 font-bold font-display text-slate-800">
                        {pay.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="font-mono text-xs text-slate-400 font-semibold">{pay.currency}</span>
                      </td>

                      {/* Date */}
                      <td className="p-4 text-slate-400 text-xs font-mono">
                        {pay.created}
                      </td>

                      {/* Status */}
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${
                          pay.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                          pay.status === 'Rejected' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                          'bg-amber-50 text-amber-600 border border-amber-100'
                        }`}>
                          <span>{pay.status}</span>
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right pr-6">
                        {pay.status === 'Pending' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              id={`reject-pay-${pay.id}`}
                              onClick={() => handleRejectPayout(pay.id)}
                              className="px-3 py-1.5 text-xs text-rose-600 border border-rose-100 hover:bg-rose-50 rounded-xl font-semibold transition-all"
                            >
                              Reject
                            </button>
                            <button
                              id={`approve-pay-${pay.id}`}
                              onClick={() => handleApprovePayout(pay.id)}
                              className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold shadow-sm transition-all flex items-center gap-1"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Disburse Funds</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-mono">Funds Settled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Adjustment Form Modal */}
      {showAdjModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-100 p-6 w-full max-w-md shadow-2xl relative">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-slate-800 text-sm">File Balance Adjustment Ticket</h3>
                <p className="text-[11px] text-slate-400">Inject dynamic credits or debits directly to a ledger wallet</p>
              </div>
            </div>

            <form onSubmit={handleRequestAdjustment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Target Wallet Account</label>
                <select
                  required
                  value={adjWalletId}
                  onChange={(e) => setAdjWalletId(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 font-medium"
                >
                  <option value="">-- Choose Account --</option>
                  {wallets.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.owner} ({w.currency} Wallet) - Bal: {w.available.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Adjustment Class</label>
                  <div className="flex rounded-xl border border-slate-200 overflow-hidden text-xs font-bold p-1 gap-1">
                    <button
                      type="button"
                      onClick={() => setAdjType('Credit')}
                      className={`flex-1 py-1.5 rounded-lg text-center transition-all ${
                        adjType === 'Credit' ? 'bg-emerald-55 text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Credit (+)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjType('Debit')}
                      className={`flex-1 py-1.5 rounded-lg text-center transition-all ${
                        adjType === 'Debit' ? 'bg-rose-55 text-rose-600 bg-rose-50' : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Debit (-)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Amount</label>
                  <input
                    type="number"
                    step="any"
                    required
                    min="1"
                    value={adjAmount}
                    onChange={(e) => setAdjAmount(e.target.value)}
                    placeholder="e.g. 150.00"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Justification Reason</label>
                <textarea
                  required
                  rows={3}
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="e.g. Compensation credit for driver app downtime incident"
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 font-normal leading-normal"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAdjModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-500 hover:text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Request Adjustment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
