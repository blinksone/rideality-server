import React, { useState } from 'react';
import { Truck, Plus, Search, CheckCircle2, ShieldAlert, Sparkles, Building2, User } from 'lucide-react';
import { FleetCompany, FleetStatus } from '../types';

interface FleetViewProps {
  fleets: FleetCompany[];
  setFleets: React.Dispatch<React.SetStateAction<FleetCompany[]>>;
  addDispatchLog: (type: 'pickup' | 'dropoff' | 'request' | 'cancel' | 'payment', message: string) => void;
  searchTerm: string;
}

export default function FleetView({ fleets, setFleets, addDispatchLog, searchTerm }: FleetViewProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newRegion, setNewRegion] = useState('Pakistan (PK) — PKR');
  const [newOwner, setNewOwner] = useState('');
  const [newTaxId, setNewTaxId] = useState('');

  const filteredFleets = fleets.filter(f =>
    f.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.owner.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.region.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleToggleStatus = (id: string, name: string, currentStatus: FleetStatus) => {
    let nextStatus: FleetStatus = 'Active';
    if (currentStatus === 'Active') nextStatus = 'Suspended';
    else if (currentStatus === 'Suspended') nextStatus = 'Pending';
    else nextStatus = 'Active';

    setFleets(prev => prev.map(f => f.id === id ? { ...f, status: nextStatus } : f));
    addDispatchLog('request', `Fleet partnership status modified: ${name} is now marked ${nextStatus.toUpperCase()}`);
  };

  const handleAddFleetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName || !newOwner) return;

    const newFleet: FleetCompany = {
      id: `flt-${Date.now()}`,
      companyName: newCompanyName,
      status: 'Active',
      region: newRegion,
      owner: newOwner,
      taxId: newTaxId || `TX-${Math.floor(100000 + Math.random() * 900000)}`,
      created: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    };

    setFleets(prev => [newFleet, ...prev]);
    addDispatchLog('request', `New fleet corporate partner onboarded: ${newCompanyName} registered under tax ID ${newFleet.taxId}.`);

    setNewCompanyName('');
    setNewOwner('');
    setNewTaxId('');
    setShowAddModal(false);
  };

  return (
    <div id="fleet-view-container" className="space-y-6">
      {/* View Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-base font-bold font-display text-slate-800">Corporate Fleet Partnerships</h2>
          <p className="text-xs text-slate-400">Review vehicle fleet corporate organizations, registered taxation IDs, region allocations, and platform statuses</p>
        </div>
        <button
          id="register-fleet-btn"
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-2 self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Onboard Fleet Company</span>
        </button>
      </div>

      {/* Fleets Table */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="p-4 pl-6">Company Entity</th>
                <th className="p-4">Operational Region</th>
                <th className="p-4">Filer / Legal Owner</th>
                <th className="p-4">Taxation Register</th>
                <th className="p-4">Onboarded On</th>
                <th className="p-4">Partnership Status</th>
                <th className="p-4 text-right pr-6">Quick Override Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[13px] text-slate-600 font-medium">
              {filteredFleets.length > 0 ? (
                filteredFleets.map((fleet) => (
                  <tr key={fleet.id} className="hover:bg-slate-50/40 transition-colors">
                    {/* Fleet Name */}
                    <td className="p-4 pl-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100/50">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-slate-800">{fleet.companyName}</span>
                      </div>
                    </td>

                    {/* Region */}
                    <td className="p-4 text-xs font-semibold text-slate-500">
                      {fleet.region}
                    </td>

                    {/* Owner */}
                    <td className="p-4 text-xs">
                      <div className="flex items-center gap-2 text-slate-600">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>{fleet.owner}</span>
                      </div>
                    </td>

                    {/* Tax ID */}
                    <td className="p-4 font-mono text-xs text-slate-500">
                      {fleet.taxId || '—'}
                    </td>

                    {/* Created Date */}
                    <td className="p-4 text-slate-400 text-xs font-mono">
                      {fleet.created}
                    </td>

                    {/* Status Badge */}
                    <td className="p-4">
                      <button
                        onClick={() => handleToggleStatus(fleet.id, fleet.companyName, fleet.status)}
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold transition-all ${
                          fleet.status === 'Active'
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-100/50'
                            : fleet.status === 'Pending'
                            ? 'bg-amber-50 text-amber-600 border border-amber-100 hover:bg-amber-100/50'
                            : 'bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100/50'
                        }`}
                        title="Click to toggle partnership status"
                      >
                        <span className={`w-1 h-1 rounded-full ${
                          fleet.status === 'Active' ? 'bg-emerald-500' :
                          fleet.status === 'Pending' ? 'bg-amber-500' : 'bg-rose-500'
                        }`}></span>
                        <span>{fleet.status}</span>
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="p-4 text-right pr-6">
                      <button
                        id={`fleet-override-btn-${fleet.id}`}
                        onClick={() => handleToggleStatus(fleet.id, fleet.companyName, fleet.status)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-100 hover:bg-slate-50 text-slate-600 hover:text-slate-800 transition-all"
                      >
                        Override Status
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400 text-xs">
                    No fleet companies found matching "{searchTerm}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Fleet Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-100 p-6 w-full max-w-md shadow-2xl relative">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-slate-800 text-sm">Register Fleet Company</h3>
                <p className="text-[11px] text-slate-400">Onboard a corporate fleet supplier partner</p>
              </div>
            </div>

            <form onSubmit={handleAddFleetSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Company Legal Entity Name</label>
                <input
                  type="text"
                  required
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  placeholder="e.g. Al-Futtaim Logistics"
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Legal Owner Name</label>
                <input
                  type="text"
                  required
                  value={newOwner}
                  onChange={(e) => setNewOwner(e.target.value)}
                  placeholder="e.g. Irfan Fleet"
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Operational Region</label>
                  <select
                    value={newRegion}
                    onChange={(e) => setNewRegion(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 font-medium"
                  >
                    <option value="Pakistan (PK) — PKR">Pakistan (PK)</option>
                    <option value="AB (DUBAI) — AED">Dubai (AED)</option>
                    <option value="United States (US) — USD">United States (USD)</option>
                    <option value="oman (OM) — OMR">Oman (OMR)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Taxation Register ID</label>
                  <input
                    type="text"
                    value={newTaxId}
                    onChange={(e) => setNewTaxId(e.target.value)}
                    placeholder="e.g. TX-99210"
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-500 hover:text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Onboard Partner</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
