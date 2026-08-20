import { z } from 'zod';

export const sendOtpSchema = z.object({
  phone: z.string().min(8),
  regionCode: z.string().optional(),
});

export const verifyOtpSchema = z.object({
  phone: z.string().min(8),
  code: z.string().min(4).max(8),
  regionCode: z.string().optional(),
  /** Optional: register FCM token in the same login call (mobile). */
  fcmToken: z.string().min(1).optional(),
  platform: z.string().max(32).optional(),
  deviceName: z.string().max(120).optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const changeAdminPasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const logoutSchema = z.object({
  refreshToken: z.string().optional(),
});
