import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, 'Rideality.postman_collection.json');

const bearer = (tokenVar) => ({
  type: 'bearer',
  bearer: [{ key: 'token', value: `{{${tokenVar}}}`, type: 'string' }],
});

const jsonHeader = [{ key: 'Content-Type', value: 'application/json' }];

function url(pathSegments, query) {
  const rawPath = pathSegments.join('/');
  const queryStr = query?.length
    ? `?${query.map((q) => `${q.key}=${q.value}`).join('&')}`
    : '';
  return {
    raw: `{{baseUrl}}/${rawPath}${queryStr}`,
    host: ['{{baseUrl}}'],
    path: pathSegments,
    ...(query?.length ? { query } : {}),
  };
}

function hostUrl(pathSegments) {
  return {
    raw: `{{baseHost}}/${pathSegments.join('/')}`,
    host: ['{{baseHost}}'],
    path: pathSegments,
  };
}

function body(obj) {
  return {
    mode: 'raw',
    raw: JSON.stringify(obj, null, 2),
    options: { raw: { language: 'json' } },
  };
}

function formBody(fields) {
  return { mode: 'formdata', formdata: fields };
}

function request(method, pathSegments, opts = {}) {
  const { description = '', query, reqBody, auth, disabledHeader } = opts;
  return {
    method,
    header: disabledHeader ? [{ key: 'Content-Type', value: 'application/json', disabled: true }] : jsonHeader,
    url: url(pathSegments, query),
    description,
    ...(reqBody ? { body: reqBody } : {}),
    ...(auth ? { auth } : {}),
  };
}

function item(name, method, pathSegments, opts = {}) {
  const { test, ...reqOpts } = opts;
  const entry = { name, request: request(method, pathSegments, reqOpts) };
  if (test) {
    entry.event = [{ listen: 'test', script: { type: 'text/javascript', exec: test } }];
  }
  return entry;
}

function folder(name, description, children, auth) {
  return {
    name,
    description,
    ...(auth ? { auth } : {}),
    item: children,
  };
}

// ─── Test scripts ───────────────────────────────────────────────────────────

const SAVE_OTP_TOKENS = [
  'if (pm.response.code === 200) {',
  '  const json = pm.response.json();',
  '  if (json.data?.accessToken) {',
  "    pm.collectionVariables.set('accessToken', json.data.accessToken);",
  "    pm.collectionVariables.set('refreshToken', json.data.refreshToken);",
  "    if (json.data.sessionId) pm.collectionVariables.set('sessionId', json.data.sessionId);",
  "    if (json.data.user?.id) pm.collectionVariables.set('userId', json.data.user.id);",
  '  }',
  "  if (typeof json.data?.isNewUser === 'boolean') {",
  "    console.log('isNewUser=', json.data.isNewUser);",
  '  }',
  '  if (json.data?.user?.onboarding) {',
  "    console.log('onboarding=', JSON.stringify(json.data.user.onboarding));",
  '  }',
  '}',
];

const SAVE_DOCUMENT_ID = [
  'if (pm.response.code === 200 || pm.response.code === 201) {',
  '  const json = pm.response.json();',
  "  if (json.data?.id) pm.collectionVariables.set('documentId', json.data.id);",
  '}',
];

const LOG_ONBOARDING = [
  'if (pm.response.code === 200) {',
  '  const json = pm.response.json();',
  '  const ob = json.data?.onboarding || json.data;',
  "  if (ob?.pending_steps) console.log('pending_steps=', JSON.stringify(ob.pending_steps));",
  "  if (ob?.profile_complete != null) console.log('profile_complete=', ob.profile_complete);",
  "  if (json.data?.capabilities) console.log('capabilities=', JSON.stringify(json.data.capabilities));",
  '}',
];

const SAVE_REFRESH = [
  'if (pm.response.code === 200) {',
  '  const json = pm.response.json();',
  "  if (json.data?.accessToken) pm.collectionVariables.set('accessToken', json.data.accessToken);",
  '}',
];

const SAVE_ADMIN_LOGIN = [
  'if (pm.response.code === 200) {',
  '  const json = pm.response.json();',
  '  if (json.data?.accessToken) {',
  "    pm.collectionVariables.set('adminAccessToken', json.data.accessToken);",
  "    if (json.data.refreshToken) pm.collectionVariables.set('refreshToken', json.data.refreshToken);",
  "    if (json.data.user?.id) pm.collectionVariables.set('userId', json.data.user.id);",
  '    if (json.data.mustResetPassword) {',
  "      console.log('mustResetPassword=true — run Admin Change Password before other protected admin APIs');",
  '    }',
  '  }',
  '}',
];

const SAVE_USER_ID = [
  'if (pm.response.code === 200 || pm.response.code === 201) {',
  '  const json = pm.response.json();',
  "  if (json.data?.id) pm.collectionVariables.set('userId', json.data.id);",
  '}',
];

const SAVE_USER_ID_FROM_LIST = [
  'if (pm.response.code === 200) {',
  '  const json = pm.response.json();',
  '  const first = json.data?.[0];',
  "  if (first?.id) pm.collectionVariables.set('userId', first.id);",
  '}',
];

const SAVE_COMPANY_ID = [
  'if (pm.response.code === 200 || pm.response.code === 201) {',
  '  const json = pm.response.json();',
  "  if (json.data?.id) pm.collectionVariables.set('companyId', json.data.id);",
  '}',
];

const SAVE_INVITE_TOKEN = [
  'if (pm.response.code === 200 || pm.response.code === 201) {',
  '  const json = pm.response.json();',
  "  if (json.data?.token) pm.collectionVariables.set('inviteToken', json.data.token);",
  '}',
];

const SAVE_PERMISSION_ID = [
  'if (pm.response.code === 200 || pm.response.code === 201) {',
  '  const json = pm.response.json();',
  "  if (json.data?.id) pm.collectionVariables.set('permissionId', json.data.id);",
  '}',
];

const SAVE_PERMISSION_FROM_CATALOG = [
  'if (pm.response.code === 200) {',
  '  const json = pm.response.json();',
  '  const items = json.data || [];',
  '  const manageUsers = items.find((p) => p.permission === "manage_users");',
  '  const manageFleets = items.find((p) => p.permission === "manage_fleets");',
  "  if (manageUsers?.id) pm.collectionVariables.set('permissionId', manageUsers.id);",
  "  if (manageFleets?.id) pm.collectionVariables.set('manageFleetsPermissionId', manageFleets.id);",
  '}',
];

const SAVE_ROLE_ID = [
  'if (pm.response.code === 200 || pm.response.code === 201) {',
  '  const json = pm.response.json();',
  "  if (json.data?.id) pm.collectionVariables.set('roleId', json.data.id);",
  '}',
];

const SAVE_REGION_ID = [
  'if (pm.response.code === 200) {',
  '  const json = pm.response.json();',
  '  const items = json.data || [];',
  '  if (items[0]?.id) pm.collectionVariables.set("regionId", items[0].id);',
  '}',
];

const SAVE_REGION_ID_SINGLE = [
  'if (pm.response.code === 200 || pm.response.code === 201) {',
  '  const json = pm.response.json();',
  "  if (json.data?.id) pm.collectionVariables.set('regionId', json.data.id);",
  '}',
];

const SAVE_WALLET_ID = [
  'if (pm.response.code === 200) {',
  '  const json = pm.response.json();',
  '  const first = json.data?.[0] || json.data?.wallets?.[0];',
  "  if (first?.id) pm.collectionVariables.set('walletId', first.id);",
  '}',
];

const SAVE_WALLET_ID_SINGLE = [
  'if (pm.response.code === 200 || pm.response.code === 201) {',
  '  const json = pm.response.json();',
  "  if (json.data?.id) pm.collectionVariables.set('walletId', json.data.id);",
  '}',
];

const SAVE_ADJUSTMENT_ID = [
  'if (pm.response.code === 200 || pm.response.code === 201) {',
  '  const json = pm.response.json();',
  "  if (json.data?.id) pm.collectionVariables.set('adjustmentId', json.data.id);",
  '}',
];

const SAVE_ADJUSTMENT_ID_FROM_LIST = [
  'if (pm.response.code === 200) {',
  '  const json = pm.response.json();',
  '  const first = json.data?.[0];',
  "  if (first?.id) pm.collectionVariables.set('adjustmentId', first.id);",
  '}',
];

const SAVE_PAYOUT_ID = [
  'if (pm.response.code === 200 || pm.response.code === 201) {',
  '  const json = pm.response.json();',
  "  if (json.data?.id) pm.collectionVariables.set('payoutId', json.data.id);",
  '}',
];

const SAVE_PAYOUT_ID_FROM_LIST = [
  'if (pm.response.code === 200) {',
  '  const json = pm.response.json();',
  '  const first = json.data?.[0];',
  "  if (first?.id) pm.collectionVariables.set('payoutId', first.id);",
  '}',
];

const SAVE_RIDE_ID = [
  'if (pm.response.code === 200) {',
  '  const json = pm.response.json();',
  '  const first = json.data?.[0];',
  "  if (first?.id) pm.collectionVariables.set('rideId', first.id);",
  '}',
];

const SAVE_VEHICLE_ID = [
  'if (pm.response.code === 200 || pm.response.code === 201) {',
  '  const json = pm.response.json();',
  "  if (json.data?.id) pm.collectionVariables.set('vehicleId', json.data.id);",
  '  const first = json.data?.[0];',
  "  if (first?.id) pm.collectionVariables.set('vehicleId', first.id);",
  '}',
];

const SAVE_TRIP_ID = [
  'if (pm.response.code === 200) {',
  '  const json = pm.response.json();',
  '  const first = json.data?.[0];',
  "  if (first?.id) pm.collectionVariables.set('tripId', first.id);",
  '}',
];

const SAVE_MEMBERSHIP_ID = [
  'if (pm.response.code === 200 || pm.response.code === 201) {',
  '  const json = pm.response.json();',
  "  if (json.data?.id) pm.collectionVariables.set('membershipId', json.data.id);",
  '  const first = json.data?.members?.[0] || json.data?.[0];',
  "  if (first?.id) pm.collectionVariables.set('membershipId', first.id);",
  '}',
];

const SAVE_NOTIFICATION_ID = [
  'if (pm.response.code === 200) {',
  '  const json = pm.response.json();',
  '  const first = json.data?.notifications?.[0] || json.data?.[0];',
  "  if (first?.id) pm.collectionVariables.set('notificationId', first.id);",
  '}',
];

const SAVE_RATING_ID = [
  'if (pm.response.code === 200) {',
  '  const json = pm.response.json();',
  '  const first = json.data?.[0] || json.data?.ratings?.[0];',
  "  if (first?.id) pm.collectionVariables.set('ratingId', first.id);",
  '}',
];

const SAVE_LOCATION_ID = [
  'if (pm.response.code === 200 || pm.response.code === 201) {',
  '  const json = pm.response.json();',
  '  const first = Array.isArray(json.data) ? json.data[0] : json.data?.locations?.[0] || json.data;',
  "  if (first?.id) pm.collectionVariables.set('locationId', first.id);",
  '}',
];

// ─── Folders ────────────────────────────────────────────────────────────────

const healthFolder = folder('Health', 'Service health (no auth).', [
  {
    name: 'Health Check',
    request: {
      method: 'GET',
      header: jsonHeader,
      url: hostUrl(['health']),
      description: 'Returns service status. Uses {{baseHost}}/health (not baseUrl).',
    },
  },
]);

const authFolder = folder('Auth', 'Authentication for mobile app (OTP) and admin portal (email/password).', [
  item('List Regions', 'GET', ['auth', 'regions'], {
    description:
      'Flutter Step 0 — load active regions before phone entry. Returns code, name, phonePrefix, currency. Use region `code` as `regionCode` in OTP calls.',
  }),
  item('Send OTP', 'POST', ['auth', 'otp', 'send'], {
    description: 'Send OTP to phone. Dev bypass code: {{devOtpCode}}. Body: `{ phone, regionCode? }`.',
    reqBody: body({ phone: '{{phone}}', regionCode: '{{regionCode}}' }),
  }),
  item('Verify OTP', 'POST', ['auth', 'otp', 'verify'], {
    description:
      'Verify OTP → accessToken + refreshToken + `isNewUser` + `user.onboarding`. Saves tokens to collection vars.',
    reqBody: body({ phone: '{{phone}}', code: '{{devOtpCode}}', regionCode: '{{regionCode}}' }),
    test: SAVE_OTP_TOKENS,
  }),
  item('Refresh Token', 'POST', ['auth', 'refresh'], {
    description: 'Refresh access token.',
    reqBody: body({ refreshToken: '{{refreshToken}}' }),
    test: SAVE_REFRESH,
  }),
  item('Logout', 'POST', ['auth', 'logout'], {
    description: 'Logout current session.',
    reqBody: body({ refreshToken: '{{refreshToken}}' }),
    auth: bearer('accessToken'),
  }),
  item('Revoke Session', 'DELETE', ['auth', 'sessions', '{{sessionId}}'], {
    description: 'Revoke a specific session by ID.',
    auth: bearer('accessToken'),
  }),
  item('Admin Login', 'POST', ['auth', 'admin', 'login'], {
    description:
      'Admin portal login. Response includes mustResetPassword when default password is active.',
    reqBody: body({ email: 'admin@rideality.com', password: 'Admin@123456' }),
    test: SAVE_ADMIN_LOGIN,
  }),
  item('Admin Change Password', 'POST', ['auth', 'admin', 'change-password'], {
    description:
      'Required after first login when mustResetPassword=true. Admin-created users use {{defaultUserPassword}} as current password.',
    reqBody: body({ currentPassword: '{{defaultUserPassword}}', newPassword: 'NewSecurePass123' }),
    auth: bearer('adminAccessToken'),
  }),
]);

const userAuth = bearer('accessToken');

// ─── Flutter mobile onboarding (ordered flows) ─────────────────────────────

const passengerOnboardingFolder = folder(
  'Mobile — Passenger Onboarding',
  [
    'Flutter passenger signup / onboarding — run in order.',
    '',
    '**Primary signup API (no "me" in path):**',
    '- `POST /onboarding/passenger` — after OTP',
    '- `GET /onboarding/status` — progress + capabilities',
    '',
    '**Gates**',
    '- `can_book` = phone verified + fullName',
    '- `profile_complete` = phone + fullName + ≥1 saved location',
    '',
    '**Auth:** Bearer {{accessToken}} after OTP. Phone comes from the session (not re-sent).',
    '',
    '**Env vars:** `phone`, `regionCode` (PK), `devOtpCode` (123456 in dev).',
  ].join('\n'),
  [
    item('01 List Regions', 'GET', ['auth', 'regions'], {
      description: 'Public. Pick region `code` → `{{regionCode}}`.',
    }),
    item('02 Send OTP', 'POST', ['auth', 'otp', 'send'], {
      description: 'POST /auth/otp/send — `{ phone, regionCode? }`.',
      reqBody: body({ phone: '{{phone}}', regionCode: '{{regionCode}}' }),
    }),
    item('03 Verify OTP', 'POST', ['auth', 'otp', 'verify'], {
      description:
        'Returns tokens + isNewUser + user.onboarding. Saves accessToken. Dev OTP: {{devOtpCode}}',
      reqBody: body({ phone: '{{phone}}', code: '{{devOtpCode}}', regionCode: '{{regionCode}}' }),
      test: SAVE_OTP_TOKENS,
    }),
    item('04 Passenger Signup', 'POST', ['onboarding', 'passenger'], {
      description: [
        'POST /onboarding/passenger — complete passenger signup after OTP.',
        'Required: fullName.',
        'Optional: email, dateOfBirth, gender, profession, preferredLanguage,',
        'emergencyContact*, location{}, acceptTerms/Privacy/Marketing, promoOptIn, consentVersion.',
        'Mobile number is NOT in body — taken from OTP session.',
        'Response: { type, user, onboarding, next_steps }.',
      ].join('\n'),
      reqBody: body({
        fullName: 'Ali Khan',
        email: 'ali.khan@example.com',
        dateOfBirth: '1995-06-15',
        gender: 'male',
        profession: 'student',
        preferredLanguage: 'en',
        emergencyContactName: 'Ayesha Khan',
        emergencyContactPhone: '+923009876543',
        acceptTerms: true,
        acceptPrivacy: true,
        acceptMarketing: false,
        promoOptIn: true,
        consentVersion: '1.0',
        location: {
          label: 'home',
          address: 'Gulberg III, Lahore',
          latitude: 31.5204,
          longitude: 74.3587,
          isDefault: true,
        },
      }),
      auth: userAuth,
      test: LOG_ONBOARDING,
    }),
    item('05 Get Onboarding Status', 'GET', ['onboarding', 'status'], {
      description:
        'GET /onboarding/status — pending_steps, profile_complete, capabilities.can_book / can_drive.',
      auth: userAuth,
      test: LOG_ONBOARDING,
    }),
    item('06 Upload Avatar (optional)', 'POST', ['users', 'me', 'photo'], {
      description: 'Multipart field `photo` (max 5MB). Legacy path still uses /users/me/photo.',
      disabledHeader: true,
      reqBody: formBody([{ key: 'photo', type: 'file', src: [] }]),
      auth: userAuth,
    }),
    item('07 Get Passenger View', 'GET', ['users', 'me', 'passenger'], {
      description: 'Passenger profile view (loyalty, places, wallet summary).',
      auth: userAuth,
    }),
  ],
);

const driverOnboardingFolder = folder(
  'Mobile — Driver Onboarding',
  [
    'Flutter driver signup / onboarding — run in order.',
    '',
    '**Primary signup API (no "me" in path):**',
    '- `POST /onboarding/driver` — basic identity after OTP (creates DriverProfile draft)',
    '- `GET /onboarding/status`',
    '',
    '**Then (existing APIs):** vehicle → documents → wait for approval → go online',
    '',
    '**Gates**',
    '- documents_uploaded = type driver_license only',
    '- can_drive only when onboardingStatus=approved + user ACTIVE',
    '',
    '**Auth:** Bearer {{accessToken}}. Phone from session.',
  ].join('\n'),
  [
    item('01 List Regions', 'GET', ['auth', 'regions'], {
      description: 'Public regions list.',
    }),
    item('02 Send OTP', 'POST', ['auth', 'otp', 'send'], {
      description: 'Use a unique {{phone}} for driver test users.',
      reqBody: body({ phone: '{{phone}}', regionCode: '{{regionCode}}' }),
    }),
    item('03 Verify OTP', 'POST', ['auth', 'otp', 'verify'], {
      description: 'Saves accessToken. Dev OTP: {{devOtpCode}}',
      reqBody: body({ phone: '{{phone}}', code: '{{devOtpCode}}', regionCode: '{{regionCode}}' }),
      test: SAVE_OTP_TOKENS,
    }),
    item('04 Driver Signup', 'POST', ['onboarding', 'driver'], {
      description: [
        'POST /onboarding/driver — complete driver identity signup.',
        'Required: fullName, dateOfBirth (must be 18+).',
        'Optional: email, gender, profession, licenseNumber, licenseExpiry, location, consents.',
        'Creates DriverProfile (draft) + DRIVER role. Does NOT unlock driving yet.',
        'Response includes remaining: { vehicle, documents, approval }.',
      ].join('\n'),
      reqBody: body({
        fullName: 'Sara Driver',
        email: 'sara.driver@example.com',
        dateOfBirth: '1990-01-20',
        gender: 'female',
        profession: 'driver',
        preferredLanguage: 'en',
        licenseNumber: 'DL-1234567',
        licenseExpiry: '2030-12-31',
        emergencyContactName: 'Ahmed',
        emergencyContactPhone: '+923001112233',
        acceptTerms: true,
        acceptPrivacy: true,
        consentVersion: '1.0',
        location: {
          label: 'home',
          address: 'DHA Phase 5, Lahore',
          latitude: 31.4697,
          longitude: 74.4105,
          isDefault: true,
        },
      }),
      auth: userAuth,
      test: LOG_ONBOARDING,
    }),
    item('05 Get Onboarding Status', 'GET', ['onboarding', 'status'], {
      description: 'Expect next_steps: vehicle_info, documents_uploaded, driver_approved (as needed).',
      auth: userAuth,
      test: LOG_ONBOARDING,
    }),
    item('06 Register Vehicle', 'POST', ['users', 'me', 'driver', 'vehicle'], {
      description: 'Required: vehicleType, model, numberPlate. Optional seats/color/year.',
      reqBody: body({
        vehicleType: 'sedan',
        model: 'Toyota Corolla',
        numberPlate: 'LEA-1234',
        availableSeats: 4,
        color: 'white',
        year: 2022,
      }),
      auth: userAuth,
      test: LOG_ONBOARDING,
    }),
    item('07 Register Driver License (required)', 'POST', ['users', 'me', 'documents'], {
      description:
        'Only type driver_license clears documents gate. fileUrl = URL or /uploads/... path.',
      reqBody: body({
        type: 'driver_license',
        fileUrl: '/uploads/example-license.jpg',
        expiresAt: '2030-12-31',
      }),
      auth: userAuth,
      test: [...SAVE_DOCUMENT_ID, ...LOG_ONBOARDING],
    }),
    item('08 Register Selfie (recommended)', 'POST', ['users', 'me', 'documents'], {
      description: 'Recommended KYC; does not clear documents_uploaded alone.',
      reqBody: body({
        type: 'selfie',
        fileUrl: '/uploads/example-selfie.jpg',
      }),
      auth: userAuth,
      test: SAVE_DOCUMENT_ID,
    }),
    item('09 List Documents', 'GET', ['users', 'me', 'documents'], {
      description: 'pending | approved | rejected | expired',
      auth: userAuth,
    }),
    item('10 Get Driver View', 'GET', ['users', 'me', 'driver'], {
      description: 'onboardingStatus: draft | pending_review | approved | rejected | suspended',
      auth: userAuth,
      test: LOG_ONBOARDING,
    }),
    item('11 Switch to Driver Mode (fails until approved)', 'PATCH', ['users', 'me', 'mode'], {
      description: 'Expect 403 DRIVER_NOT_APPROVED until approved.',
      reqBody: body({ activeMode: 'driver' }),
      auth: userAuth,
    }),
    item('12 Go Online (fails until approved)', 'PATCH', ['users', 'me', 'driver', 'availability'], {
      description: 'Fails until can_drive.',
      reqBody: body({ isOnline: true }),
      auth: userAuth,
    }),
    item('13 Admin Approve Driver (ops)', 'PATCH', ['admin', 'users', '{{userId}}', 'driver', 'review'], {
      description: 'Ops only. Run Auth → Admin Login first. Then re-test switch/online.',
      reqBody: body({ action: 'approve' }),
      auth: bearer('adminAccessToken'),
    }),
    item('14 Switch to Driver Mode (after approve)', 'PATCH', ['users', 'me', 'mode'], {
      description: 'Should succeed after admin approval.',
      reqBody: body({ activeMode: 'driver' }),
      auth: userAuth,
    }),
    item('15 Go Online (after approve)', 'PATCH', ['users', 'me', 'driver', 'availability'], {
      description: 'can_drive unlocked.',
      reqBody: body({ isOnline: true }),
      auth: userAuth,
    }),
    item('16 Get Onboarding Status', 'GET', ['onboarding', 'status'], {
      description: 'Expect profile_complete / can_drive after full approval path.',
      auth: userAuth,
      test: LOG_ONBOARDING,
    }),
  ],
);

const profileFolder = folder(
  'Users — Profile & Onboarding',
  'Authenticated user profile and onboarding.',
  [
    item('Get My Profile', 'GET', ['users', 'me'], { description: 'Full profile + capabilities.' }),
    item('Update Profile (PATCH)', 'PATCH', ['users', 'me'], {
      description: 'Partial profile update.',
      reqBody: body({ fullName: 'Ali Khan', preferredLanguage: 'en' }),
    }),
    item('Complete Profile Wizard', 'POST', ['users', 'me', 'profile'], {
      description: 'Profile wizard step during onboarding.',
      reqBody: body({ fullName: 'Ali Khan', role: 'passenger', preferredLanguage: 'en' }),
    }),
    item('Get Onboarding Status', 'GET', ['users', 'me', 'onboarding'], {
      description: 'Onboarding checklist and pending steps.',
    }),
    item('Switch Mode', 'PATCH', ['users', 'me', 'mode'], {
      description: 'Switch between passenger and driver mode.',
      reqBody: body({ activeMode: 'passenger' }),
    }),
    item('Save Locations', 'POST', ['users', 'me', 'locations'], {
      description: 'Save home/work/custom locations.',
      reqBody: body({
        locations: [
          {
            label: 'home',
            address: 'Gulberg III, Lahore',
            latitude: 31.5204,
            longitude: 74.3587,
            isDefault: true,
          },
        ],
      }),
      test: SAVE_LOCATION_ID,
    }),
    item('Delete Location', 'DELETE', ['users', 'me', 'locations', '{{locationId}}'], {
      description: 'Remove a saved location by ID.',
    }),
    item('Record Consent', 'POST', ['users', 'me', 'consent'], {
      description: 'Record Terms of Use / Privacy Policy consent.',
      reqBody: body({
        consents: [
          { type: 'terms_of_use', version: '1.0', accepted: true },
          { type: 'privacy_policy', version: '1.0', accepted: true },
        ],
      }),
    }),
    item('Upload Avatar', 'POST', ['users', 'me', 'photo'], {
      description: 'Upload profile photo (multipart form field: photo).',
      disabledHeader: true,
      reqBody: formBody([{ key: 'photo', type: 'file', src: [] }]),
    }),
    item('Get Passenger View', 'GET', ['users', 'me', 'passenger'], {
      description: 'Passenger-specific profile view.',
    }),
    item('Get Passenger Stats', 'GET', ['users', 'me', 'passenger', 'stats'], {
      description: 'Passenger ride/loyalty stats summary.',
    }),
  ],
  userAuth,
);

const walletFolder = folder(
  'Users — Wallet',
  'Authenticated user wallet balance and ledger.',
  [
    item('Get My Wallet', 'GET', ['users', 'me', 'wallet'], {
      description: 'Current user wallet balance and status.',
      test: SAVE_WALLET_ID_SINGLE,
    }),
    item('List My Wallet Transactions', 'GET', ['users', 'me', 'wallet', 'transactions'], {
      description: 'Paginated wallet ledger. Optional type filter.',
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
        { key: 'type', value: 'ride_payment', disabled: true },
      ],
    }),
  ],
  userAuth,
);

const ridesFolder = folder(
  'Users — Rides & Ratings',
  'Passenger ride history and rating APIs.',
  [
    item('List My Rides', 'GET', ['users', 'me', 'rides'], {
      description: 'Ride history. Filters: status (active|completed|cancelled|all), from, to, search.',
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
        { key: 'status', value: 'all', disabled: true },
        { key: 'from', value: '', disabled: true },
        { key: 'to', value: '', disabled: true },
        { key: 'search', value: '', disabled: true },
      ],
      test: SAVE_RIDE_ID,
    }),
    item('Get Ride Detail', 'GET', ['users', 'me', 'rides', '{{rideId}}'], {
      description: 'Single ride detail for the authenticated passenger.',
    }),
    item('Submit Ride Rating', 'POST', ['users', 'me', 'rides', '{{rideId}}', 'rating'], {
      description: 'Rate a completed ride. score 1–5; optional tags, comment, isAnonymous.',
      reqBody: body({
        score: 5,
        tags: ['clean', 'friendly'],
        comment: 'Great ride',
        isAnonymous: false,
      }),
    }),
    item('Get Rating Tags', 'GET', ['users', 'me', 'ratings', 'tags'], {
      description: 'Allowed rating tag catalog for the rating UI.',
    }),
    item('List Ratings Given', 'GET', ['users', 'me', 'ratings', 'given'], {
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
      ],
      test: SAVE_RATING_ID,
    }),
    item('List Ratings Received', 'GET', ['users', 'me', 'ratings', 'received'], {
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
      ],
      test: SAVE_RATING_ID,
    }),
  ],
  userAuth,
);

const driverFolder = folder(
  'Users — Driver',
  'Driver profile, availability, and vehicle.',
  [
    item('Get Driver View', 'GET', ['users', 'me', 'driver']),
    item('Set Availability', 'PATCH', ['users', 'me', 'driver', 'availability'], {
      reqBody: body({ isOnline: true }),
    }),
    item('Register Vehicle', 'POST', ['users', 'me', 'driver', 'vehicle'], {
      reqBody: body({
        vehicleType: 'sedan',
        model: 'Toyota Corolla',
        numberPlate: 'LEA-1234',
        availableSeats: 4,
        color: 'white',
        year: 2022,
      }),
    }),
    item('Get Vehicle', 'GET', ['users', 'me', 'driver', 'vehicle']),
  ],
  userAuth,
);

const docsFolder = folder(
  'Users — Documents & Trust',
  'KYC documents and trust indicators.',
  [
    item('Register Document', 'POST', ['users', 'me', 'documents'], {
      description:
        'Register KYC doc by URL. Types: national_id | passport | driver_license | vehicle_registration | vehicle_insurance | selfie. Only driver_license clears documents_uploaded.',
      reqBody: body({
        type: 'driver_license',
        fileUrl: '/uploads/example-license.jpg',
        expiresAt: '2030-12-31',
      }),
      test: SAVE_DOCUMENT_ID,
    }),
    item('List Documents', 'GET', ['users', 'me', 'documents']),
    item('Get Trust Score', 'GET', ['users', 'me', 'trust-score']),
    item('Get Restrictions', 'GET', ['users', 'me', 'restrictions']),
  ],
  userAuth,
);

const privacyFolder = folder(
  'Users — Privacy & Account',
  'GDPR and account lifecycle.',
  [
    item('Request Account Deletion', 'POST', ['users', 'me', 'delete-account']),
    item('Export My Data', 'GET', ['users', 'me', 'export']),
  ],
  userAuth,
);

const notifFolder = folder(
  'Users — Notifications & Devices',
  'Push notifications and device management.',
  [
    item('Get Notification Preferences', 'GET', ['users', 'me', 'notification-preferences']),
    item('Update Notification Preferences', 'PATCH', ['users', 'me', 'notification-preferences'], {
      reqBody: body({
        pushEnabled: true,
        smsEnabled: true,
        emailEnabled: false,
        rideUpdates: true,
        promotions: false,
      }),
    }),
    item('Register FCM Token', 'POST', ['users', 'me', 'fcm-token'], {
      reqBody: body({ fcmToken: 'your-fcm-device-token', deviceName: 'iPhone 15', platform: 'ios' }),
    }),
    item('List Devices', 'GET', ['users', 'me', 'devices']),
    item('Remove Device', 'DELETE', ['users', 'me', 'devices', '{{deviceId}}']),
  ],
  userAuth,
);

const socialFolder = folder(
  'Users — Social',
  'Public profiles, reports, and blocks.',
  [
    item('Get Public Profile', 'GET', ['users', '{{targetUserId}}', 'public']),
    item('Report User', 'POST', ['users', '{{targetUserId}}', 'report'], {
      reqBody: body({ reason: 'inappropriate_behavior', description: 'Details here' }),
    }),
    item('Block User', 'POST', ['users', '{{targetUserId}}', 'block']),
    item('Unblock User', 'DELETE', ['users', '{{targetUserId}}', 'block']),
  ],
  userAuth,
);

const adminAuth = bearer('adminAccessToken');

const portalFolder = folder(
  'Admin — Portal',
  'Portal session. GET /admin/me works even when mustResetPassword is true.',
  [
    item('Get Portal Me', 'GET', ['admin', 'me'], {
      description: 'Profile, platformRoles, effectivePermissions, region, mustResetPassword.',
    }),
    item('Dashboard Stats', 'GET', ['admin', 'dashboard', 'stats'], {
      description: 'Dashboard counters. Requires password reset complete.',
    }),
    item('Global Audit Logs', 'GET', ['admin', 'audit-logs'], {
      description: 'Platform-wide audit log. Requires view_reports.',
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
        { key: 'action', value: '', disabled: true },
        { key: 'actorId', value: '{{userId}}', disabled: true },
        { key: 'from', value: '', disabled: true },
        { key: 'to', value: '', disabled: true },
      ],
    }),
    item('Moderate Rating', 'PATCH', ['admin', 'ratings', '{{ratingId}}', 'moderate'], {
      description: 'Hide/flag/restore a rating. Requires manage_users. status: visible | hidden | flagged.',
      reqBody: body({ status: 'hidden' }),
    }),
  ],
  adminAuth,
);

const adminUsersFolder = folder(
  'Admin — Users',
  'User management, reviews, penalties, and access control. Requires manage_users / manage_roles permissions.',
  [
    item('Create User', 'POST', ['admin', 'users'], {
      description:
        'Create user with optional password. Default: {{defaultUserPassword}} + mustResetPassword=true. Requires manage_users.',
      reqBody: body({
        phone: '+923001112233',
        email: 'new.user@example.com',
        fullName: 'New Portal User',
        regionId: '{{regionId}}',
        platformRole: 'ADMIN',
      }),
      test: SAVE_USER_ID,
    }),
    item('List Users', 'GET', ['admin', 'users'], {
      description: 'Paginated list. Filters: status, role, regionId, search, driverStatus.',
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
        { key: 'search', value: '', disabled: true },
        { key: 'status', value: 'ACTIVE', disabled: true },
        { key: 'role', value: 'ADMIN', disabled: true },
        { key: 'regionId', value: '{{regionId}}', disabled: true },
        { key: 'driverStatus', value: 'approved', disabled: true },
      ],
      test: SAVE_USER_ID_FROM_LIST,
    }),
    item('Get User Detail', 'GET', ['admin', 'users', '{{userId}}']),
    item('Reset User Password (SUPER_ADMIN)', 'POST', ['admin', 'users', '{{userId}}', 'reset-password'], {
      description: 'SUPER_ADMIN only. Returns temporaryPassword once in response.',
    }),
    item('Update User Status', 'PATCH', ['admin', 'users', '{{userId}}', 'status'], {
      reqBody: body({ status: 'SUSPENDED', reason: 'Policy violation' }),
    }),
    item('Review Driver', 'PATCH', ['admin', 'users', '{{userId}}', 'driver', 'review'], {
      description: 'Requires manage_drivers.',
      reqBody: body({ action: 'approve', reason: 'Documents verified' }),
    }),
    item('Review Document', 'PATCH', ['admin', 'users', '{{userId}}', 'documents', '{{documentId}}'], {
      description: 'Requires manage_documents.',
      reqBody: body({ action: 'approve' }),
    }),
    item('Add Support Note', 'POST', ['admin', 'users', '{{userId}}', 'notes'], {
      description: 'Requires manage_notes.',
      reqBody: body({ content: 'Called user regarding document resubmission.' }),
    }),
    item('Apply Wallet Penalty', 'POST', ['admin', 'users', '{{userId}}', 'penalties'], {
      description: 'Requires manage_penalties.',
      reqBody: body({ amount: 500, reason: 'No-show penalty' }),
    }),
    item('Get Audit Log', 'GET', ['admin', 'users', '{{userId}}', 'audit-log'], {
      description: 'Requires view_reports.',
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
      ],
    }),
    item('Get Passenger Summary', 'GET', ['admin', 'users', '{{userId}}', 'passenger-summary'], {
      description: 'Admin passenger overview (stats, verification). Requires manage_users.',
    }),
    item('List User Rides', 'GET', ['admin', 'users', '{{userId}}', 'rides'], {
      description: 'Admin view of passenger rides. Requires manage_users.',
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
        { key: 'status', value: 'completed', disabled: true },
      ],
      test: SAVE_RIDE_ID,
    }),
    item('Get User Wallet', 'GET', ['admin', 'users', '{{userId}}', 'wallet'], {
      description: 'User wallet + transactions. Requires view_finance.',
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
      ],
      test: SAVE_WALLET_ID_SINGLE,
    }),
    item('List User Ratings', 'GET', ['admin', 'users', '{{userId}}', 'ratings'], {
      description: 'Ratings given/received for user. Requires view_reports.',
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
        { key: 'direction', value: 'received', disabled: true },
      ],
      test: SAVE_RATING_ID,
    }),
    item('Get User Access', 'GET', ['admin', 'users', '{{userId}}', 'access'], {
      description: 'Platform roles, custom roles, direct permissions, effective keys. Requires manage_roles.',
    }),
    item('Replace User Permissions (PUT)', 'PUT', ['admin', 'users', '{{userId}}', 'permissions'], {
      reqBody: body({ permissionIds: ['{{permissionId}}'] }),
    }),
    item('Add User Permissions (POST)', 'POST', ['admin', 'users', '{{userId}}', 'permissions'], {
      reqBody: body({ permissionIds: ['{{permissionId}}'] }),
    }),
    item('Remove User Permission', 'DELETE', [
      'admin',
      'users',
      '{{userId}}',
      'permissions',
      '{{permissionId}}',
    ]),
    item('Replace User Roles (PUT)', 'PUT', ['admin', 'users', '{{userId}}', 'roles'], {
      reqBody: body({ roleIds: ['{{roleId}}'] }),
    }),
    item('Assign Role to User (POST)', 'POST', ['admin', 'users', '{{userId}}', 'roles'], {
      reqBody: body({ roleId: '{{roleId}}' }),
    }),
    item('Remove Role from User', 'DELETE', ['admin', 'users', '{{userId}}', 'roles', '{{roleId}}']),
    item('Assign Platform Role (POST)', 'POST', ['admin', 'users', '{{userId}}', 'platform-roles'], {
      description: 'SUPER_ADMIN only for ADMIN/SUPER_ADMIN roles.',
      reqBody: body({ platformRole: 'ADMIN' }),
    }),
    item('Revoke Platform Role', 'DELETE', [
      'admin',
      'users',
      '{{userId}}',
      'platform-roles',
      'ADMIN',
    ]),
  ],
  adminAuth,
);

const regionsFolder = folder(
  'Admin — Regions',
  'Region CRUD (SUPER_ADMIN). Active list available to all portal users.',
  [
    item('List Active Regions', 'GET', ['admin', 'regions', 'active'], {
      description: 'For dropdowns in fleet/user create forms.',
      test: SAVE_REGION_ID,
    }),
    item('List Regions', 'GET', ['admin', 'regions'], {
      description: 'SUPER_ADMIN only.',
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
        { key: 'search', value: '', disabled: true },
        { key: 'activeOnly', value: 'false', disabled: true },
      ],
    }),
    item('Create Region', 'POST', ['admin', 'regions'], {
      description: 'SUPER_ADMIN only.',
      reqBody: body({
        code: 'AE',
        name: 'United Arab Emirates',
        currency: 'AED',
        phonePrefix: '+971',
      }),
      test: SAVE_REGION_ID_SINGLE,
    }),
    item('Get Region', 'GET', ['admin', 'regions', '{{regionId}}']),
    item('Update Region', 'PATCH', ['admin', 'regions', '{{regionId}}'], {
      reqBody: body({ name: 'Pakistan', isActive: true }),
    }),
  ],
  adminAuth,
);

const adminFleetsFolder = folder(
  'Admin — Fleets',
  'Admin fleet list and approval. New fleets start as pending.',
  [
    item('List Fleets', 'GET', ['admin', 'fleets'], {
      description: 'Requires manage_fleets. Filter by status, regionId, search.',
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
        { key: 'status', value: 'pending' },
        { key: 'regionId', value: '{{regionId}}', disabled: true },
        { key: 'search', value: '', disabled: true },
      ],
      test: SAVE_COMPANY_ID,
    }),
    item('Create Fleet (Admin + Owner)', 'POST', ['admin', 'fleets'], {
      description: 'Requires manage_users. Assign fleet owner at creation.',
      reqBody: body({
        legalName: 'Lala Transport',
        taxId: 'PK-99999',
        regionId: '{{regionId}}',
        ownerUserId: '{{userId}}',
      }),
      test: SAVE_COMPANY_ID,
    }),
    item('Update Fleet (Admin)', 'PATCH', ['admin', 'fleets', '{{companyId}}'], {
      description: 'Approve/suspend fleet, update legalName, taxId, regionId, or ownerUserId (manage_users).',
      reqBody: body({
        status: 'active',
        legalName: 'Rideality Fleet Lahore Pvt Ltd',
        ownerUserId: '{{userId}}',
      }),
    }),
  ],
  adminAuth,
);

const financeFolder = folder(
  'Admin — Finance',
  'Wallet ledger, manual adjustments (maker-checker), and payouts. Requires view_finance / finance permissions.',
  [
    item('Finance Summary', 'GET', ['admin', 'finance', 'summary'], {
      description: 'Dashboard stats including balancesByCurrency and volumeByCurrency.',
    }),
    item('List Wallets', 'GET', ['admin', 'finance', 'wallets'], {
      description: 'Requires view_finance.',
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
        { key: 'ownerType', value: 'user', disabled: true },
        { key: 'status', value: 'active', disabled: true },
        { key: 'search', value: '', disabled: true },
        { key: 'regionId', value: '{{regionId}}', disabled: true },
      ],
      test: SAVE_WALLET_ID,
    }),
    item('Export Wallets CSV', 'GET', ['admin', 'finance', 'wallets', 'export'], {
      description: 'CSV download. Requires export_finance_reports. Same filters as List Wallets (no pagination).',
      query: [
        { key: 'ownerType', value: 'user', disabled: true },
        { key: 'status', value: 'active', disabled: true },
        { key: 'regionId', value: '{{regionId}}', disabled: true },
      ],
    }),
    item('Bulk Update Wallet Status', 'PATCH', ['admin', 'finance', 'wallets', 'bulk-status'], {
      description: 'Requires approve_wallet_adjustments. status: active | frozen | closed.',
      reqBody: body({ walletIds: ['{{walletId}}'], status: 'frozen' }),
    }),
    item('Create Wallet', 'POST', ['admin', 'finance', 'wallets'], {
      description: 'Requires manage_wallet_adjustments. Provide either userId or fleetCompanyId.',
      reqBody: body({
        ownerType: 'user',
        userId: '{{userId}}',
        currency: 'PKR',
      }),
      test: SAVE_WALLET_ID_SINGLE,
    }),
    item('Lookup Wallets by Email', 'GET', ['admin', 'finance', 'wallets', 'lookup'], {
      description: 'Find user or fleet-owner wallet for adjustments.',
      query: [{ key: 'email', value: 'irfan.fleet@gmail.com' }],
      test: SAVE_WALLET_ID,
    }),
    item('Get Wallet', 'GET', ['admin', 'finance', 'wallets', '{{walletId}}'], {
      test: SAVE_WALLET_ID_SINGLE,
    }),
    item('Get Wallet Dashboard', 'GET', ['admin', 'finance', 'wallets', '{{walletId}}', 'dashboard'], {
      description: 'Wallet detail with recent activity summary for finance UI.',
    }),
    item('List Wallet Transactions', 'GET', ['admin', 'finance', 'wallets', '{{walletId}}', 'transactions'], {
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
      ],
    }),
    item('Update Wallet Status', 'PATCH', ['admin', 'finance', 'wallets', '{{walletId}}', 'status'], {
      description: 'Requires approve_wallet_adjustments. Freeze or close wallet.',
      reqBody: body({ status: 'frozen' }),
    }),
    item('Add Wallet Note', 'POST', ['admin', 'finance', 'wallets', '{{walletId}}', 'notes'], {
      description: 'Requires manage_wallet_adjustments.',
      reqBody: body({ content: 'Verified identity documents for top-up.' }),
    }),
    item('List All Transactions', 'GET', ['admin', 'finance', 'transactions'], {
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
        { key: 'walletId', value: '{{walletId}}', disabled: true },
        { key: 'type', value: 'adjustment_credit', disabled: true },
      ],
    }),
    item('List Adjustments', 'GET', ['admin', 'finance', 'adjustments'], {
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
        { key: 'status', value: 'pending' },
        { key: 'walletId', value: '{{walletId}}', disabled: true },
      ],
      test: SAVE_ADJUSTMENT_ID_FROM_LIST,
    }),
    item('Request Adjustment (Credit)', 'POST', ['admin', 'finance', 'adjustments'], {
      description: 'Requires manage_wallet_adjustments. Creates pending adjustment.',
      reqBody: body({
        walletId: '{{walletId}}',
        direction: 'credit',
        amount: 100,
        reason: 'Manual top-up for testing',
        topupMethod: 'bank_transfer',
        externalRef: 'BANK-REF-001',
      }),
      test: SAVE_ADJUSTMENT_ID,
    }),
    item('Request Adjustment (Debit)', 'POST', ['admin', 'finance', 'adjustments'], {
      reqBody: body({
        walletId: '{{walletId}}',
        direction: 'debit',
        amount: 50,
        reason: 'Manual debit for testing',
      }),
      test: SAVE_ADJUSTMENT_ID,
    }),
    item('Approve Adjustment', 'PATCH', ['admin', 'finance', 'adjustments', '{{adjustmentId}}', 'review'], {
      description: 'Requires approve_wallet_adjustments. Cannot approve own request unless SUPER_ADMIN.',
      reqBody: body({ action: 'approve', reviewNote: 'Verified bank receipt' }),
    }),
    item('Reject Adjustment', 'PATCH', ['admin', 'finance', 'adjustments', '{{adjustmentId}}', 'review'], {
      reqBody: body({ action: 'reject', reviewNote: 'Insufficient documentation' }),
    }),
    item('List Payouts', 'GET', ['admin', 'finance', 'payouts'], {
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
        { key: 'status', value: 'pending' },
        { key: 'walletId', value: '{{walletId}}', disabled: true },
      ],
      test: SAVE_PAYOUT_ID_FROM_LIST,
    }),
    item('Create Payout (Admin)', 'POST', ['admin', 'finance', 'payouts'], {
      description: 'Requires manage_payouts.',
      reqBody: body({
        walletId: '{{walletId}}',
        amount: 100,
        bankName: 'HBL',
        accountTitle: 'Fleet Owner',
        accountNumber: '1234567890',
      }),
      test: SAVE_PAYOUT_ID,
    }),
    item('Approve Payout', 'PATCH', ['admin', 'finance', 'payouts', '{{payoutId}}', 'review'], {
      description: 'Requires approve_wallet_adjustments. Deducts wallet on approve.',
      reqBody: body({ action: 'approve', reviewNote: 'Bank transfer initiated' }),
    }),
    item('Reject Payout', 'PATCH', ['admin', 'finance', 'payouts', '{{payoutId}}', 'review'], {
      reqBody: body({ action: 'reject', reviewNote: 'Invalid bank details' }),
    }),
  ],
  adminAuth,
);

const permissionsFolder = folder(
  'Admin — Permissions',
  'Permission catalog and CRUD. Catalog has no pagination.',
  [
    item('Permission Catalog', 'GET', ['admin', 'permissions', 'catalog'], {
      description: 'All permissions for dropdowns. Any admin with portal access.',
      test: SAVE_PERMISSION_FROM_CATALOG,
    }),
    item('List Permissions', 'GET', ['admin', 'permissions'], {
      description: 'Paginated. Requires manage_roles.',
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '50' },
        { key: 'search', value: '', disabled: true },
      ],
    }),
    item('Create Permission', 'POST', ['admin', 'permissions'], {
      reqBody: body({ key: 'manage_custom_feature', meaning: 'Allows managing custom feature' }),
      test: SAVE_PERMISSION_ID,
    }),
    item('Get Permission', 'GET', ['admin', 'permissions', '{{permissionId}}']),
    item('Update Permission', 'PATCH', ['admin', 'permissions', '{{permissionId}}'], {
      reqBody: body({ meaning: 'Updated permission description' }),
    }),
    item('Delete Permission', 'DELETE', ['admin', 'permissions', '{{permissionId}}'], {
      description: 'System permissions cannot be deleted.',
    }),
  ],
  adminAuth,
);

const rolesFolder = folder(
  'Admin — Roles',
  'Custom role bundles linked to permission IDs.',
  [
    item('List Roles', 'GET', ['admin', 'roles'], {
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
        { key: 'search', value: '', disabled: true },
      ],
    }),
    item('Create Role', 'POST', ['admin', 'roles'], {
      reqBody: body({
        name: 'Operations Sub Admin',
        description: 'Users + drivers + notes access',
        permissionIds: ['{{permissionId}}'],
      }),
      test: SAVE_ROLE_ID,
    }),
    item('Get Role', 'GET', ['admin', 'roles', '{{roleId}}']),
    item('Update Role', 'PATCH', ['admin', 'roles', '{{roleId}}'], {
      reqBody: body({
        description: 'Updated role description',
        permissionIds: ['{{permissionId}}'],
      }),
    }),
    item('Delete Role', 'DELETE', ['admin', 'roles', '{{roleId}}'], {
      description: 'Fails if system role or still assigned to users.',
    }),
  ],
  adminAuth,
);

const fleetFolder = folder(
  'Fleet',
  'Fleet owner/manager portal APIs. Requires portal user with fleet access and password reset complete.',
  [
    item('Create Fleet Company', 'POST', ['fleet', 'companies'], {
      description: 'Creates fleet with status pending until admin approves.',
      reqBody: body({
        legalName: 'Rideality Fleet Lahore',
        taxId: 'PK-12345',
        regionId: '{{regionId}}',
      }),
      test: SAVE_COMPANY_ID,
    }),
    item('Get Fleet Company', 'GET', ['fleet', 'companies', '{{companyId}}']),
    item('Update Fleet Company', 'PATCH', ['fleet', 'companies', '{{companyId}}'], {
      description: 'Fleet owner can update legalName and taxId only.',
      reqBody: body({ legalName: 'Rideality Fleet Lahore Pvt Ltd' }),
    }),
    item('Fleet Dashboard', 'GET', ['fleet', 'companies', '{{companyId}}', 'dashboard'], {
      description: 'Fleet ops dashboard counters and summaries.',
    }),
    item('Fleet Live Map', 'GET', ['fleet', 'companies', '{{companyId}}', 'map'], {
      description: 'Live map markers for active drivers/vehicles.',
    }),
    item('List Fleet Vehicles', 'GET', ['fleet', 'companies', '{{companyId}}', 'vehicles'], {
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
        { key: 'search', value: '', disabled: true },
        { key: 'status', value: 'active', disabled: true },
      ],
      test: SAVE_VEHICLE_ID,
    }),
    item('Create Fleet Vehicle', 'POST', ['fleet', 'companies', '{{companyId}}', 'vehicles'], {
      reqBody: body({
        vehicleType: 'sedan',
        model: 'Honda City',
        numberPlate: 'LES-7788',
        availableSeats: 4,
        color: 'silver',
        year: 2023,
        driverUserId: '{{userId}}',
      }),
      test: SAVE_VEHICLE_ID,
    }),
    item('Update Fleet Vehicle', 'PATCH', [
      'fleet',
      'companies',
      '{{companyId}}',
      'vehicles',
      '{{vehicleId}}',
    ], {
      reqBody: body({
        operationalStatus: 'active',
        driverUserId: '{{userId}}',
        isVerified: true,
      }),
    }),
    item('Delete Fleet Vehicle', 'DELETE', [
      'fleet',
      'companies',
      '{{companyId}}',
      'vehicles',
      '{{vehicleId}}',
    ]),
    item('List Fleet Trips', 'GET', ['fleet', 'companies', '{{companyId}}', 'trips'], {
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
        { key: 'status', value: '', disabled: true },
        { key: 'from', value: '', disabled: true },
        { key: 'to', value: '', disabled: true },
        { key: 'driverUserId', value: '{{userId}}', disabled: true },
      ],
      test: SAVE_TRIP_ID,
    }),
    item('Get Fleet Trip', 'GET', ['fleet', 'companies', '{{companyId}}', 'trips', '{{tripId}}']),
    item('Fleet Earnings', 'GET', ['fleet', 'companies', '{{companyId}}', 'earnings'], {
      description: 'Earnings summary. Optional from/to ISO date strings.',
      query: [
        { key: 'from', value: '', disabled: true },
        { key: 'to', value: '', disabled: true },
      ],
    }),
    item('Fleet Reports', 'GET', ['fleet', 'companies', '{{companyId}}', 'reports'], {
      description: 'Aggregated reports. days: 7–90.',
      query: [{ key: 'days', value: '30', disabled: true }],
    }),
    item('List Fleet Notifications', 'GET', ['fleet', 'companies', '{{companyId}}', 'notifications'], {
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
        { key: 'unreadOnly', value: 'true', disabled: true },
      ],
      test: SAVE_NOTIFICATION_ID,
    }),
    item('Mark All Notifications Read', 'PATCH', [
      'fleet',
      'companies',
      '{{companyId}}',
      'notifications',
      'read-all',
    ]),
    item('Mark Notification Read', 'PATCH', [
      'fleet',
      'companies',
      '{{companyId}}',
      'notifications',
      '{{notificationId}}',
      'read',
    ]),
    item('List Fleet Documents', 'GET', ['fleet', 'companies', '{{companyId}}', 'documents'], {
      query: [
        { key: 'status', value: 'pending', disabled: true },
        { key: 'search', value: '', disabled: true },
        { key: 'expiringWithinDays', value: '30', disabled: true },
      ],
    }),
    item('List Fleet Audit Logs', 'GET', ['fleet', 'companies', '{{companyId}}', 'audit-logs'], {
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
      ],
    }),
    item('Export Trips CSV', 'GET', ['fleet', 'companies', '{{companyId}}', 'exports', 'trips'], {
      description: 'Downloads CSV attachment.',
      query: [
        { key: 'from', value: '', disabled: true },
        { key: 'to', value: '', disabled: true },
        { key: 'status', value: '', disabled: true },
      ],
    }),
    item('Export Wallet Statement CSV', 'GET', [
      'fleet',
      'companies',
      '{{companyId}}',
      'exports',
      'wallet-statement',
    ], {
      description: 'Downloads CSV attachment.',
      query: [
        { key: 'from', value: '', disabled: true },
        { key: 'to', value: '', disabled: true },
      ],
    }),
    item('List Team Members', 'GET', ['fleet', 'companies', '{{companyId}}', 'team'], {
      test: SAVE_MEMBERSHIP_ID,
    }),
    item('Invite Team Member', 'POST', ['fleet', 'companies', '{{companyId}}', 'team', 'invites'], {
      description: 'Invite manager or dispatcher by userId. role: manager | dispatcher.',
      reqBody: body({ userId: '{{userId}}', role: 'manager' }),
      test: SAVE_INVITE_TOKEN,
    }),
    item('Update Team Member', 'PATCH', [
      'fleet',
      'companies',
      '{{companyId}}',
      'team',
      '{{membershipId}}',
    ], {
      reqBody: body({ role: 'dispatcher' }),
    }),
    item('Remove Team Member', 'DELETE', [
      'fleet',
      'companies',
      '{{companyId}}',
      'team',
      '{{membershipId}}',
    ]),
    item('List Driver Invites', 'GET', ['fleet', 'companies', '{{companyId}}', 'invites']),
    item('Search Invite Candidates', 'GET', ['fleet', 'companies', '{{companyId}}', 'invite-candidates'], {
      description: 'Search users by name, email, or phone (min 2 chars).',
      query: [{ key: 'search', value: 'ali' }],
    }),
    item('Invite Driver (by userId)', 'POST', ['fleet', 'companies', '{{companyId}}', 'invites'], {
      description: 'Invite by userId, phone, or email — at least one required.',
      reqBody: body({ userId: '{{userId}}' }),
      test: SAVE_INVITE_TOKEN,
    }),
    item('Invite Driver (by phone)', 'POST', ['fleet', 'companies', '{{companyId}}', 'invites'], {
      reqBody: body({ phone: '+923008887766' }),
      test: SAVE_INVITE_TOKEN,
    }),
    item('Invite Driver (by email)', 'POST', ['fleet', 'companies', '{{companyId}}', 'invites'], {
      reqBody: body({ email: 'driver@example.com' }),
      test: SAVE_INVITE_TOKEN,
    }),
    item('My Fleet Invites', 'GET', ['fleet', 'me', 'invites'], {
      description: 'Invites pending for the authenticated user. Use accessToken of invitee.',
      auth: bearer('accessToken'),
    }),
    item('Accept Fleet Invite', 'POST', ['fleet', 'invites', '{{inviteToken}}', 'accept'], {
      description: 'Driver/team member accepts invite — use invitee accessToken.',
      auth: bearer('accessToken'),
    }),
    item('Reject Fleet Invite', 'POST', ['fleet', 'invites', '{{inviteToken}}', 'reject'], {
      description: 'Driver/team member rejects invite — use invitee accessToken.',
      auth: bearer('accessToken'),
    }),
    item('List Fleet Drivers', 'GET', ['fleet', 'companies', '{{companyId}}', 'drivers']),
    item('Update Fleet Driver', 'PATCH', ['fleet', 'companies', '{{companyId}}', 'drivers', '{{userId}}'], {
      reqBody: body({ onboardingStatus: 'approved' }),
    }),
    item('Remove Fleet Driver', 'DELETE', ['fleet', 'companies', '{{companyId}}', 'drivers', '{{userId}}']),
    item('Get Fleet Wallet', 'GET', ['fleet', 'companies', '{{companyId}}', 'wallet'], {
      description: 'Fleet wallet balance and details.',
      test: SAVE_WALLET_ID_SINGLE,
    }),
    item('List Fleet Wallet Transactions', 'GET', ['fleet', 'companies', '{{companyId}}', 'wallet', 'transactions'], {
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
      ],
    }),
    item('List Fleet Payouts', 'GET', ['fleet', 'companies', '{{companyId}}', 'payouts'], {
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
      ],
      test: SAVE_PAYOUT_ID_FROM_LIST,
    }),
    item('Request Fleet Payout', 'POST', ['fleet', 'companies', '{{companyId}}', 'payouts'], {
      description: 'Creates pending payout for finance approval.',
      reqBody: body({
        amount: 100,
        bankName: 'HBL',
        accountTitle: 'Fleet Owner',
        accountNumber: '1234567890',
      }),
      test: SAVE_PAYOUT_ID,
    }),
  ],
  adminAuth,
);

// Fleet folder uses adminAccessToken by default but Accept uses accessToken override

const collection = {
  info: {
    _postman_id: 'rideality-api-collection',
    name: 'Rideality API',
    description: [
      'Rideality backend API — generated from route definitions.',
      '',
      '**Base URLs**',
      '- `baseHost` → health check',
      '- `baseUrl` → `/api/v1`',
      '',
      '**Flutter mobile — Passenger Onboarding**',
      '1. OTP: `POST /auth/otp/send` → `POST /auth/otp/verify`',
      '2. Signup: `POST /onboarding/passenger` (Bearer token; no "me" in path)',
      '3. Progress: `GET /onboarding/status`',
      '',
      '**Flutter mobile — Driver Onboarding**',
      '1. Same OTP',
      '2. Signup: `POST /onboarding/driver` (fullName + dateOfBirth 18+ required)',
      '3. Then vehicle + documents + admin approval',
      '4. Progress: `GET /onboarding/status`',
      '',
      '**Quick start (admin portal)**',
      '1. Import environment',
      '2. **Auth → Admin Login** (`admin@rideality.com` / `Admin@123456`)',
      '3. If `mustResetPassword`, run **Auth → Admin Change Password**',
      '4. **Admin — Permissions → Permission Catalog** (saves permissionId)',
      '5. **Admin — Regions → List Active Regions** (saves regionId)',
      '',
      '**Defaults**',
      '- Admin-created user password: `user1234` (must change on first login)',
      '- Dev OTP: `123456`',
      '',
      '**Modules**',
      '- Mobile — Passenger Onboarding / Mobile — Driver Onboarding (Flutter-oriented flows)',
      '- Auth (OTP + admin portal)',
      '- Users (profile, wallet, rides/ratings, driver, documents, privacy, notifications, social)',
      '- Admin (users, portal, regions, fleets, permissions, roles, finance)',
      '- Fleet (dashboard, map, vehicles, trips, team, notifications, exports, wallet/payouts)',
      '',
      '**Finance quick start**',
      '1. Admin Login → Permission Catalog',
      '2. **Admin — Finance → List Wallets** (saves walletId)',
      '3. **Request Adjustment** → login as second admin → **Approve Adjustment**',
      '4. Fleet: **Get Fleet Wallet** → **Request Fleet Payout** → **Approve Payout**',
    ].join('\n'),
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    { key: 'baseHost', value: 'http://65.21.177.122:3000' },
    { key: 'baseUrl', value: 'http://65.21.177.122:3000/api/v1' },
    { key: 'accessToken', value: '' },
    { key: 'refreshToken', value: '' },
    { key: 'adminAccessToken', value: '' },
    { key: 'userId', value: '' },
    { key: 'targetUserId', value: '' },
    { key: 'companyId', value: '' },
    { key: 'inviteToken', value: '' },
    { key: 'documentId', value: '' },
    { key: 'roleId', value: '' },
    { key: 'permissionId', value: '' },
    { key: 'manageFleetsPermissionId', value: '' },
    { key: 'sessionId', value: '' },
    { key: 'deviceId', value: '' },
    { key: 'locationId', value: '' },
    { key: 'rideId', value: '' },
    { key: 'ratingId', value: '' },
    { key: 'vehicleId', value: '' },
    { key: 'tripId', value: '' },
    { key: 'membershipId', value: '' },
    { key: 'notificationId', value: '' },
    { key: 'regionId', value: '1ec3e835-1c86-4585-a162-dad219868b0e' },
    { key: 'walletId', value: '' },
    { key: 'adjustmentId', value: '' },
    { key: 'payoutId', value: '' },
    { key: 'devOtpCode', value: '123456' },
    { key: 'defaultUserPassword', value: 'user1234' },
    { key: 'phone', value: '+923001234567' },
    { key: 'regionCode', value: 'PK' },
  ],
  item: [
    folder('User Management', 'All Rideality API endpoints.', [
      healthFolder,
      authFolder,
      passengerOnboardingFolder,
      driverOnboardingFolder,
      profileFolder,
      walletFolder,
      ridesFolder,
      driverFolder,
      docsFolder,
      privacyFolder,
      notifFolder,
      socialFolder,
      portalFolder,
      adminUsersFolder,
      regionsFolder,
      adminFleetsFolder,
      financeFolder,
      permissionsFolder,
      rolesFolder,
      fleetFolder,
    ]),
  ],
};

fs.writeFileSync(outPath, JSON.stringify(collection, null, 2));

for (const envFile of ['Rideality.postman_environment.json', 'Rideality.postman_environment.local.json']) {
  const envPath = path.join(__dirname, envFile);
  if (!fs.existsSync(envPath)) continue;
  const env = JSON.parse(fs.readFileSync(envPath, 'utf8'));
  const extra = [
    { key: 'defaultUserPassword', value: 'user1234' },
    { key: 'manageFleetsPermissionId', value: '' },
    { key: 'walletId', value: '' },
    { key: 'adjustmentId', value: '' },
    { key: 'payoutId', value: '' },
    { key: 'phone', value: '+923001234567' },
    { key: 'regionCode', value: 'PK' },
    { key: 'locationId', value: '' },
    { key: 'rideId', value: '' },
    { key: 'ratingId', value: '' },
    { key: 'vehicleId', value: '' },
    { key: 'tripId', value: '' },
    { key: 'membershipId', value: '' },
    { key: 'notificationId', value: '' },
  ];
  for (const v of extra) {
    if (!env.values.find((e) => e.key === v.key)) {
      env.values.push({ key: v.key, value: v.value, type: 'default', enabled: true });
    }
  }
  fs.writeFileSync(envPath, JSON.stringify(env, null, 2));
}

console.log('Generated:', outPath);
console.log('Requests:', countRequests(collection.item));

function countRequests(items) {
  let n = 0;
  for (const i of items) {
    if (i.request) n += 1;
    if (i.item) n += countRequests(i.item);
  }
  return n;
}
