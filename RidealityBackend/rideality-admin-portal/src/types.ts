export type RegionStatus = 'Active' | 'Inactive';

export interface Region {
  id: string;
  country: string;
  code: string;
  currency: string;
  phonePrefix: string;
  status: RegionStatus;
}

export type UserStatus = 'Active' | 'Banned' | 'Pending';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: UserStatus;
  roles: string[];
  joined: string;
}

export type WalletStatus = 'Active' | 'Frozen' | 'Inactive';
export type OwnerType = 'User' | 'Fleet';

export interface Wallet {
  id: string;
  owner: string;
  email: string;
  ownerType: OwnerType;
  currency: string;
  available: number;
  pending: number;
  lastTransaction: string;
  status: WalletStatus;
}

export type AdjustmentType = 'Credit' | 'Debit';
export type RequestStatus = 'Pending' | 'Approved' | 'Rejected';

export interface Adjustment {
  id: string;
  walletId: string;
  owner: string;
  type: AdjustmentType;
  reason: string;
  status: RequestStatus;
  amount: number;
  currency: string;
  requestedBy: string;
  created: string;
}

export interface Payout {
  id: string;
  walletId: string;
  owner: string;
  amount: number;
  currency: string;
  bankDetails: string;
  status: RequestStatus;
  requestedBy: string;
  created: string;
}

export type FleetStatus = 'Active' | 'Pending' | 'Suspended';

export interface FleetCompany {
  id: string;
  companyName: string;
  status: FleetStatus;
  region: string;
  owner: string;
  taxId?: string;
  created: string;
}

export interface Message {
  sender: 'User' | 'Agent';
  text: string;
  time: string;
}

export interface SupportTicket {
  id: string;
  user: string;
  role: string;
  subject: string;
  status: 'Open' | 'Resolved';
  lastMessage: string;
  created: string;
  messages: Message[];
}

export interface ActiveTrip {
  id: string;
  driverName: string;
  passengerName: string;
  pickup: string;
  dropoff: string;
  fare: number;
  currency: string;
  status: 'Searching' | 'PickedUp' | 'Arrived' | 'Completed';
  carType: 'Rideality Sedan' | 'Rideality Comfort' | 'Rideality Premium' | 'Rideality Eco';
  progress: number; // 0 to 100
  routeX: number; // For map visualization
  routeY: number; // For map visualization
}

export interface LiveDispatchLog {
  id: string;
  timestamp: string;
  type: 'pickup' | 'dropoff' | 'request' | 'cancel' | 'payment';
  message: string;
}
