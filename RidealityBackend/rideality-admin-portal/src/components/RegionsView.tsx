import React, { useState } from 'react';
import { Globe, Plus, Search, CheckCircle, XCircle, Trash2, ArrowLeftRight, Sparkles } from 'lucide-react';
import { Region, RegionStatus } from '../types';

interface RegionsViewProps {
  regions: Region[];
  setRegions: React.Dispatch<React.SetStateAction<Region[]>>;
  addDispatchLog: (type: 'pickup' | 'dropoff' | 'request' | 'cancel' | 'payment', message: string) => void;
  searchTerm: string;
}

export default function RegionsView({ regions, setRegions, addDispatchLog, searchTerm }: RegionsViewProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCountry, setNewCountry] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newCurrency, setNewCurrency] = useState('');
  const [newPrefix, setNewPrefix] = useState('');

  const filteredRegions = regions.filter(r =>
    r.country.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.currency.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleToggleStatus = (id: string, country: string, currentStatus: RegionStatus) => {
    const nextStatus: RegionStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
    setRegions(prev => prev.map(r => r.id === id ? { ...r, status: nextStatus } : r));
    addDispatchLog('request', `Region operational status updated: ${country} set to ${nextStatus.toUpperCase()}`);
  };

  const handleAddRegionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCountry || !newCode || !newCurrency) return;

    const newRegion: Region = {
      id: `reg-${Date.now()}`,
      country: newCountry,
      code: newCode.toUpperCase(),
      currency: newCurrency.toUpperCase(),
      phonePrefix: newPrefix.startsWith('+') ? newPrefix : `+${newPrefix}`,
      status: 'Active'
    };

    setRegions(prev => [...prev, newRegion]);
    addDispatchLog('request', `New market region onboarded: ${newCountry} (${newRegion.code}) configured for standard operations.`);
    
    // Reset fields
    setNewCountry('');
    setNewCode('');
    setNewCurrency('');
    setNewPrefix('');
    setShowAddModal(false);
  };

  const handleDeleteRegion = (id: string, country: string) => {
    if (confirm(`Are you sure you want to offboard ${country} region? This will halt dispatching within this zone.`)) {
      setRegions(prev => prev.filter(r => r.id !== id));
      addDispatchLog('cancel', `Market region offboarded: ${country} operations disassembled.`);
    }
  };

  return (
    <div id="regions-view-container" className="space-y-6">
      {/* View Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.005)]">
        <div>
          <h2 className="text-base font-bold font-display text-slate-800">Operational Market Regions</h2>
          <p className="text-xs text-slate-400">Onboard and configure operational territories, country-specific phone formats, and pricing currencies</p>
        </div>
        <button
          id="onboard-region-btn"
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm shadow-blue-100 transition-all flex items-center gap-2 self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Onboard New Region</span>
        </button>
      </div>

      {/* Regions Grid/Table */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="p-4 pl-6">Region Name</th>
                <th className="p-4">Region Code</th>
                <th className="p-4">Local Currency</th>
                <th className="p-4">Dialing Prefix</th>
                <th className="p-4">System Status</th>
                <th className="p-4 text-right pr-6">Management Operations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[13px] text-slate-600 font-medium">
              {filteredRegions.length > 0 ? (
                filteredRegions.map((region) => (
                  <tr key={region.id} className="hover:bg-slate-50/40 transition-colors">
                    {/* Country Name */}
                    <td className="p-4 pl-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100/50">
                          <Globe className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-slate-800">{region.country}</span>
                      </div>
                    </td>

                    {/* Region Code */}
                    <td className="p-4 font-mono text-xs font-semibold uppercase text-slate-500">
                      {region.code}
                    </td>

                    {/* Currency */}
                    <td className="p-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold">
                          {region.currency}
                        </span>
                        <span className="text-[11px] text-slate-400">Dispatch Unit</span>
                      </div>
                    </td>

                    {/* Prefix */}
                    <td className="p-4 font-mono text-xs text-slate-500">
                      {region.phonePrefix}
                    </td>

                    {/* System Status */}
                    <td className="p-4">
                      <button
                        onClick={() => handleToggleStatus(region.id, region.country, region.status)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                          region.status === 'Active'
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-100/50'
                            : 'bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-200/50'
                        }`}
                        title="Click to toggle activation status"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${region.status === 'Active' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                        <span>{region.status}</span>
                      </button>
                    </td>

                    {/* Management Operations */}
                    <td className="p-4 text-right pr-6">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggleStatus(region.id, region.country, region.status)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all border border-transparent hover:border-blue-100"
                          title="Toggle Status Override"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteRegion(region.id, region.country)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all border border-transparent hover:border-rose-100"
                          title="Offboard Region"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400 text-xs">
                    No country region found matching "{searchTerm}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Region Drawer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-100 p-6 w-full max-w-md shadow-2xl relative">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-slate-800 text-sm">Onboard Operational Region</h3>
                <p className="text-[11px] text-slate-400">Initialize a new country market zone</p>
              </div>
            </div>

            <form onSubmit={handleAddRegionSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Country Name</label>
                <input
                  type="text"
                  required
                  value={newCountry}
                  onChange={(e) => setNewCountry(e.target.value)}
                  placeholder="e.g. Saudi Arabia"
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Region ISO Code</label>
                  <input
                    type="text"
                    required
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="e.g. SA"
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Pricing Currency</label>
                  <input
                    type="text"
                    required
                    value={newCurrency}
                    onChange={(e) => setNewCurrency(e.target.value)}
                    placeholder="e.g. SAR"
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Country Phone Prefix</label>
                <input
                  type="text"
                  required
                  value={newPrefix}
                  onChange={(e) => setNewPrefix(e.target.value)}
                  placeholder="e.g. +966"
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500"
                />
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
                  <span>Onboard Market</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
