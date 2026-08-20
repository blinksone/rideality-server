import React, { useState, useEffect } from 'react';
import {
  Users,
  Car,
  FileCheck,
  Building,
  Activity,
  FileSpreadsheet,
  Network,
  UserPlus,
  Compass,
  TrendingUp,
  MapPin,
  Play,
  RotateCcw,
  Sparkles,
  DollarSign
} from 'lucide-react';
import { ActiveTrip, LiveDispatchLog } from '../types';

interface DashboardViewProps {
  usersCount: number;
  driversCount: number;
  fleetsCount: number;
  activeTrips: ActiveTrip[];
  setActiveTrips: React.Dispatch<React.SetStateAction<ActiveTrip[]>>;
  dispatchLogs: LiveDispatchLog[];
  addDispatchLog: (type: 'pickup' | 'dropoff' | 'request' | 'cancel' | 'payment', message: string) => void;
}

export default function DashboardView({
  usersCount,
  driversCount,
  fleetsCount,
  activeTrips,
  setActiveTrips,
  dispatchLogs,
  addDispatchLog
}: DashboardViewProps) {
  const [selectedTrip, setSelectedTrip] = useState<ActiveTrip | null>(activeTrips[0] || null);
  const [radarActive, setRadarActive] = useState(true);

  // Animate the simulated trips on the visual map
  useEffect(() => {
    if (!radarActive) return;

    const interval = setInterval(() => {
      setActiveTrips((prevTrips) =>
        prevTrips.map((trip) => {
          let nextProgress = trip.progress + Math.floor(Math.random() * 3) + 1;
          let nextStatus = trip.status;

          // Loop simulation
          if (nextProgress >= 100) {
            nextProgress = 0;
            if (trip.status === 'Completed' || trip.status === 'Arrived') {
              nextStatus = 'Searching';
              addDispatchLog('request', `Searching for nearby matches for ${trip.passengerName} (Fare: ${trip.fare} ${trip.currency})`);
            } else if (trip.status === 'Searching') {
              nextStatus = 'PickedUp';
              addDispatchLog('pickup', `Driver ${trip.driverName} picked up ${trip.passengerName} in ${trip.pickup}`);
            } else if (trip.status === 'PickedUp') {
              nextStatus = 'Arrived';
              addDispatchLog('dropoff', `Driver ${trip.driverName} arrived at destination: ${trip.dropoff}`);
            }
          }

          // Calculate visual movement routes around a circular map
          const angle = (nextProgress / 100) * Math.PI * 2;
          const radius = trip.id === 'trip-1' ? 35 : trip.id === 'trip-2' ? 55 : trip.id === 'trip-3' ? 20 : 45;
          const centerX = 50;
          const centerY = 50;
          const routeX = centerX + Math.cos(angle) * radius;
          const routeY = centerY + Math.sin(angle) * radius;

          return {
            ...trip,
            progress: nextProgress,
            status: nextStatus,
            routeX,
            routeY
          };
        })
      );
    }, 1500);

    return () => clearInterval(interval);
  }, [radarActive, setActiveTrips, addDispatchLog]);

  // Inject a manual test simulated ride request
  const handleSimulateNewRide = () => {
    const passengers = ['Michael Scott', 'Jim Halpert', 'Pam Beesly', 'Dwight Schrute', 'Angela Martin'];
    const drivers = ['Oscar Martinez', 'Stanley Hudson', 'Kevin Malone', 'Ryan Howard', 'Creed Bratton'];
    const locations = ['Downtown Office', 'Business District', 'North Ring Gate', 'Central Airport', 'Suburban Mall'];
    const categories: ('Rideality Sedan' | 'Rideality Comfort' | 'Rideality Premium' | 'Rideality Eco')[] = [
      'Rideality Sedan', 'Rideality Comfort', 'Rideality Premium', 'Rideality Eco'
    ];
    const currencies = ['AED', 'USD', 'PKR', 'OMR'];

    const randomPassenger = passengers[Math.floor(Math.random() * passengers.length)];
    const randomDriver = drivers[Math.floor(Math.random() * drivers.length)];
    const randomPickup = locations[Math.floor(Math.random() * locations.length)];
    const randomDropoff = locations.filter(l => l !== randomPickup)[Math.floor(Math.random() * (locations.length - 1))];
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
    const randomFare = Math.floor(Math.random() * 80) + 15;
    const randomCurrency = currencies[Math.floor(Math.random() * currencies.length)];

    const newTrip: ActiveTrip = {
      id: `trip-${Date.now()}`,
      driverName: randomDriver,
      passengerName: randomPassenger,
      pickup: randomPickup,
      dropoff: randomDropoff,
      fare: randomFare,
      currency: randomCurrency,
      status: 'Searching',
      carType: randomCategory,
      progress: 0,
      routeX: 50,
      routeY: 50
    };

    setActiveTrips(prev => [...prev, newTrip]);
    setSelectedTrip(newTrip);
    addDispatchLog('request', `Manual dispatch initiated: ${randomPassenger} requested ${randomCategory} to ${randomDropoff}. Searching...`);
  };

  // Metrics from screenshot
  const metrics = [
    { label: 'Total users', value: usersCount, change: '+12% m/m', icon: Users, color: 'text-blue-600 bg-blue-50/70 border-blue-100/50' },
    { label: 'Total drivers', value: driversCount, change: '+2% m/m', icon: Car, color: 'text-indigo-600 bg-indigo-50/70 border-indigo-100/50' },
    { label: 'Pending driver approvals', value: 0, change: 'All cleared', icon: FileCheck, color: 'text-amber-600 bg-amber-50/70 border-amber-100/50' },
    { label: 'Total fleets', value: fleetsCount, change: '+2 new', icon: Building, color: 'text-teal-600 bg-teal-50/70 border-teal-100/50' },
    { label: 'Active fleet drivers', value: 1, change: '100% active', icon: Activity, color: 'text-emerald-600 bg-emerald-50/70 border-emerald-100/50' },
    { label: 'Pending documents', value: 0, change: '0 in queue', icon: FileSpreadsheet, color: 'text-orange-600 bg-orange-50/70 border-orange-100/50' },
    { label: 'My fleets', value: 6, change: 'Managed', icon: Network, color: 'text-purple-600 bg-purple-50/70 border-purple-100/50' },
    { label: 'My fleet drivers', value: 1, change: '1 verified', icon: Car, color: 'text-pink-600 bg-pink-50/70 border-pink-100/50' },
    { label: 'Pending invites', value: 0, change: 'None pending', icon: UserPlus, color: 'text-rose-600 bg-rose-50/70 border-rose-100/50' }
  ];

  return (
    <div id="dashboard-view-container" className="space-y-6">
      {/* Visual Welcome Hero */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-950 p-6 rounded-2xl text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -translate-y-20 translate-x-20"></div>
        <div className="absolute left-1/3 bottom-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl translate-y-20"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[11px] font-semibold tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Rideality Premium Console v2.0</span>
            </div>
            <h2 className="text-2xl font-bold font-display tracking-tight mt-1">Platform Activity Monitor</h2>
            <p className="text-slate-300 text-sm max-w-xl font-normal leading-relaxed">
              Real-time dispatch synchronization, driver metrics, and automated market auditing. Manage world regions and wallets instantly.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              id="simulate-ride-btn"
              onClick={handleSimulateNewRide}
              className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-900/30 transition-all flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Dispatch Live Rider Request</span>
            </button>
            <button
              id="toggle-radar-btn"
              onClick={() => setRadarActive(!radarActive)}
              className={`px-4 py-2.5 border rounded-xl text-xs font-semibold transition-all ${
                radarActive 
                  ? 'border-indigo-500/40 text-indigo-300 bg-indigo-500/10'
                  : 'border-slate-800 text-slate-400 bg-slate-900/40'
              }`}
            >
              {radarActive ? 'Pause Radar Feed' : 'Resume Radar Feed'}
            </button>
          </div>
        </div>
      </div>

      {/* Grid of Metrics (Exact 9 Items from Screenshot) */}
      <div id="metrics-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {metrics.map((metric, idx) => {
          const Icon = metric.icon;
          return (
            <div
              key={idx}
              className="bg-white border border-slate-100/80 rounded-2xl p-5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all flex items-start justify-between group"
            >
              <div className="space-y-3">
                <span className="text-[13px] text-slate-500 font-medium">{metric.label}</span>
                <div className="flex items-baseline gap-2.5">
                  <span className="text-3xl font-bold text-slate-800 font-display">
                    {metric.value}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium font-mono">
                    {metric.change}
                  </span>
                </div>
              </div>
              <div className={`p-3 rounded-xl border ${metric.color} transition-transform duration-300 group-hover:scale-105`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Radar Map & Dispatch Logs Section (Side-by-Side) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Market Radar Visualizer Map */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Compass className="w-5 h-5 text-blue-600" />
              <div className="flex flex-col">
                <span className="font-display font-bold text-slate-800 text-sm">Market Dispatch Radar</span>
                <span className="text-xs text-slate-400">Interactive live trip route tracker visualization</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full text-[10px] font-bold">
              <span className={`w-1.5 h-1.5 rounded-full bg-blue-500 ${radarActive ? 'animate-ping' : ''}`}></span>
              <span>SIMULATOR LIVE</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* Interactive map block */}
            <div className="md:col-span-8 bg-slate-950 rounded-2xl aspect-video relative overflow-hidden flex items-center justify-center border border-slate-900 shadow-inner">
              {/* Map grid lines overlay */}
              <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-60"></div>
              
              {/* Dynamic map sector rings */}
              <div className="absolute w-[80%] h-[80%] border border-slate-900/80 rounded-full animate-pulse-slow"></div>
              <div className="absolute w-[50%] h-[50%] border border-slate-900/60 rounded-full"></div>
              <div className="absolute w-[20%] h-[20%] border border-slate-900/40 rounded-full"></div>

              {/* Map center sector axis lines */}
              <div className="absolute h-full w-px bg-slate-900/70 left-1/2"></div>
              <div className="absolute w-full h-px bg-slate-900/70 top-1/2"></div>

              {/* Draw animated cars */}
              {activeTrips.map((trip) => {
                const isSelected = selectedTrip?.id === trip.id;
                return (
                  <button
                    key={trip.id}
                    onClick={() => setSelectedTrip(trip)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-10 transition-all duration-300"
                    style={{ left: `${trip.routeX}%`, top: `${trip.routeY}%` }}
                    title={`${trip.driverName} (${trip.status})`}
                  >
                    <span className="relative flex h-5 w-5 items-center justify-center">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-65 ${
                        isSelected ? 'bg-amber-400' :
                        trip.status === 'Searching' ? 'bg-blue-400' :
                        trip.status === 'Arrived' ? 'bg-indigo-400' : 'bg-emerald-400'
                      }`}></span>
                      <span className={`relative inline-flex rounded-lg h-3 w-3 shadow-md border border-white items-center justify-center text-[7px] font-bold text-white ${
                        isSelected ? 'bg-amber-500' :
                        trip.status === 'Searching' ? 'bg-blue-500' :
                        trip.status === 'Arrived' ? 'bg-indigo-500' : 'bg-emerald-500'
                      }`}>
                      </span>
                    </span>
                  </button>
                );
              })}

              <div className="absolute bottom-3 left-3 bg-slate-900/90 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-800 text-[10px] text-slate-400 font-mono flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span> Searching
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full ml-1"></span> PickedUp
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full ml-1"></span> Arrived
              </div>
            </div>

            {/* Selected Trip Details Block */}
            <div className="md:col-span-4 bg-slate-50/50 border border-slate-100 rounded-2xl p-4 flex flex-col justify-between">
              {selectedTrip ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded font-bold">
                      TRIP {selectedTrip.id.substring(0, 7)}
                    </span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      selectedTrip.status === 'Searching' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                      selectedTrip.status === 'PickedUp' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                      'bg-indigo-50 text-indigo-600 border border-indigo-100'
                    }`}>
                      {selectedTrip.status}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Driver</span>
                      <p className="text-[13px] font-bold text-slate-700">{selectedTrip.driverName}</p>
                      <p className="text-[11px] text-slate-400">{selectedTrip.carType}</p>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Passenger</span>
                      <p className="text-[13px] font-bold text-slate-700">{selectedTrip.passengerName}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold">Pickup</span>
                        <p className="text-xs text-slate-600 font-medium truncate" title={selectedTrip.pickup}>
                          {selectedTrip.pickup}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold">Dropoff</span>
                        <p className="text-xs text-slate-600 font-medium truncate" title={selectedTrip.dropoff}>
                          {selectedTrip.dropoff}
                        </p>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                        <span>Trip Progress</span>
                        <span className="font-mono">{selectedTrip.progress}%</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${selectedTrip.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs text-slate-400">Total Fare:</span>
                    <span className="text-base font-bold text-slate-800 font-display">
                      {selectedTrip.fare.toFixed(2)} {selectedTrip.currency}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center py-8">
                  <Compass className="w-10 h-10 mb-2 stroke-1 text-slate-300" />
                  <p className="text-xs font-medium">Select a live car node on the map radar to review dispatch details</p>
                </div>
              )}

              {selectedTrip && (
                <button
                  onClick={() => alert(`Simulating emergency driver-platform override call with ${selectedTrip.driverName}`)}
                  className="w-full mt-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                >
                  <MapPin className="w-3.5 h-3.5 text-blue-400" />
                  <span>Call Active Driver</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Real-time Dispatch Feeds (Logs) */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 lg:col-span-4 flex flex-col h-[400px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-50">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-600" />
              <span className="font-display font-bold text-slate-800 text-sm">Console Telemetry</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Live Logs</span>
          </div>

          <div className="flex-1 overflow-y-auto py-2 divide-y divide-slate-50 font-mono text-[11px] text-slate-500 space-y-2.5">
            {dispatchLogs.map((log) => (
              <div key={log.id} className="pt-2.5 first:pt-0 leading-relaxed">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-[10px] font-semibold">{log.timestamp}</span>
                  <span className={`text-[8px] font-bold uppercase px-1.5 py-0.2 rounded ${
                    log.type === 'pickup' ? 'bg-emerald-50 text-emerald-600' :
                    log.type === 'cancel' ? 'bg-rose-50 text-rose-600' :
                    log.type === 'payment' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                  }`}>
                    {log.type}
                  </span>
                </div>
                <p className="text-slate-600 mt-1">{log.message}</p>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-50 text-center">
            <span className="text-[10px] text-slate-400">Telemetry buffers up to 20 concurrent logs</span>
          </div>
        </div>
      </div>

      {/* Analytical Custom SVG Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Weekly Rides Visualizer Chart */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-display font-bold text-slate-800 text-sm">Weekly Market Rides</span>
              <p className="text-xs text-slate-400">Completed rides aggregated daily</p>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold text-slate-800 font-display">2,840</span>
              <p className="text-[10px] text-emerald-500 font-semibold flex items-center gap-0.5 justify-end">
                <TrendingUp className="w-3 h-3" /> +14.2%
              </p>
            </div>
          </div>

          {/* SVG Line chart representing week */}
          <div className="h-44 relative flex items-end">
            <svg className="w-full h-full" viewBox="0 0 400 120" preserveAspectRatio="none">
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Grid Lines */}
              <line x1="0" y1="20" x2="400" y2="20" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3" />
              <line x1="0" y1="60" x2="400" y2="60" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3" />
              <line x1="0" y1="100" x2="400" y2="100" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3" />
              
              {/* Area path */}
              <path
                d="M 10 100 L 70 85 L 130 92 L 190 40 L 250 55 L 310 18 L 370 12 L 370 120 L 10 120 Z"
                fill="url(#chartGrad)"
              />
              
              {/* Line path */}
              <path
                d="M 10 100 L 70 85 L 130 92 L 190 40 L 250 55 L 310 18 L 370 12"
                fill="none"
                stroke="#2563eb"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Data Node Dots */}
              <circle cx="10" cy="100" r="4.5" fill="#ffffff" stroke="#2563eb" strokeWidth="2.5" />
              <circle cx="70" cy="85" r="4.5" fill="#ffffff" stroke="#2563eb" strokeWidth="2.5" />
              <circle cx="130" cy="92" r="4.5" fill="#ffffff" stroke="#2563eb" strokeWidth="2.5" />
              <circle cx="190" cy="40" r="4.5" fill="#ffffff" stroke="#2563eb" strokeWidth="2.5" />
              <circle cx="250" cy="55" r="4.5" fill="#ffffff" stroke="#2563eb" strokeWidth="2.5" />
              <circle cx="310" cy="18" r="4.5" fill="#ffffff" stroke="#2563eb" strokeWidth="2.5" />
              <circle cx="370" cy="12" r="4.5" fill="#ffffff" stroke="#2563eb" strokeWidth="2.5" />
            </svg>
          </div>

          {/* X axis labels */}
          <div className="flex justify-between px-2 text-[10px] font-mono text-slate-400 font-bold uppercase">
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
            <span>Sun</span>
          </div>
        </div>

        {/* Revenue Volume Distribution Chart */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-display font-bold text-slate-800 text-sm">Gross Platform Revenue</span>
              <p className="text-xs text-slate-400">Processed funds per target currency</p>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold text-indigo-650 font-display flex items-center gap-0.5 justify-end">
                <DollarSign className="w-4 h-4 text-indigo-500" /> 184.2K USD
              </span>
              <p className="text-[10px] text-emerald-500 font-semibold flex items-center gap-0.5 justify-end">
                <TrendingUp className="w-3 h-3" /> +19.5%
              </p>
            </div>
          </div>

          {/* Currency revenue bars */}
          <div className="space-y-3.5 pt-2">
            <div>
              <div className="flex justify-between text-xs mb-1 font-medium">
                <span className="text-slate-600">AED (Dubai Operations)</span>
                <span className="text-slate-800 font-bold">AED 45,290</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-indigo-600 h-2 rounded-full" style={{ width: '85%' }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1 font-medium">
                <span className="text-slate-600">PKR (Pakistan Operations)</span>
                <span className="text-slate-800 font-bold">PKR 12,400,000</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full" style={{ width: '65%' }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1 font-medium">
                <span className="text-slate-600">USD (United States Operations)</span>
                <span className="text-slate-800 font-bold">USD 34,910</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-emerald-600 h-2 rounded-full" style={{ width: '45%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
