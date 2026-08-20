import { useState } from 'react';
import {
  LayoutDashboard,
  Globe,
  Users,
  Shield,
  Key,
  Wallet,
  Landmark,
  FileText,
  Coins,
  Truck,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Sparkles
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  setView: (view: string) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

export default function Sidebar({ currentView, setView, collapsed, setCollapsed }: SidebarProps) {
  // Navigation categories
  const menuGroups = [
    {
      label: 'Main',
      items: [
        { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard }
      ]
    },
    {
      label: 'Platform',
      items: [
        { id: 'regions', name: 'Regions', icon: Globe }
      ]
    },
    {
      label: 'Access',
      items: [
        { id: 'users', name: 'Users', icon: Users },
        { id: 'roles', name: 'Roles', icon: Shield },
        { id: 'permissions', name: 'Permissions', icon: Key }
      ]
    },
    {
      label: 'Finance',
      items: [
        { id: 'finance-overview', name: 'Overview', icon: Wallet },
        { id: 'finance-wallets', name: 'Wallets', icon: Landmark },
        { id: 'finance-adjustments', name: 'Adjustments', icon: FileText },
        { id: 'finance-payouts', name: 'Payouts', icon: Coins }
      ]
    },
    {
      label: 'Operations',
      items: [
        { id: 'operations-fleet', name: 'Fleet', icon: Truck },
        { id: 'operations-support', name: 'Support', icon: HelpCircle }
      ]
    }
  ];

  return (
    <aside
      id="sidebar-container"
      className={`bg-white border-r border-slate-100 flex flex-col h-screen sticky top-0 transition-all duration-300 z-30 shadow-[4px_0_24px_rgba(0,0,0,0.015)] ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between p-5 border-b border-slate-50 min-h-[73px]">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-semibold shadow-md shadow-blue-100 animate-float">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-display font-bold text-[18px] tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                Rideality
              </span>
              <span className="text-[10px] text-blue-600 font-semibold tracking-wider uppercase -mt-1">
                Admin Console
              </span>
            </div>
          </div>
        )}

        {collapsed && (
          <div className="mx-auto w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-semibold shadow-md">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
        )}

        {/* Toggle Collapse Button */}
        <button
          id="sidebar-toggle"
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 border border-slate-100 transition-all shadow-sm"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Items */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-5 scrollbar-thin">
        {menuGroups.map((group) => (
          <div key={group.label} className="space-y-1.5">
            {!collapsed && (
              <h3 className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {group.label}
              </h3>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id || 
                  (item.id === 'finance-overview' && currentView.startsWith('finance-')) ||
                  (item.id === 'operations-fleet' && currentView.startsWith('operations-'));
                
                // Fine tune active item exact check
                const isExactActive = currentView === item.id;

                return (
                  <li key={item.id}>
                    <button
                      id={`sidebar-link-${item.id}`}
                      onClick={() => setView(item.id)}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-all group ${
                        isExactActive
                          ? 'bg-blue-50/70 text-blue-600 font-medium shadow-[0_2px_8px_rgba(37,99,235,0.04)]'
                          : isActive
                          ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50/80 font-normal'
                      }`}
                    >
                      <Icon
                        className={`w-[18px] h-[18px] transition-transform duration-200 group-hover:scale-105 ${
                          isExactActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                      />
                      {!collapsed && (
                        <span className="text-[13px] tracking-wide truncate">{item.name}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* User Context Footer */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-semibold font-display shadow-sm">
              P
            </div>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-semibold text-slate-800 truncate">
                Platform Admin
              </h4>
              <p
                className="text-[10px] text-slate-400 font-mono truncate"
                title="SUPER_ADMIN, ADMIN, FLEET_OWNER"
              >
                SUPER_ADMIN, ADMIN, FLEE...
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
