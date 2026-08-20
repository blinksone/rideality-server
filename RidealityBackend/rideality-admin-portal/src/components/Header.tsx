import React, { useState, useEffect } from 'react';
import { Bell, Sun, Moon, LogOut, HelpCircle, Shield, Search, ArrowRight, CheckCircle } from 'lucide-react';
import { LiveDispatchLog } from '../types';

interface HeaderProps {
  currentView: string;
  dispatchLogs: LiveDispatchLog[];
  onSearch: (term: string) => void;
}

export default function Header({ currentView, dispatchLogs, onSearch }: HeaderProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [time, setTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getBreadcrumb = () => {
    switch (currentView) {
      case 'dashboard':
        return { parent: 'Main', child: 'Dashboard' };
      case 'regions':
        return { parent: 'Platform', child: 'Regions' };
      case 'users':
        return { parent: 'Access', child: 'Users & Roster' };
      case 'roles':
        return { parent: 'Access', child: 'Roles Configuration' };
      case 'permissions':
        return { parent: 'Access', child: 'Permissions Ledger' };
      case 'finance-overview':
        return { parent: 'Finance', child: 'Platform Ledger' };
      case 'finance-wallets':
        return { parent: 'Finance', child: 'Wallet Accounts' };
      case 'finance-adjustments':
        return { parent: 'Finance', child: 'Ledger Adjustments' };
      case 'finance-payouts':
        return { parent: 'Finance', child: 'Payout Approvals' };
      case 'operations-fleet':
        return { parent: 'Operations', child: 'Fleet Companies' };
      case 'operations-support':
        return { parent: 'Operations', child: 'Support Center' };
      default:
        return { parent: 'Platform', child: 'Console' };
    }
  };

  const { parent, child } = getBreadcrumb();

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    onSearch(e.target.value);
  };

  return (
    <header
      id="main-header"
      className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-[0_2px_12px_rgba(0,0,0,0.005)] min-h-[73px]"
    >
      {/* Left: Breadcrumbs & View Name */}
      <div className="flex items-center gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium tracking-wide">
            <span>{parent}</span>
            <span>/</span>
            <span className="text-slate-500 font-semibold">{child}</span>
          </div>
          <h1 className="font-display font-bold text-xl text-slate-800 -mt-0.5 tracking-tight">
            {child}
          </h1>
        </div>
      </div>

      {/* Middle: Universal Search */}
      <div className="hidden md:flex items-center flex-1 max-w-sm mx-10">
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            id="universal-search-input"
            type="text"
            value={searchTerm}
            onChange={handleSearchChange}
            placeholder={`Search across ${child.toLowerCase()}...`}
            className="w-full pl-10 pr-4 py-2 text-[13px] bg-slate-50/70 border border-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-slate-700 placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Right: Actions, Clock, Alerts, Profile */}
      <div className="flex items-center gap-4">
        {/* Real-time indicator & system clock */}
        <div className="hidden lg:flex flex-col items-end pr-3 border-r border-slate-100 font-mono text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5 font-sans font-medium text-emerald-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>System Online</span>
          </div>
          <div>{time} UTC</div>
        </div>

        {/* Notifications Alert Dropdown */}
        <div className="relative">
          <button
            id="notification-bell-btn"
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-all relative border border-slate-50 shadow-sm"
            title="System Alerts"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full animate-bounce"></span>
          </button>

          {showNotifications && (
            <div
              id="notifications-popover"
              className="absolute right-0 mt-3.5 w-80 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 overflow-hidden"
            >
              <div className="p-4 border-b border-slate-50 bg-slate-55/30 flex items-center justify-between">
                <span className="font-semibold text-xs text-slate-800">Live Dispatch Alerts</span>
                <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold">Active</span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                {dispatchLogs.map((log) => (
                  <div key={log.id} className="p-3.5 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono text-slate-400">{log.timestamp}</span>
                      <span className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-bold ${
                        log.type === 'pickup' ? 'bg-emerald-50 text-emerald-600' :
                        log.type === 'cancel' ? 'bg-rose-50 text-rose-600' :
                        log.type === 'payment' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                      }`}>
                        {log.type}
                      </span>
                    </div>
                    <p className="text-[11.5px] text-slate-600 mt-1 leading-snug">{log.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Dark Mode toggle (Simulated cosmetic) */}
        <button
          id="theme-toggle-btn"
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-all border border-slate-50 shadow-sm"
          title="Toggle Theme"
        >
          {isDarkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Quick Help Modal Trigger (Cosmetic) */}
        <button
          id="help-center-btn"
          onClick={() => alert("Rideality Helpdesk: Standard Service Port 3000 online. For manual platform overriding, contact irfan.200818@gmail.com.")}
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-all border border-slate-50 shadow-sm"
          title="Help & Info"
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        {/* Logout (cosmetic reload) */}
        <button
          id="logout-btn"
          onClick={() => window.location.reload()}
          className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-all border border-slate-50 shadow-sm"
          title="Reset Console Session"
        >
          <LogOut className="w-4 h-4" />
        </button>

        {/* User initials bubble from screenshot */}
        <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold shadow-inner font-display text-[13px]">
          P
        </div>
      </div>
    </header>
  );
}
