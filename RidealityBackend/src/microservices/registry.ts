/**
 * Microservice registry — phase 1 boundary map.
 * Phase 1: process-per-domain, shared Postgres + Redis.
 * Phase 2: DB ownership split + inter-service HTTP/events.
 */

export type ServiceId = 'auth' | 'users' | 'fleet' | 'finance' | 'admin' | 'gateway';

export interface ServiceDefinition {
  id: ServiceId;
  name: string;
  /** Default process port when run standalone */
  defaultPort: number;
  envUrlKey: string;
  /** Path prefixes under API_PREFIX that this service owns */
  apiMounts: string[];
  needsRedis: boolean;
}

export const DOMAIN_SERVICES: ServiceDefinition[] = [
  {
    id: 'auth',
    name: 'auth-service',
    defaultPort: 3001,
    envUrlKey: 'AUTH_SERVICE_URL',
    apiMounts: ['/auth'],
    needsRedis: true,
  },
  {
    id: 'users',
    name: 'user-service',
    defaultPort: 3002,
    envUrlKey: 'USERS_SERVICE_URL',
    apiMounts: ['/onboarding', '/users', '/trips'],
    needsRedis: true,
  },
  {
    id: 'fleet',
    name: 'fleet-service',
    defaultPort: 3003,
    envUrlKey: 'FLEET_SERVICE_URL',
    apiMounts: ['/fleet', '/admin/fleets'],
    needsRedis: false,
  },
  {
    id: 'finance',
    name: 'finance-service',
    defaultPort: 3004,
    envUrlKey: 'FINANCE_SERVICE_URL',
    apiMounts: ['/admin/finance'],
    needsRedis: false,
  },
  {
    id: 'admin',
    name: 'admin-service',
    defaultPort: 3005,
    envUrlKey: 'ADMIN_SERVICE_URL',
    apiMounts: [
      '/admin/users',
      '/admin/permissions',
      '/admin/roles',
      '/admin/regions',
      '/admin/me',
      '/admin/dashboard',
      '/admin/audit-logs',
      '/admin/ratings',
    ],
    needsRedis: false,
  },
];

export const GATEWAY: ServiceDefinition = {
  id: 'gateway',
  name: 'api-gateway',
  defaultPort: 3000,
  envUrlKey: 'GATEWAY_URL',
  apiMounts: [],
  needsRedis: false,
};

export function resolveServiceUrl(def: ServiceDefinition): string {
  const fromEnv = process.env[def.envUrlKey];
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return `http://127.0.0.1:${def.defaultPort}`;
}
