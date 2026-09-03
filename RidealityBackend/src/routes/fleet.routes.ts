import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticate, AuthRequest, requirePasswordResetComplete } from '../middleware/auth';
import { loadAdminPermissions, requirePermissionInScope, PERMISSION_KEYS, AdminAuthRequest } from '../middleware/permissions';
import { validate } from '../middleware/validate';
import { sendSuccess } from '../utils/response';
import { param } from '../utils/params';
import * as fleetService from '../services/fleet.service';
import * as fleetPortalService from '../services/fleet-portal.service';
import * as fleetHierarchy from '../services/fleet-hierarchy.service';
import * as financeService from '../services/finance.service';
import {
  createFleetSchema,
  updateFleetSchema,
  fleetInviteSchema,
  inviteCandidateSearchSchema,
  updateFleetDriverSchema,
  fleetListQuerySchema,
  updateFleetVehicleSchema,
  createFleetVehicleSchema,
  teamInviteSchema,
  updateTeamMemberSchema,
  fleetReportsQuerySchema,
  fleetExportQuerySchema,
  createFleetRegionSchema,
  regionInviteSchema,
  reviewFleetDocumentSchema,
  fleetDriversQuerySchema,
  createFleetStaffSchema,
  reviewFleetComplaintSchema,
  publicFleetCompaniesQuerySchema,
  publicFleetCitiesQuerySchema,
  publicFleetCompanyDetailQuerySchema,
  createFleetDriverCreditSchema,
  listFleetDriverCreditsQuerySchema,
  reviewFleetDriverCreditSchema,
} from '../validators/fleet.validator';
import {
  createPayoutRequestSchema,
  fleetPayoutBodySchema,
  listWalletTransactionsSchema,
} from '../validators/finance.validator';
import { sendPaginated } from '../utils/response';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get(
  '/companies',
  validate(publicFleetCompaniesQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const query = req.query as {
        regionId?: string;
        regionCode?: string;
        cityId?: string;
        search?: string;
        sort?: 'top' | 'name';
        limit?: number;
      };
      const data = await fleetHierarchy.listPublicFleetCompanies(query);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/cities',
  validate(publicFleetCitiesQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const regionId = String(req.query.regionId);
      const data = await fleetHierarchy.listPublicSignupCities(regionId);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/companies/:id/public',
  validate(publicFleetCompanyDetailQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const cityId = typeof req.query.cityId === 'string' ? req.query.cityId : undefined;
      const data = await fleetHierarchy.getPublicFleetCompany(param(req.params.id), cityId);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/companies/:id/regions', async (req, res, next) => {
  try {
    const data = await fleetHierarchy.listPublicFleetRegions(param(req.params.id));
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.use(authenticate, requirePasswordResetComplete);

router.post('/companies', validate(createFleetSchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await fleetService.createFleetCompany(req.user!.sub, req.body);
    sendSuccess(res, data, 201);
  } catch (err) {
    next(err);
  }
});

router.get('/companies/:id/map', async (req: AuthRequest, res, next) => {
  try {
    const data = await fleetPortalService.getFleetMapData(param(req.params.id), req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get(
  '/companies/:id/vehicles',
  validate(fleetListQuerySchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const query = req.query as unknown as z.infer<typeof fleetListQuerySchema>;
      const { vehicles, total } = await fleetPortalService.listFleetVehicles(
        param(req.params.id),
        req.user!.sub,
        query,
      );
      sendPaginated(res, vehicles, { page: query.page, limit: query.limit, total });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/companies/:id/vehicles',
  validate(createFleetVehicleSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await fleetPortalService.createFleetVehicle(
        param(req.params.id),
        req.user!.sub,
        req.body,
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/companies/:id/vehicles/:vehicleId',
  validate(updateFleetVehicleSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await fleetPortalService.updateFleetVehicle(
        param(req.params.id),
        req.user!.sub,
        param(req.params.vehicleId),
        req.body,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/companies/:id/vehicles/:vehicleId',
  async (req: AuthRequest, res, next) => {
    try {
      const data = await fleetPortalService.deleteFleetVehicle(
        param(req.params.id),
        req.user!.sub,
        param(req.params.vehicleId),
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/companies/:id/trips',
  validate(fleetListQuerySchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const query = req.query as unknown as z.infer<typeof fleetListQuerySchema>;
      const { trips, total } = await fleetPortalService.listFleetTrips(
        param(req.params.id),
        req.user!.sub,
        query,
      );
      sendPaginated(res, trips, { page: query.page, limit: query.limit, total });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/companies/:id/trips/:tripId', async (req: AuthRequest, res, next) => {
  try {
    const data = await fleetPortalService.getFleetTrip(
      param(req.params.id),
      req.user!.sub,
      param(req.params.tripId),
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get('/companies/:id/earnings', async (req: AuthRequest, res, next) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const data = await fleetPortalService.getFleetEarnings(param(req.params.id), req.user!.sub, {
      from,
      to,
    });
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get(
  '/companies/:id/reports',
  validate(fleetReportsQuerySchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const query = req.query as unknown as z.infer<typeof fleetReportsQuerySchema>;
      const data = await fleetPortalService.getFleetReports(
        param(req.params.id),
        req.user!.sub,
        query,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/companies/:id/notifications',
  validate(fleetListQuerySchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const query = req.query as unknown as z.infer<typeof fleetListQuerySchema>;
      const data = await fleetPortalService.listFleetNotifications(
        param(req.params.id),
        req.user!.sub,
        {
          page: query.page,
          limit: query.limit,
          unreadOnly: query.unreadOnly,
        },
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.patch('/companies/:id/notifications/read-all', async (req: AuthRequest, res, next) => {
  try {
    const data = await fleetPortalService.markAllFleetNotificationsRead(
      param(req.params.id),
      req.user!.sub,
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.patch('/companies/:id/notifications/:notificationId/read', async (req: AuthRequest, res, next) => {
  try {
    const data = await fleetPortalService.markFleetNotificationRead(
      param(req.params.id),
      req.user!.sub,
      param(req.params.notificationId),
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get('/companies/:id/documents', async (req: AuthRequest, res, next) => {
  try {
    const { status, search } = req.query as { status?: string; search?: string };
    const expiringWithinDays = req.query.expiringWithinDays
      ? Number(req.query.expiringWithinDays)
      : undefined;
    const data = await fleetPortalService.listFleetDocuments(
      param(req.params.id),
      req.user!.sub,
      {
        status: status as import('@prisma/client').DocumentStatus | undefined,
        search,
        expiringWithinDays,
      },
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/companies/:id/documents/:documentId',
  validate(reviewFleetDocumentSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const status = String(req.body.status).toLowerCase() as 'approved' | 'rejected';
      const data = await fleetHierarchy.reviewFleetDocument(
        param(req.params.id),
        req.user!.sub,
        param(req.params.documentId),
        { status, rejectionReason: req.body.rejectionReason },
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/documents/:id/approve',
  authenticate,
  requirePasswordResetComplete,
  loadAdminPermissions,
  requirePermissionInScope(PERMISSION_KEYS.DRIVER_APPROVE),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const data = await fleetHierarchy.reviewFleetDocumentById(
        req.user!.sub,
        param(req.params.id),
        { status: 'approved' },
        req.adminAssignment?.cityId,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/documents/:id/reject',
  authenticate,
  requirePasswordResetComplete,
  loadAdminPermissions,
  requirePermissionInScope(PERMISSION_KEYS.DRIVER_REJECT),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const reason =
        typeof req.body?.rejectionReason === 'string' ? req.body.rejectionReason : undefined;
      const data = await fleetHierarchy.reviewFleetDocumentById(
        req.user!.sub,
        param(req.params.id),
        { status: 'rejected', rejectionReason: reason },
        req.adminAssignment?.cityId,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/companies/:id/regions',
  validate(createFleetRegionSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await fleetHierarchy.createFleetRegion(
        param(req.params.id),
        req.user!.sub,
        req.body,
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/companies/:id/managed-regions', async (req: AuthRequest, res, next) => {
  try {
    const data = await fleetHierarchy.listFleetRegions(param(req.params.id), req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get('/companies/:id/regions/:regionId', async (req: AuthRequest, res, next) => {
  try {
    const data = await fleetHierarchy.getFleetCityProfile(
      param(req.params.id),
      req.user!.sub,
      param(req.params.regionId),
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get('/companies/:id/regions/:regionId/services', async (req: AuthRequest, res, next) => {
  try {
    const data = await fleetHierarchy.getFleetCityServicesForAdmin(
      param(req.params.id),
      req.user!.sub,
      param(req.params.regionId),
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.put(
  '/companies/:id/regions/:regionId/services',
  validate(
    z.object({
      products: z
        .array(z.object({ code: z.string().min(1).max(32), enabled: z.boolean() }))
        .min(1)
        .max(20),
    }),
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await fleetHierarchy.setFleetCityServices(
        param(req.params.id),
        req.user!.sub,
        param(req.params.regionId),
        req.body.products,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/companies/:id/complaints/:complaintId',
  validate(reviewFleetComplaintSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await fleetHierarchy.reviewFleetCityComplaint(
        param(req.params.id),
        req.user!.sub,
        param(req.params.complaintId),
        req.body,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/companies/:id/regions/:regionId/invites',
  validate(regionInviteSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await fleetHierarchy.inviteRegionalFleet(
        param(req.params.id),
        req.user!.sub,
        param(req.params.regionId),
        req.body,
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/companies/:id/support-invites',
  validate(regionInviteSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await fleetHierarchy.inviteFleetSupport(
        param(req.params.id),
        req.user!.sub,
        req.body,
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/companies/:id/regions/:regionId/support-invites',
  validate(regionInviteSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await fleetHierarchy.inviteFleetSupport(
        param(req.params.id),
        req.user!.sub,
        { ...req.body, fleetRegionId: param(req.params.regionId) },
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/companies/:id/audit-logs',
  validate(fleetListQuerySchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const query = req.query as unknown as z.infer<typeof fleetListQuerySchema>;
      const { logs, total } = await fleetPortalService.listFleetAuditLogs(
        param(req.params.id),
        req.user!.sub,
        { page: query.page, limit: query.limit },
      );
      sendPaginated(res, logs, { page: query.page, limit: query.limit, total });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/companies/:id/exports/trips',
  validate(fleetExportQuerySchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const query = req.query as unknown as z.infer<typeof fleetExportQuerySchema>;
      const csv = await fleetPortalService.exportFleetTripsCsv(
        param(req.params.id),
        req.user!.sub,
        query,
      );
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="fleet-trips.csv"');
      res.send(csv);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/companies/:id/exports/wallet-statement',
  validate(fleetExportQuerySchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const query = req.query as unknown as z.infer<typeof fleetExportQuerySchema>;
      const csv = await fleetPortalService.exportFleetWalletStatementCsv(
        param(req.params.id),
        req.user!.sub,
        query,
      );
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="fleet-wallet-statement.csv"');
      res.send(csv);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/companies/:id/team/users',
  validate(createFleetStaffSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await fleetHierarchy.createFleetStaffUser(
        param(req.params.id),
        req.user!.sub,
        req.body,
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/companies/:id/team/invites',
  validate(teamInviteSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await fleetPortalService.createTeamInvite(
        param(req.params.id),
        req.user!.sub,
        req.body,
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/companies/:id/team/:membershipId',
  validate(updateTeamMemberSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await fleetPortalService.updateTeamMember(
        param(req.params.id),
        req.user!.sub,
        param(req.params.membershipId),
        req.body,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/companies/:id/team/:membershipId', async (req: AuthRequest, res, next) => {
  try {
    const data = await fleetPortalService.removeTeamMember(
      param(req.params.id),
      req.user!.sub,
      param(req.params.membershipId),
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.post('/companies/:id/team/:membershipId/reset-password', async (req: AuthRequest, res, next) => {
  try {
    const data = await fleetPortalService.resetFleetStaffPassword(
      param(req.params.id),
      req.user!.sub,
      param(req.params.membershipId),
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get('/companies/:id/dashboard', async (req: AuthRequest, res, next) => {
  try {
    const data = await fleetService.getFleetDashboard(
      param(req.params.id),
      req.user!.sub,
      req.user!.platformRoles,
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get('/companies/:id/invites', async (req: AuthRequest, res, next) => {
  try {
    const data = await fleetService.listFleetInvites(param(req.params.id), req.user!.sub);
    sendSuccess(res, { invites: data });
  } catch (err) {
    next(err);
  }
});

router.get('/companies/:id/team', async (req: AuthRequest, res, next) => {
  try {
    const data = await fleetService.listFleetTeamMembers(param(req.params.id), req.user!.sub);
    sendSuccess(res, { members: data });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/companies/:id/payouts',
  validate(listWalletTransactionsSchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const wallet = await financeService.getFleetFinanceForUser(
        param(req.params.id),
        req.user!.sub,
        req.user!.platformRoles,
      );
      const query = req.query as unknown as { page: number; limit: number };
      const { payouts, total } = await financeService.listPayouts({
        page: query.page,
        limit: query.limit,
        walletId: wallet.id,
      });
      sendPaginated(res, payouts, { page: query.page, limit: query.limit, total });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/companies/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = await fleetService.getFleetCompany(param(req.params.id), req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.patch('/companies/:id', validate(updateFleetSchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await fleetService.updateFleetCompany(param(req.params.id), req.user!.sub, req.body);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.post('/companies/:id/logo', upload.single('logo'), async (req: AuthRequest, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'Logo file required' },
      });
      return;
    }
    const data = await fleetService.updateFleetCompanyLogo(param(req.params.id), req.user!.sub, req.file);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/companies/:id/invites',
  validate(fleetInviteSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await fleetService.createFleetInvite(param(req.params.id), req.user!.sub, req.body);
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/companies/:id/invite-candidates',
  validate(inviteCandidateSearchSchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const { search } = req.query as unknown as { search: string };
      const data = await fleetService.searchFleetInviteCandidates(
        param(req.params.id),
        req.user!.sub,
        search,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.post('/invites/:token/accept', async (req: AuthRequest, res, next) => {
  try {
    const data = await fleetService.acceptFleetInvite(param(req.params.token), req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.post('/invites/:token/reject', async (req: AuthRequest, res, next) => {
  try {
    const data = await fleetService.rejectFleetInvite(param(req.params.token), req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get('/me/invites', async (req: AuthRequest, res, next) => {
  try {
    const data = await fleetService.listMyFleetInvites(req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get(
  '/companies/:id/drivers',
  validate(fleetDriversQuerySchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const { regionId } = req.query as { regionId?: string };
      const data = await fleetService.listFleetDrivers(param(req.params.id), req.user!.sub, {
        fleetRegionId: regionId,
      });
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/companies/:id/drivers/:userId', async (req: AuthRequest, res, next) => {
  try {
    const data = await fleetService.getFleetDriverDetail(
      param(req.params.id),
      req.user!.sub,
      param(req.params.userId),
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/companies/:id/drivers/:userId',
  validate(updateFleetDriverSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await fleetService.updateFleetDriver(
        param(req.params.id),
        req.user!.sub,
        param(req.params.userId),
        req.body,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/companies/:id/drivers/:userId', async (req: AuthRequest, res, next) => {
  try {
    const data = await fleetService.removeFleetDriver(
      param(req.params.id),
      req.user!.sub,
      param(req.params.userId),
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get('/companies/:id/wallet', async (req: AuthRequest, res, next) => {
  try {
    const data = await financeService.getFleetFinanceForUser(
      param(req.params.id),
      req.user!.sub,
      req.user!.platformRoles,
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get(
  '/companies/:id/wallet/transactions',
  validate(listWalletTransactionsSchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const wallet = await financeService.getFleetFinanceForUser(
        param(req.params.id),
        req.user!.sub,
        req.user!.platformRoles,
      );
      const query = req.query as unknown as { page: number; limit: number };
      const { transactions, total } = await financeService.listWalletTransactions(
        wallet.id,
        query.page,
        query.limit,
      );
      sendPaginated(res, transactions, { page: query.page, limit: query.limit, total });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/companies/:id/payouts',
  validate(fleetPayoutBodySchema),
  async (req: AuthRequest, res, next) => {
    try {
      const wallet = await financeService.getFleetFinanceForUser(
        param(req.params.id),
        req.user!.sub,
        req.user!.platformRoles,
      );
      const data = await financeService.createPayoutRequest(
        req.user!.sub,
        req.user!.platformRoles,
        { ...req.body, walletId: wallet.id },
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/companies/:id/driver-credits',
  validate(listFleetDriverCreditsQuerySchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const query = req.query as unknown as {
        status?: 'pending' | 'approved' | 'rejected';
        page: number;
        limit: number;
      };
      const { credits, total } = await financeService.listFleetDriverCredits(
        param(req.params.id),
        req.user!.sub,
        query,
      );
      sendPaginated(res, credits, { page: query.page, limit: query.limit, total });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/companies/:id/driver-credits',
  validate(createFleetDriverCreditSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await financeService.requestFleetDriverCredit(
        param(req.params.id),
        req.user!.sub,
        req.body,
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/companies/:id/driver-credits/:creditId/review',
  validate(reviewFleetDriverCreditSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await financeService.reviewFleetDriverCredit(
        param(req.params.id),
        req.user!.sub,
        req.user!.platformRoles,
        param(req.params.creditId),
        req.body.action,
        req.body.reviewNote,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
