import React, { useState } from 'react';
import { Users, Shield, Key, Plus, Search, ShieldCheck, UserX, UserCheck, ShieldAlert, BadgeCheck } from 'lucide-react';
import { User, UserStatus } from '../types';

interface UsersViewProps {
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  addDispatchLog: (type: 'pickup' | 'dropoff' | 'request' | 'cancel' | 'payment', message: string) => void;
  searchTerm: string;
  subTab: 'users' | 'roles' | 'permissions';
  setSubTab: (tab: 'users' | 'roles' | 'permissions') => void;
}

export default function UsersView({
  users,
  setUsers,
  addDispatchLog,
  searchTerm,
  subTab,
  setSubTab
}: UsersViewProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState('Fleet Owner');

  // Static Roles with description & authorized paths
  const systemRoles = [
    { name: 'Super Admin', desc: 'Full root access to all console systems, credentials, and financial ledgers.', userCount: users.filter(u => u.roles.includes('Super Admin') || u.roles.includes('Admin')).length, permissions: ['All System Permissions'] },
    { name: 'Admin', desc: 'Manage regions, onboarding, user rosters, and general dispatcher telemetry.', userCount: users.filter(u => u.roles.includes('Admin')).length, permissions: ['REGIONS_CREATE', 'USER_BAN', 'FLEET_UPDATE', 'SUPPORT_REPLY'] },
    { name: 'Finance Officer', desc: 'Exclusively audit ledger balances, request financial adjustments, and execute fleet payouts.', userCount: users.filter(u => u.roles.includes('Finance Officer')).length, permissions: ['FINANCE_ADJUST', 'PAYOUT_APPROVE'] },
    { name: 'Fleet Owner', desc: 'Onboard vehicle assets, request driver invite tokens, and manage associated revenue wallets.', userCount: users.filter(u => u.roles.includes('Fleet Owner')).length, permissions: ['FLEET_DRIVERS_WRITE', 'PAYOUT_REQUEST'] },
    { name: 'Support Agent', desc: 'Resolve driver disputes, reply to GPS logs alerts, and file feedback tags.', userCount: users.filter(u => u.roles.includes('Support Agent')).length, permissions: ['SUPPORT_REPLY'] }
  ];

  // Permissions Ledger State representation
  const [permissionsLedger, setPermissionsLedger] = useState([
    { code: 'REGIONS_CREATE', desc: 'Onboard new country markets & set pricing currency', roles: ['Admin', 'Super Admin'] },
    { code: 'USER_BAN', desc: 'Banish fraudulent or offending operators and drivers', roles: ['Admin', 'Super Admin'] },
    { code: 'FINANCE_ADJUST', desc: 'Process direct debit or credit balance adjustments', roles: ['Finance Officer', 'Super Admin'] },
    { code: 'PAYOUT_APPROVE', desc: 'Execute real money payouts to fleet bank accounts', roles: ['Finance Officer', 'Super Admin'] },
    { code: 'FLEET_UPDATE', desc: 'Register tax IDs and activate or suspend fleet companies', roles: ['Admin', 'Super Admin'] },
    { code: 'SUPPORT_REPLY', desc: 'Converse inside driver GPS logs support tickets', roles: ['Support Agent', 'Admin', 'Super Admin'] }
  ]);

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.phone.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.roles.some(r => r.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleToggleStatus = (id: string, name: string, currentStatus: UserStatus) => {
    const nextStatus: UserStatus = currentStatus === 'Active' ? 'Banned' : 'Active';
    setUsers(prev => prev.map(u => u.id === id ? { ...u, status: nextStatus } : u));
    addDispatchLog('cancel', `User roster security status modified: ${name} is now ${nextStatus.toUpperCase()}`);
  };

  const handleAddUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newEmail || !newPhone) return;

    const newUser: User = {
      id: `usr-${Date.now()}`,
      name: newName,
      email: newEmail,
      phone: newPhone.startsWith('+') ? newPhone : `+${newPhone}`,
      status: 'Active',
      roles: [newRole],
      joined: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    };

    setUsers(prev => [newUser, ...prev]);
    addDispatchLog('request', `New user registered: ${newName} joined with ${newRole} credentials.`);

    setNewName('');
    setNewEmail('');
    setNewPhone('');
    setNewRole('Fleet Owner');
    setShowAddModal(false);
  };

  // Toggle roles inside the permissions editor
  const handleTogglePermissionRole = (permCode: string, roleName: string) => {
    setPermissionsLedger(prev => prev.map(p => {
      if (p.code === permCode) {
        const alreadyHas = p.roles.includes(roleName);
        const nextRoles = alreadyHas 
          ? p.roles.filter(r => r !== roleName) 
          : [...p.roles, roleName];
        addDispatchLog('request', `Permission ${permCode} updated for role ${roleName}: ${!alreadyHas ? 'GRANTED' : 'REVOKED'}`);
        return { ...p, roles: nextRoles };
      }
      return p;
    }));
  };

  return (
    <div id="users-view-container" className="space-y-6">
      {/* Tab Navigation for Access Group */}
      <div className="flex border-b border-slate-100 bg-white p-2.5 rounded-2xl shadow-sm gap-2">
        <button
          id="access-tab-users"
          onClick={() => setSubTab('users')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            subTab === 'users'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Users & Roster</span>
        </button>

        <button
          id="access-tab-roles"
          onClick={() => setSubTab('roles')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            subTab === 'roles'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Roles Configuration</span>
        </button>

        <button
          id="access-tab-permissions"
          onClick={() => setSubTab('permissions')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            subTab === 'permissions'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Key className="w-4 h-4" />
          <span>Permissions Ledger</span>
        </button>
      </div>

      {/* Subview 1: Users & Roster */}
      {subTab === 'users' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div>
              <h2 className="text-base font-bold font-display text-slate-800">System Operator & Driver Accounts</h2>
              <p className="text-xs text-slate-400">Review access, security states, phone contacts, and roles for Rideality operators</p>
            </div>
            <button
              id="create-operator-btn"
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-2 self-start md:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Create Operator User</span>
            </button>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="p-4 pl-6">Operator Name</th>
                    <th className="p-4">Contact Phone</th>
                    <th className="p-4">Assigned Roles</th>
                    <th className="p-4">Date Joined</th>
                    <th className="p-4">Security Status</th>
                    <th className="p-4 text-right pr-6">Quick Override Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[13px] text-slate-600 font-medium">
                  {filteredUsers.length > 0 ? (
                    filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-50/40 transition-colors">
                        {/* Name & Email */}
                        <td className="p-4 pl-6">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800">{user.name}</span>
                            <span className="text-xs text-slate-400 font-normal">{user.email}</span>
                          </div>
                        </td>

                        {/* Phone */}
                        <td className="p-4 font-mono text-xs text-slate-500">
                          {user.phone}
                        </td>

                        {/* Roles */}
                        <td className="p-4">
                          <div className="flex flex-wrap gap-1">
                            {user.roles.map((role) => (
                              <span
                                key={role}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  role === 'Admin' || role === 'Super Admin'
                                    ? 'bg-blue-50 text-blue-600 border border-blue-100'
                                    : role === 'Finance Officer'
                                    ? 'bg-amber-50 text-amber-600 border border-amber-100'
                                    : role === 'Support Agent'
                                    ? 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {role}
                              </span>
                            ))}
                          </div>
                        </td>

                        {/* Joined Date */}
                        <td className="p-4 text-slate-400 text-xs font-mono">
                          {user.joined}
                        </td>

                        {/* Security Status */}
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${
                            user.status === 'Active'
                              ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                              : 'bg-rose-50 text-rose-600 border border-rose-100'
                          }`}>
                            {user.status === 'Active' ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                            <span>{user.status}</span>
                          </span>
                        </td>

                        {/* Quick Actions */}
                        <td className="p-4 text-right pr-6">
                          <button
                            id={`user-toggle-status-${user.id}`}
                            onClick={() => handleToggleStatus(user.id, user.name, user.status)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                              user.status === 'Active'
                                ? 'text-rose-600 hover:bg-rose-50 border border-rose-100/50 hover:border-rose-200'
                                : 'text-emerald-600 hover:bg-emerald-50 border border-emerald-100/50 hover:border-emerald-200'
                            }`}
                          >
                            {user.status === 'Active' ? 'Ban Operator' : 'Reinstate'}
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-slate-400 text-xs">
                        No operator matching "{searchTerm}"
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Subview 2: Roles Configuration */}
      {subTab === 'roles' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <h2 className="text-base font-bold font-display text-slate-800">Operational Role Definitions</h2>
            <p className="text-xs text-slate-400">Review credential classes, target scopes, and active system user counts per role</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {systemRoles.map((role) => (
              <div key={role.name} className="bg-white border border-slate-100 rounded-2xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <span className="font-display font-bold text-slate-800">{role.name}</span>
                    </div>
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
                      {role.userCount} Operators
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed font-normal">{role.desc}</p>
                </div>

                <div className="pt-4 border-t border-slate-50">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-wider">Authorized Privileges</span>
                  <div className="flex flex-wrap gap-1.5">
                    {role.permissions.map((p) => (
                      <span key={p} className="text-[10px] font-mono font-bold bg-slate-50 text-slate-600 px-2 py-0.5 rounded border border-slate-100">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subview 3: Permissions Ledger */}
      {subTab === 'permissions' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <h2 className="text-base font-bold font-display text-slate-800">Permissions Delegation Grid</h2>
            <p className="text-xs text-slate-400">Delegate or revoke granular control codes directly across standard operator roles</p>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="p-4 pl-6">Permission Token</th>
                  <th className="p-4">Scope Description</th>
                  <th className="p-4">Authorized Roles (Click to toggle)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[13px] text-slate-600 font-medium">
                {permissionsLedger.map((perm) => (
                  <tr key={perm.code} className="hover:bg-slate-50/40 transition-colors">
                    <td className="p-4 pl-6 font-mono text-xs font-bold text-slate-800">
                      {perm.code}
                    </td>
                    <td className="p-4 text-xs text-slate-500 font-normal">
                      {perm.desc}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2">
                        {['Admin', 'Finance Officer', 'Fleet Owner', 'Support Agent'].map((role) => {
                          const isActive = perm.roles.includes(role);
                          return (
                            <button
                              key={role}
                              onClick={() => handleTogglePermissionRole(perm.code, role)}
                              className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all ${
                                isActive
                                  ? 'bg-blue-50 text-blue-600 border-blue-200'
                                  : 'bg-slate-50 text-slate-400 border-slate-200/50 hover:bg-slate-100/50'
                              }`}
                            >
                              {role}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Operator Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-slate-800 text-sm">Register System Operator</h3>
                <p className="text-[11px] text-slate-400">Initialize a new administrative login credential</p>
              </div>
            </div>

            <form onSubmit={handleAddUserSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Operator Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Irfan Support"
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Email Address</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="e.g. irfan.support@rideality.com"
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Contact Phone</label>
                  <input
                    type="text"
                    required
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="e.g. +92300123456"
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Access Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500"
                  >
                    <option value="Admin">Admin</option>
                    <option value="Finance Officer">Finance Officer</option>
                    <option value="Fleet Owner">Fleet Owner</option>
                    <option value="Support Agent">Support Agent</option>
                  </select>
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
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
                >
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
