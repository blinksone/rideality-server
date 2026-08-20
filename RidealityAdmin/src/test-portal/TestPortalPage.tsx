import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import * as api from './api';
import { testApiError } from './api';
import {
  clearTestSession,
  getTestUser,
  setTestSession,
  updateTestUser,
  type TestSessionUser,
} from './session';

type Screen = 'login' | 'app';
type AppTab = 'home' | 'passenger' | 'driver' | 'invites' | 'profile';

const DEMO_OTP_HINT = '123456';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <Box
      component="pre"
      sx={{
        m: 0,
        p: 1.5,
        bgcolor: '#0f172a',
        color: '#e2e8f0',
        borderRadius: 1.5,
        fontSize: 11,
        overflow: 'auto',
        maxHeight: 260,
      }}
    >
      {JSON.stringify(value, null, 2)}
    </Box>
  );
}

export default function TestPortalPage() {
  const [screen, setScreen] = useState<Screen>(() => (getTestUser() ? 'app' : 'login'));
  const [tab, setTab] = useState<AppTab>('home');
  const [user, setUser] = useState<TestSessionUser | null>(() => getTestUser());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // login
  const [regions, setRegions] = useState<Array<{ code: string; name: string; phonePrefix: string }>>([]);
  const [regionCode, setRegionCode] = useState('PK');
  const [phone, setPhone] = useState('+923001234567');
  const [otp, setOtp] = useState(DEMO_OTP_HINT);
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(DEMO_OTP_HINT);

  // profile
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [me, setMe] = useState<unknown>(null);

  // passenger
  const [passenger, setPassenger] = useState<unknown>(null);
  const [wallet, setWallet] = useState<unknown>(null);
  const [walletTx, setWalletTx] = useState<unknown>(null);
  const [rides, setRides] = useState<unknown>(null);
  const [stats, setStats] = useState<unknown>(null);
  const [homeAddress, setHomeAddress] = useState('F-7 Markaz, Islamabad');

  // driver
  const [driver, setDriver] = useState<unknown>(null);
  const [onboarding, setOnboarding] = useState<unknown>(null);
  const [vehicleType, setVehicleType] = useState('Car');
  const [vehicleModel, setVehicleModel] = useState('Toyota Corolla');
  const [plate, setPlate] = useState('ABC-123');
  const [cargoCapacityKg, setCargoCapacityKg] = useState(50);
  const [serviceModes, setServiceModes] = useState<Array<'rides' | 'cargo'>>(['rides', 'cargo']);
  const [cargoTrip, setCargoTrip] = useState<unknown>(null);
  const [docs, setDocs] = useState<unknown>(null);
  const [invites, setInvites] = useState<Array<{
    id: string;
    token: string;
    kind: 'driver' | 'team';
    memberRole: string | null;
    expiresAt: string;
    createdAt: string;
    fleetCompany: { id: string; legalName: string; status: string };
  }> | null>(null);

  const run = useCallback(async (fn: () => Promise<void>, okMsg?: string) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
      if (okMsg) setInfo(okMsg);
    } catch (e) {
      setError(testApiError(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (screen === 'app' && tab === 'invites' && user) {
      api.listMyFleetInvites()
        .then(setInvites)
        .catch(() => setInvites([]));
    }
  }, [screen, tab, user]);

  useEffect(() => {
    api.listAuthRegions()
      .then((r) => {
        setRegions(r);
        if (r[0] && !r.find((x) => x.code === regionCode)) setRegionCode(r[0].code);
      })
      .catch(() => setRegions([
        { code: 'PK', name: 'Pakistan', phonePrefix: '+92' },
        { code: 'US', name: 'United States', phonePrefix: '+1' },
      ]));
  }, [regionCode]);

  const refreshMe = async () => {
    const data = await api.getMe();
    setMe(data);
    setFullName(data.profile?.fullName ?? '');
    setEmail(data.email ?? '');
    updateTestUser({
      status: data.status,
      activeMode: data.activeMode,
      email: data.email,
    });
    setUser(getTestUser());
  };

  const handleSendOtp = () =>
    run(async () => {
      const res = await api.sendOtp(phone.trim(), regionCode);
      setOtpSent(true);
      if (res.otpCode) {
        setDevCode(res.otpCode);
        setOtp(res.otpCode);
        setInfo(`OTP sent to ${res.phone}. Demo code filled: ${res.otpCode}`);
      } else if (res.devBypassCode) {
        setDevCode(res.devBypassCode);
        setOtp(res.devBypassCode);
        setInfo(`OTP sent to ${res.phone}. Use bypass code ${res.devBypassCode}`);
      } else {
        setInfo(`OTP sent to ${res.phone}`);
      }
    });

  const handleVerify = () =>
    run(async () => {
      const res = await api.verifyOtp(phone.trim(), otp.trim(), regionCode);
      const sessionUser: TestSessionUser = {
        id: res.user.id,
        phone: res.user.phone,
        email: res.user.email,
        status: res.user.status,
        activeMode: res.user.activeMode,
        regionId: res.user.regionId,
        isNewUser: res.isNewUser,
      };
      setTestSession(res.accessToken, res.refreshToken, sessionUser);
      setUser(sessionUser);
      setScreen('app');
      setTab(res.isNewUser ? 'profile' : 'home');
      setInfo(res.isNewUser ? 'Welcome! Complete your profile to continue.' : 'Logged in');
      await refreshMe();
    }, undefined);

  const handleLogout = () => {
    clearTestSession();
    setUser(null);
    setMe(null);
    setPassenger(null);
    setDriver(null);
    setScreen('login');
    setOtpSent(false);
    setInfo(null);
    setError(null);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#0b1220',
        py: { xs: 2, md: 4 },
        px: 2,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <Box sx={{ width: '100%', maxWidth: 440 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2, color: '#fff' }}>
          <PhoneIphoneIcon />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
              Rideality Test App
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)' }}>
              Passenger & driver journey sandbox (OTP)
            </Typography>
          </Box>
        </Stack>

        <Paper
          elevation={0}
          sx={{
            borderRadius: 4,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.08)',
            bgcolor: '#f8fafc',
            minHeight: 640,
          }}
        >
          <Box sx={{ bgcolor: '#111827', color: '#fff', px: 2, py: 1.5 }}>
            <Typography variant="caption" sx={{ opacity: 0.7 }}>
              {user ? `${user.phone} · ${user.activeMode}` : 'Not signed in'}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {user ? `Status: ${user.status}` : 'Sign up / Log in'}
            </Typography>
          </Box>

          {screen === 'app' && (
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              variant="fullWidth"
              sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#fff' }}
            >
              <Tab value="home" label="Home" />
              <Tab value="passenger" label="Passenger" />
              <Tab value="driver" label="Driver" />
              <Tab value="invites" label="Invites" />
              <Tab value="profile" label="Profile" />
            </Tabs>
          )}

          <Box sx={{ p: 2 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                {error}
              </Alert>
            )}
            {info && (
              <Alert severity="success" sx={{ mb: 2 }} onClose={() => setInfo(null)}>
                {info}
              </Alert>
            )}

            {screen === 'login' && (
              <>
                <Alert severity="info" sx={{ mb: 2 }}>
                  Dev OTP bypass is enabled. Use code <strong>{devCode ?? DEMO_OTP_HINT}</strong> after Send OTP.
                </Alert>
                <Stack spacing={2}>
                  <TextField
                    select
                    label="Region"
                    value={regionCode}
                    onChange={(e) => setRegionCode(e.target.value)}
                    fullWidth
                    size="small"
                  >
                    {(regions.length ? regions : [{ code: 'PK', name: 'Pakistan', phonePrefix: '+92' }]).map((r) => (
                      <MenuItem key={r.code} value={r.code}>
                        {r.name} ({r.code})
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Phone (E.164)"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    fullWidth
                    size="small"
                    helperText="Example: +923001234567"
                  />
                  <Button variant="contained" disabled={busy} onClick={handleSendOtp}>
                    Send OTP
                  </Button>
                  {otpSent && (
                    <>
                      <TextField
                        label="OTP code"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        fullWidth
                        size="small"
                      />
                      <Button variant="contained" color="success" disabled={busy} onClick={handleVerify}>
                        Verify & continue
                      </Button>
                    </>
                  )}
                </Stack>
              </>
            )}

            {screen === 'app' && tab === 'home' && (
              <>
                <Section title="Journey checker">
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Use the tabs to walk passenger and driver flows against the live API.
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                    <Chip label="OTP signup/login" color="success" size="small" />
                    <Chip label="Auto wallet" size="small" />
                    <Chip label="Profile" size="small" />
                    <Chip label="Passenger APIs" size="small" />
                    <Chip label="Driver onboarding" size="small" />
                  </Stack>
                </Section>
                <Section title="Quick actions">
                  <Stack spacing={1}>
                    <Button variant="outlined" disabled={busy} onClick={() => run(refreshMe, 'Profile refreshed')}>
                      Refresh /users/me
                    </Button>
                    <Button
                      variant="outlined"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          setOnboarding(await api.getOnboarding());
                          setInfo('Onboarding loaded');
                        })
                      }
                    >
                      Load onboarding
                    </Button>
                    <Button
                      variant="outlined"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await api.setMode('passenger');
                          await refreshMe();
                        }, 'Switched to passenger mode')
                      }
                    >
                      Switch mode → Passenger
                    </Button>
                    <Button
                      variant="outlined"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await api.setMode('driver');
                          await refreshMe();
                        }, 'Switched to driver mode')
                      }
                    >
                      Switch mode → Driver
                    </Button>
                    <Divider />
                    <Button color="error" onClick={handleLogout}>
                      Log out
                    </Button>
                  </Stack>
                </Section>
                {onboarding != null && (
                  <Section title="Onboarding">
                    <JsonBlock value={onboarding} />
                  </Section>
                )}
                {me != null && (
                  <Section title="/users/me">
                    <JsonBlock value={me} />
                  </Section>
                )}
              </>
            )}

            {screen === 'app' && tab === 'profile' && (
              <>
                <Section title="Complete profile">
                  <Stack spacing={1.5}>
                    <TextField
                      label="Full name"
                      size="small"
                      fullWidth
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                    <TextField
                      label="Email (optional)"
                      size="small"
                      fullWidth
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <Button
                      variant="contained"
                      disabled={busy || !fullName.trim()}
                      onClick={() =>
                        run(async () => {
                          await api.updateProfile({
                            fullName: fullName.trim(),
                            ...(email.trim() ? { email: email.trim() } : {}),
                            role: 'passenger',
                          });
                          await refreshMe();
                        }, 'Profile saved as passenger')
                      }
                    >
                      Save as passenger
                    </Button>
                    <Button
                      variant="outlined"
                      disabled={busy || !fullName.trim()}
                      onClick={() =>
                        run(async () => {
                          await api.updateProfile({
                            fullName: fullName.trim(),
                            ...(email.trim() ? { email: email.trim() } : {}),
                            role: 'both',
                            vehicleType,
                            vehicleModel,
                            numberPlate: plate,
                            availableSeats: 4,
                            licenseNumber: 'LIC-DEMO-001',
                          });
                          await refreshMe();
                        }, 'Profile saved as passenger + driver')
                      }
                    >
                      Save as passenger + driver
                    </Button>
                  </Stack>
                </Section>
                <Section title="Current me">
                  <Button size="small" sx={{ mb: 1 }} disabled={busy} onClick={() => run(refreshMe)}>
                    Refresh
                  </Button>
                  <JsonBlock value={me} />
                </Section>
              </>
            )}

            {screen === 'app' && tab === 'passenger' && (
              <>
                <Section title="Passenger APIs">
                  <Stack spacing={1}>
                    <Button
                      variant="contained"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          setPassenger(await api.getPassenger());
                          setStats(await api.getPassengerStats());
                        }, 'Passenger profile + stats loaded')
                      }
                    >
                      Load passenger view + stats
                    </Button>
                    <Button
                      variant="outlined"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          setWallet(await api.getWallet());
                          setWalletTx(await api.getWalletTransactions());
                        }, 'Wallet loaded')
                      }
                    >
                      Load wallet + transactions
                    </Button>
                    <Button
                      variant="outlined"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          setRides(await api.getMyRides());
                        }, 'Rides loaded')
                      }
                    >
                      Load ride history
                    </Button>
                    <Button
                      variant="outlined"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await api.registerFcmToken({
                            fcmToken: `test-portal-${Date.now()}`,
                            platform: 'web',
                            deviceName: 'Admin Test Portal',
                          });
                        }, 'FCM token registered')
                      }
                    >
                      Register FCM token
                    </Button>
                    <Button
                      variant="contained"
                      color="secondary"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          setCargoTrip(
                            await api.createTrip({
                              bookingType: 'cargo',
                              pickupLat: 24.8607,
                              pickupLng: 67.0011,
                              dropoffLat: 24.9056,
                              dropoffLng: 67.0822,
                              cargoWeightKg: 12,
                              cargoDescription: 'Test parcel',
                              cargoSizeTier: 'small',
                              dropoffProofType: 'otp',
                              vehicleType: 'sedan',
                            }),
                          );
                        }, 'Cargo booking created')
                      }
                    >
                      Create demo cargo booking
                    </Button>
                  </Stack>
                </Section>
                {cargoTrip != null && (
                  <Section title="Last cargo booking">
                    <JsonBlock value={cargoTrip} />
                  </Section>
                )}
                <Section title="Save home location">
                  <Stack spacing={1}>
                    <TextField
                      size="small"
                      label="Home address"
                      fullWidth
                      value={homeAddress}
                      onChange={(e) => setHomeAddress(e.target.value)}
                    />
                    <Button
                      variant="outlined"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          setPassenger(
                            await api.saveLocations([
                              {
                                label: 'home',
                                address: homeAddress,
                                latitude: 33.7294,
                                longitude: 73.0931,
                                isDefault: true,
                              },
                            ]),
                          );
                        }, 'Home location saved')
                      }
                    >
                      Save home place
                    </Button>
                  </Stack>
                </Section>
                {stats != null && (
                  <Section title="Stats">
                    <JsonBlock value={stats} />
                  </Section>
                )}
                {passenger != null && (
                  <Section title="Passenger view">
                    <JsonBlock value={passenger} />
                  </Section>
                )}
                {wallet != null && (
                  <Section title="Wallet">
                    <JsonBlock value={{ wallet, transactions: walletTx }} />
                  </Section>
                )}
                {rides != null && (
                  <Section title="Rides">
                    <JsonBlock value={rides} />
                  </Section>
                )}
              </>
            )}

            {screen === 'app' && tab === 'invites' && (
              <>
                <Alert severity="info" sx={{ mb: 2 }}>
                  Pending fleet invitations for this account. Accept to join as a fleet driver, or reject.
                </Alert>
                <Section title="My invitations">
                  <Stack spacing={1} sx={{ mb: 1.5 }}>
                    <Button
                      variant="contained"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          setInvites(await api.listMyFleetInvites());
                        }, 'Invites refreshed')
                      }
                    >
                      Refresh invites
                    </Button>
                  </Stack>
                  {(invites ?? []).length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      {invites === null
                        ? 'Tap Refresh invites to load.'
                        : 'No pending invitations.'}
                    </Typography>
                  ) : (
                    <Stack spacing={1.5}>
                      {invites!.map((inv) => (
                        <Paper key={inv.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            {inv.fleetCompany.legalName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Type: {inv.kind}
                            {inv.memberRole ? ` (${inv.memberRole})` : ' (fleet driver)'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                            Expires: {new Date(inv.expiresAt).toLocaleString()}
                          </Typography>
                          <Stack direction="row" spacing={1}>
                            <Button
                              size="small"
                              variant="contained"
                              color="success"
                              disabled={busy}
                              onClick={() =>
                                run(async () => {
                                  await api.acceptFleetInvite(inv.token);
                                  setInvites(await api.listMyFleetInvites());
                                  setDriver(await api.getDriver().catch(() => null));
                                  await refreshMe();
                                }, `Accepted invite from ${inv.fleetCompany.legalName}`)
                              }
                            >
                              Accept
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              disabled={busy}
                              onClick={() =>
                                run(async () => {
                                  await api.rejectFleetInvite(inv.token);
                                  setInvites(await api.listMyFleetInvites());
                                }, 'Invitation rejected')
                              }
                            >
                              Reject
                            </Button>
                          </Stack>
                        </Paper>
                      ))}
                    </Stack>
                  )}
                </Section>
              </>
            )}

            {screen === 'app' && tab === 'driver' && (
              <>
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Going online requires approved driver onboarding. Admin must approve from platform portal.
                </Alert>
                <Section title="Register vehicle">
                  <Stack spacing={1.5}>
                    <TextField size="small" label="Type" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} fullWidth />
                    <TextField size="small" label="Model" value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} fullWidth />
                    <TextField size="small" label="Plate" value={plate} onChange={(e) => setPlate(e.target.value)} fullWidth />
                    <TextField
                      size="small"
                      type="number"
                      label="Cargo capacity (kg)"
                      value={cargoCapacityKg}
                      onChange={(e) => setCargoCapacityKg(Number(e.target.value))}
                      fullWidth
                    />
                    <Button
                      variant="contained"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await api.updateProfile({
                            role: 'driver',
                            fullName: fullName || 'Demo Driver',
                            vehicleType,
                            vehicleModel,
                            numberPlate: plate,
                            availableSeats: 4,
                            licenseNumber: 'LIC-DEMO-001',
                          });
                          setDriver(
                            await api.upsertVehicle({
                              vehicleType,
                              model: vehicleModel,
                              numberPlate: plate,
                              availableSeats: 4,
                              color: 'White',
                              cargoCapacityKg,
                            }),
                          );
                          await refreshMe();
                        }, 'Driver + vehicle saved (with cargo capacity)')
                      }
                    >
                      Save driver + vehicle
                    </Button>
                  </Stack>
                </Section>
                <Section title="Service modes (rides / cargo)">
                  <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
                    {(
                      [
                        ['rides', ['rides']],
                        ['cargo', ['cargo']],
                        ['both', ['rides', 'cargo']],
                      ] as const
                    ).map(([label, modes]) => (
                      <Chip
                        key={label}
                        label={label}
                        color={
                          serviceModes.length === modes.length &&
                          modes.every((m) => serviceModes.includes(m))
                            ? 'primary'
                            : 'default'
                        }
                        onClick={() => setServiceModes([...modes])}
                        clickable
                      />
                    ))}
                  </Stack>
                  <Button
                    variant="outlined"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        setDriver(await api.setServiceModes(serviceModes));
                      }, `Service modes → ${serviceModes.join('+')}`)
                    }
                  >
                    Save service modes
                  </Button>
                </Section>
                <Section title="Documents (mock URL)">
                  <Button
                    variant="outlined"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api.registerDocument('driver_license', '/uploads/demo-license.jpg');
                        await api.registerDocument('selfie', '/uploads/demo-selfie.jpg');
                        setDocs(await api.listDocuments());
                      }, 'Documents registered (pending review)')
                    }
                  >
                    Submit license + selfie
                  </Button>
                </Section>
                <Section title="Availability">
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                    <Button
                      variant="contained"
                      color="success"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          setDriver(await api.setAvailability(true, serviceModes));
                        }, 'Went online')
                      }
                    >
                      Go online
                    </Button>
                    <Button
                      variant="outlined"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          setDriver(await api.setAvailability(false));
                        }, 'Went offline')
                      }
                    >
                      Go offline
                    </Button>
                    <Button
                      variant="text"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          setDriver(await api.getDriver());
                          setOnboarding(await api.getOnboarding());
                          setDocs(await api.listDocuments());
                        }, 'Driver refreshed')
                      }
                    >
                      Refresh
                    </Button>
                    <Button
                      variant="text"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await api.registerFcmToken({
                            fcmToken: `driver-portal-${Date.now()}`,
                            platform: 'android',
                            deviceName: 'Test Portal Driver',
                          });
                        }, 'Driver FCM registered')
                      }
                    >
                      Register FCM
                    </Button>
                  </Stack>
                </Section>                {driver != null && (
                  <Section title="Driver view">
                    <JsonBlock value={driver} />
                  </Section>
                )}
                {docs != null && (
                  <Section title="Documents">
                    <JsonBlock value={docs} />
                  </Section>
                )}
                {onboarding != null && (
                  <Section title="Onboarding">
                    <JsonBlock value={onboarding} />
                  </Section>
                )}
              </>
            )}
          </Box>
        </Paper>

        <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
          Uses separate session keys — does not log you out of Admin / Fleet portal.
          <br />
          Open: /test-app
        </Typography>
      </Box>
    </Box>
  );
}
