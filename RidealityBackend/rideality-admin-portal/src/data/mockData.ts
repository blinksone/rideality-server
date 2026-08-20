import { Region, User, Wallet, Adjustment, Payout, FleetCompany, SupportTicket, ActiveTrip } from '../types';

export const initialRegions: Region[] = [
  { id: 'reg-1', country: 'Dubai', code: 'AE', currency: 'AED', phonePrefix: '+971', status: 'Active' },
  { id: 'reg-2', country: 'AB (DUBAI)', code: 'DUBAI', currency: 'AED', phonePrefix: '+91', status: 'Active' },
  { id: 'reg-3', country: 'Albania', code: 'AL', currency: 'ALL', phonePrefix: '+300', status: 'Active' },
  { id: 'reg-4', country: 'INDIA', code: 'IND', currency: 'DOL', phonePrefix: '+34', status: 'Active' },
  { id: 'reg-5', country: 'Pakistan', code: 'PK', currency: 'PKR', phonePrefix: '+92', status: 'Active' },
  { id: 'reg-6', country: 'United States', code: 'US', currency: 'USD', phonePrefix: '+908', status: 'Active' },
  { id: 'reg-7', country: 'oman', code: 'OM', currency: 'OMR', phonePrefix: '+92', status: 'Active' }
];

export const initialUsers: User[] = [
  {
    id: 'usr-1',
    name: 'shaikhtoobatesting',
    email: 'shaikhtoobatesting@gmail.com',
    phone: '+11255678878',
    status: 'Active',
    roles: ['Fleet Owner'],
    joined: 'Jul 8, 2026 11:05 PM'
  },
  {
    id: 'usr-2',
    name: 'tppba testing123',
    email: 'toobatesting123@gmail.com',
    phone: '+97153637927386',
    status: 'Active',
    roles: ['Admin'],
    joined: 'Jul 8, 2026 10:34 PM'
  },
  {
    id: 'usr-3',
    name: 'tooba4',
    email: 'tooba4@gmail.com',
    phone: '+145677899',
    status: 'Active',
    roles: ['Fleet Owner'],
    joined: 'Jul 7, 2026 12:29 AM'
  },
  {
    id: 'usr-4',
    name: 'tooba5',
    email: 'tooba5@gmail.com',
    phone: '+142567376716',
    status: 'Active',
    roles: ['Support Agent'],
    joined: 'Jul 7, 2026 12:09 AM'
  },
  {
    id: 'usr-5',
    name: 'Tooba',
    email: 'Tooba@testing.com',
    phone: '+14222222222',
    status: 'Active',
    roles: ['Support Agent'],
    joined: 'Jul 6, 2026 11:46 PM'
  },
  {
    id: 'usr-6',
    name: 'Irfan Fleet',
    email: 'irfan.fleet@gmail.com',
    phone: '+92493499393',
    status: 'Active',
    roles: ['Fleet Owner'],
    joined: 'Jul 1, 2026 2:29 AM'
  },
  {
    id: 'usr-7',
    name: 'Irfan Finince',
    email: 'irfan@gmail.com',
    phone: '+91340040044',
    status: 'Active',
    roles: ['Finance Officer'],
    joined: 'Jul 1, 2026 1:45 AM'
  },
  {
    id: 'usr-8',
    name: 'test3',
    email: 'test3@gmail.com',
    phone: '+9231394433',
    status: 'Banned',
    roles: ['Fleet Owner'],
    joined: 'Jul 1, 2026 1:10 AM'
  },
  {
    id: 'usr-9',
    name: 'test2',
    email: 'test2@gmail.com',
    phone: '+929494949',
    status: 'Banned',
    roles: ['Fleet Owner'],
    joined: 'Jul 1, 2026 1:06 AM'
  }
];

export const initialWallets: Wallet[] = [
  {
    id: 'wlt-1',
    owner: 'tppba testing123',
    email: 'toobatesting123@gmail.com',
    ownerType: 'User',
    currency: 'USD',
    available: 1250.00,
    pending: 340.00,
    lastTransaction: 'Jul 8, 2026 10:45 PM',
    status: 'Active'
  },
  {
    id: 'wlt-2',
    owner: 'shaikhtoobatesting',
    email: 'shaikhtoobatesting@gmail.com',
    ownerType: 'User',
    currency: 'PKR',
    available: 0.00,
    pending: 0.00,
    lastTransaction: 'Jul 8, 2026 11:05 PM',
    status: 'Active'
  },
  {
    id: 'wlt-3',
    owner: 'tooba4',
    email: 'tooba4@gmail.com',
    ownerType: 'User',
    currency: 'AED',
    available: 450.00,
    pending: 120.00,
    lastTransaction: 'Jul 7, 2026 12:30 AM',
    status: 'Active'
  },
  {
    id: 'wlt-4',
    owner: 'tooba5',
    email: 'tooba5@gmail.com',
    ownerType: 'User',
    currency: 'AED',
    available: 0.00,
    pending: 0.00,
    lastTransaction: '—',
    status: 'Active'
  },
  {
    id: 'wlt-5',
    owner: 'Tooba',
    email: 'Tooba@testing.com',
    ownerType: 'User',
    currency: 'AED',
    available: 0.00,
    pending: 0.00,
    lastTransaction: '—',
    status: 'Active'
  },
  {
    id: 'wlt-6',
    owner: 'hello',
    email: 'hello@gmail.com',
    ownerType: 'User',
    currency: 'RUP',
    available: 5.00,
    pending: 0.00,
    lastTransaction: 'Jul 1, 2026 11:39 AM',
    status: 'Active'
  },
  {
    id: 'wlt-7',
    owner: 'Lala Transport',
    email: 'lala.trans@gmail.com',
    ownerType: 'Fleet',
    currency: 'PKR',
    available: 43.00,
    pending: 0.00,
    lastTransaction: 'Jul 1, 2026 11:28 AM',
    status: 'Active'
  },
  {
    id: 'wlt-8',
    owner: 'Karachi Transport',
    email: 'karachi.t@gmail.com',
    ownerType: 'Fleet',
    currency: 'PKR',
    available: 8400.00,
    pending: 1200.00,
    lastTransaction: 'Jul 5, 2026 4:12 PM',
    status: 'Active'
  },
  {
    id: 'wlt-9',
    owner: 'Fleet Co',
    email: 'irfan.fleet@gmail.com',
    ownerType: 'Fleet',
    currency: 'AED',
    available: 15450.00,
    pending: 3400.00,
    lastTransaction: 'Jul 8, 2026 09:15 AM',
    status: 'Active'
  }
];

export const initialAdjustments: Adjustment[] = [
  {
    id: 'adj-101',
    walletId: 'wlt-6',
    owner: 'hello',
    type: 'Credit',
    reason: 'Adjustment Credit for ride dispute',
    status: 'Approved',
    amount: 5,
    currency: 'RUP',
    requestedBy: 'Irfan Finince',
    created: 'Jul 1, 2026 11:39 AM'
  },
  {
    id: 'adj-102',
    walletId: 'wlt-7',
    owner: 'Lala Transport',
    type: 'Credit',
    reason: 'Adjustment Credit promo bonus payout',
    status: 'Approved',
    amount: 43,
    currency: 'PKR',
    requestedBy: 'Irfan Finince',
    created: 'Jul 1, 2026 11:28 AM'
  }
];

export const initialPayouts: Payout[] = [
  {
    id: 'pay-201',
    walletId: 'wlt-9',
    owner: 'Fleet Co',
    amount: 5000,
    currency: 'AED',
    bankDetails: 'Dubai Islamic Bank - IBAN AE450230002938102394',
    status: 'Pending',
    requestedBy: 'Irfan Fleet',
    created: 'Jul 8, 2026 08:30 AM'
  },
  {
    id: 'pay-202',
    walletId: 'wlt-7',
    owner: 'Lala Transport',
    amount: 15000,
    currency: 'PKR',
    bankDetails: 'Habib Bank Limited - A/C 00234123849132',
    status: 'Approved',
    requestedBy: 'Lala Admin',
    created: 'Jul 4, 2026 02:15 PM'
  }
];

export const initialFleets: FleetCompany[] = [
  {
    id: 'flt-1',
    companyName: 'Lala Transport',
    status: 'Active',
    region: 'Pakistan (PK) — PKR',
    owner: 'Irfan Fleet',
    taxId: 'TX-991203',
    created: 'Jul 1, 2026 2:45 AM'
  },
  {
    id: 'flt-2',
    companyName: 'Karachi Transport',
    status: 'Active',
    region: 'Pakistan (PK) — PKR',
    owner: 'Platform Admin',
    taxId: 'TX-882104',
    created: 'Jul 1, 2026 2:35 AM'
  },
  {
    id: 'flt-3',
    companyName: 'Fleet Co',
    status: 'Active',
    region: 'AB (DUBAI) — AED',
    owner: 'Irfan Fleet',
    taxId: 'TX-774023',
    created: 'Jun 30, 2026 11:30 PM'
  },
  {
    id: 'flt-4',
    companyName: 'Karachi Car Service',
    status: 'Active',
    region: 'United States (US) — USD',
    owner: 'Platform Admin',
    taxId: 'TX-440121',
    created: 'Jun 18, 2026 2:01 PM'
  },
  {
    id: 'flt-5',
    companyName: 'US Test Fleet',
    status: 'Active',
    region: 'United States (US) — USD',
    owner: 'Platform Admin',
    taxId: 'TX-330198',
    created: 'Jun 18, 2026 1:57 PM'
  },
  {
    id: 'flt-6',
    companyName: 'Rideality Fleet Lahore',
    status: 'Pending',
    region: 'Pakistan (PK) — PKR',
    owner: '—',
    taxId: 'TX-010344',
    created: 'Jun 16, 2026 1:20 AM'
  }
];

export const initialTickets: SupportTicket[] = [
  {
    id: 'tkt-301',
    user: 'Muhammad Ali',
    role: 'Driver',
    subject: 'GPS ping dropping on route',
    status: 'Open',
    lastMessage: 'I keep losing signal near the main flyover in Dubai Downtown.',
    created: 'Jul 8, 2026 11:20 AM',
    messages: [
      { sender: 'User', text: 'I keep losing signal near the main flyover in Dubai Downtown.', time: '11:20 AM' },
      { sender: 'Agent', text: 'Hi Muhammad, our engineers are checking the coverage mapping in that sector. Is your device up to date?', time: '11:25 AM' },
      { sender: 'User', text: 'Yes, running Android 14. It happens during active rides which pauses my fare tracker.', time: '11:28 AM' }
    ]
  },
  {
    id: 'tkt-302',
    user: 'Sarah Jenkins',
    role: 'Rider',
    subject: 'Charged twice for ride #30491',
    status: 'Open',
    lastMessage: 'Both charge holds are shown on my bank statement.',
    created: 'Jul 8, 2026 09:10 AM',
    messages: [
      { sender: 'User', text: 'Both charge holds are shown on my bank statement.', time: '09:10 AM' }
    ]
  },
  {
    id: 'tkt-303',
    user: 'Irfan Fleet',
    role: 'Fleet Owner',
    subject: 'Request to accelerate weekly payout',
    status: 'Resolved',
    lastMessage: 'Thank you for approving the transfer.',
    created: 'Jul 7, 2026 04:30 PM',
    messages: [
      { sender: 'User', text: 'We have payroll coming up and need the AED 5,000 payout approved quickly.', time: '04:30 PM' },
      { sender: 'Agent', text: 'Approved and sent to ledger. Should arrive in 4-6 hours.', time: '04:45 PM' },
      { sender: 'User', text: 'Thank you for approving the transfer.', time: '05:00 PM' }
    ]
  }
];

export const mockTrips: ActiveTrip[] = [
  {
    id: 'trip-1',
    driverName: 'Ahmad Khan',
    passengerName: 'Farhana J.',
    pickup: 'Dubai Marina Mall',
    dropoff: 'Burj Khalifa Entrance',
    fare: 42.50,
    currency: 'AED',
    status: 'PickedUp',
    carType: 'Rideality Comfort',
    progress: 45,
    routeX: 30,
    routeY: 45
  },
  {
    id: 'trip-2',
    driverName: 'Zubair Shah',
    passengerName: 'John Doe',
    pickup: 'Lekki Toll Gate',
    dropoff: 'Ikeja City Mall',
    fare: 12.00,
    currency: 'USD',
    status: 'PickedUp',
    carType: 'Rideality Sedan',
    progress: 75,
    routeX: 70,
    routeY: 30
  },
  {
    id: 'trip-3',
    driverName: 'Sanjay Dutt',
    passengerName: 'Aishwarya R.',
    pickup: 'Mumbai Airport T2',
    dropoff: 'Bandra Reclamation',
    fare: 620.00,
    currency: 'DOL',
    status: 'Searching',
    carType: 'Rideality Premium',
    progress: 10,
    routeX: 15,
    routeY: 80
  },
  {
    id: 'trip-4',
    driverName: 'Viktor Dragov',
    passengerName: 'Alexei S.',
    pickup: 'Tirana Central Sq',
    dropoff: 'Blloku District',
    fare: 450.00,
    currency: 'ALL',
    status: 'Arrived',
    carType: 'Rideality Eco',
    progress: 95,
    routeX: 85,
    routeY: 75
  }
];

export const systemActivityLogs = [
  { id: 'log-1', timestamp: '13:51:12', type: 'request', message: 'New ride request in Dubai Region: Comfort category (Passenger: Farhana)' },
  { id: 'log-2', timestamp: '13:50:45', type: 'pickup', message: 'Driver Ahmad Khan picked up passenger Farhana J. (Dubai Marina)' },
  { id: 'log-3', timestamp: '13:49:10', type: 'payment', message: 'Payout of 15,000 PKR to Lala Transport processed successfully' },
  { id: 'log-4', timestamp: '13:48:02', type: 'request', message: 'Driver approval request submitted for Sarah Connor (United States)' },
  { id: 'log-5', timestamp: '13:47:15', type: 'cancel', message: 'Ride request cancelled in Tirana region: No driver accepted within 4 mins' }
];
