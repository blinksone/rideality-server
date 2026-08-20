import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DashboardView from './components/DashboardView';
import RegionsView from './components/RegionsView';
import UsersView from './components/UsersView';
import FinanceView from './components/FinanceView';
import FleetView from './components/FleetView';
import SupportView from './components/SupportView';

// Types & Mock Data
import { Region, User, Wallet, Adjustment, Payout, FleetCompany, SupportTicket, ActiveTrip, LiveDispatchLog } from './types';
import {
  initialRegions,
  initialUsers,
  initialWallets,
  initialAdjustments,
  initialPayouts,
  initialFleets,
  initialTickets,
  mockTrips,
  systemActivityLogs
} from './data/mockData';

export default function App() {
  // Navigation View System States
  const [currentView, setCurrentView] = useState('dashboard');
  const [accessSubTab, setAccessSubTab] = useState<'users' | 'roles' | 'permissions'>('users');
  const [financeSubTab, setFinanceSubTab] = useState<'overview' | 'wallets' | 'adjustments' | 'payouts'>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Live Database Arrays (Reactive state allowing real data updates and triggers)
  const [regions, setRegions] = useState<Region[]>(initialRegions);
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [wallets, setWallets] = useState<Wallet[]>(initialWallets);
  const [adjustments, setAdjustments] = useState<Adjustment[]>(initialAdjustments);
  const [payouts, setPayouts] = useState<Payout[]>(initialPayouts);
  const [fleets, setFleets] = useState<FleetCompany[]>(initialFleets);
  const [tickets, setTickets] = useState<SupportTicket[]>(initialTickets);
  const [activeTrips, setActiveTrips] = useState<ActiveTrip[]>(mockTrips);
  
  // Dispatch Logs State
  const [dispatchLogs, setDispatchLogs] = useState<LiveDispatchLog[]>(() =>
    systemActivityLogs.map(log => ({
      id: log.id,
      timestamp: log.timestamp,
      type: log.type as any,
      message: log.message
    }))
  );

  // Helper to add dispatch logs dynamically with time stamp
  const addDispatchLog = (type: 'pickup' | 'dropoff' | 'request' | 'cancel' | 'payment', message: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    const newLog: LiveDispatchLog = {
      id: `log-${Date.now()}`,
      timestamp,
      type,
      message
    };
    setDispatchLogs(prev => [newLog, ...prev.slice(0, 19)]); // Buffer up to 20 logs
  };

  // Custom setView wrapper to translate individual Sidebar submenus to exact tabs
  const handleViewChange = (targetView: string) => {
    setSearchTerm(''); // Reset search on route change for clean UX

    if (targetView === 'dashboard') {
      setCurrentView('dashboard');
    } else if (targetView === 'regions') {
      setCurrentView('regions');
    } else if (targetView === 'users') {
      setCurrentView('users');
      setAccessSubTab('users');
    } else if (targetView === 'roles') {
      setCurrentView('users');
      setAccessSubTab('roles');
    } else if (targetView === 'permissions') {
      setCurrentView('users');
      setAccessSubTab('permissions');
    } else if (targetView === 'finance-overview') {
      setCurrentView('finance');
      setFinanceSubTab('overview');
    } else if (targetView === 'finance-wallets') {
      setCurrentView('finance');
      setFinanceSubTab('wallets');
    } else if (targetView === 'finance-adjustments') {
      setCurrentView('finance');
      setFinanceSubTab('adjustments');
    } else if (targetView === 'finance-payouts') {
      setCurrentView('finance');
      setFinanceSubTab('payouts');
    } else if (targetView === 'operations-fleet') {
      setCurrentView('fleet');
    } else if (targetView === 'operations-support') {
      setCurrentView('support');
    } else {
      setCurrentView(targetView);
    }
  };

  // Resolve active sidebar indicators based on the active tab context
  const getActiveSidebarID = () => {
    if (currentView === 'dashboard') return 'dashboard';
    if (currentView === 'regions') return 'regions';
    if (currentView === 'users') {
      if (accessSubTab === 'users') return 'users';
      if (accessSubTab === 'roles') return 'roles';
      if (accessSubTab === 'permissions') return 'permissions';
    }
    if (currentView === 'finance') {
      if (financeSubTab === 'overview') return 'finance-overview';
      if (financeSubTab === 'wallets') return 'finance-wallets';
      if (financeSubTab === 'adjustments') return 'finance-adjustments';
      if (financeSubTab === 'payouts') return 'finance-payouts';
    }
    if (currentView === 'fleet') return 'operations-fleet';
    if (currentView === 'support') return 'operations-support';
    return 'dashboard';
  };

  const activeSidebarID = getActiveSidebarID();

  // Route switchboard
  const renderActiveView = () => {
    switch (currentView) {
      case 'dashboard':
        return (
          <DashboardView
            usersCount={users.length}
            driversCount={users.filter(u => u.roles.includes('Driver')).length + 1} // Enforce realistic driver logs
            fleetsCount={fleets.length}
            activeTrips={activeTrips}
            setActiveTrips={setActiveTrips}
            dispatchLogs={dispatchLogs}
            addDispatchLog={addDispatchLog}
          />
        );
      case 'regions':
        return (
          <RegionsView
            regions={regions}
            setRegions={setRegions}
            addDispatchLog={addDispatchLog}
            searchTerm={searchTerm}
          />
        );
      case 'users':
        return (
          <UsersView
            users={users}
            setUsers={setUsers}
            addDispatchLog={addDispatchLog}
            searchTerm={searchTerm}
            subTab={accessSubTab}
            setSubTab={setAccessSubTab}
          />
        );
      case 'finance':
        return (
          <FinanceView
            wallets={wallets}
            setWallets={setWallets}
            adjustments={adjustments}
            setAdjustments={setAdjustments}
            payouts={payouts}
            setPayouts={setPayouts}
            addDispatchLog={addDispatchLog}
            searchTerm={searchTerm}
            subTab={financeSubTab}
            setSubTab={setFinanceSubTab}
          />
        );
      case 'fleet':
        return (
          <FleetView
            fleets={fleets}
            setFleets={setFleets}
            addDispatchLog={addDispatchLog}
            searchTerm={searchTerm}
          />
        );
      case 'support':
        return (
          <SupportView
            tickets={tickets}
            setTickets={setTickets}
            addDispatchLog={addDispatchLog}
            searchTerm={searchTerm}
          />
        );
      default:
        return (
          <div className="h-96 flex items-center justify-center text-slate-400 text-sm">
            Operational View Undefined
          </div>
        );
    }
  };

  return (
    <div id="app-root-container" className="flex bg-slate-50/50 min-h-screen text-slate-700 font-sans antialiased selection:bg-blue-500/10 selection:text-blue-600">
      {/* Collapsible Left Navigation Column */}
      <Sidebar
        currentView={activeSidebarID}
        setView={handleViewChange}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
      />

      {/* Main Right Content Panel Grid */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Persistent top application bar */}
        <Header
          currentView={activeSidebarID}
          dispatchLogs={dispatchLogs}
          onSearch={setSearchTerm}
        />

        {/* Dynamic Inner operational viewport */}
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6 pb-12">
          {renderActiveView()}
        </main>
      </div>
    </div>
  );
}
