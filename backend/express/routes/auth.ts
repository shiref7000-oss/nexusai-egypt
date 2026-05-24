import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { env } from '../config/env';
import { authLimiter } from '../middleware/rateLimit';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { getUserUsage, syncUserPlanLimit } from '../services/usage';
import {
  createPgUser,
  findPgUserByEmail,
  pgUserToAuthProfile,
  touchPgUserLogin,
  updatePgUserPassword,
  verifyPgUserPassword,
} from '../services/userPersistence';
import { logger } from '../config/logger';

const router = Router();

function generateToken(userId: string, email: string, role: string = 'user', plan: string = 'free', name: string = 'User'): string {
  return jwt.sign({ userId, email, role, plan, name }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as any);
}

async function buildAuthResponse(profile: {
  id: string;
  email: string;
  name: string;
  role: string;
  plan: string;
  status: string;
  pgUserId?: number;
}) {
  const token = generateToken(profile.id, profile.email, profile.role, profile.plan, profile.name);
  let usagePayload: Record<string, unknown> = {};
  if (profile.pgUserId) {
    const usage = await getUserUsage(profile.pgUserId);
    if (usage) {
      usagePayload = {
        monthlyRequestLimit: usage.monthlyLimit,
        monthlyRequestsUsed: usage.monthlyUsed,
        remaining: usage.remaining,
        totalRequests: usage.totalRequests,
        lastRequestAt: usage.lastRequestAt,
      };
    }
  }
  return {
    success: true,
    data: {
      user: { ...profile, ...usagePayload },
      token,
    },
  };
}

// Register — persists to PostgreSQL (source of truth for admin users list)
router.post('/register', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').trim().isLength({ min: 2 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

    const { email, password, name, role } = req.body;

    const existingPg = await findPgUserByEmail(email);
    if (existingPg) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    const pgUser = await createPgUser({
      email,
      password,
      name,
      role: role === 'superadmin' || role === 'admin' ? undefined : 'user',
      plan: 'free',
    });

    const profile = pgUserToAuthProfile(pgUser);
    res.status(201).json(await buildAuthResponse(profile));
  } catch (err: any) {
    logger.error('Register error', { error: err.message, code: err.code });
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }
    res.status(500).json({ success: false, error: 'Registration failed. Please try again.' });
  }
});

// Login — PostgreSQL only
router.post('/login', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').exists(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

    const { email, password } = req.body;

    const pgUser = await verifyPgUserPassword(email, password);
    if (pgUser) {
      if (pgUser.status === 'suspended') {
        return res.status(403).json({ success: false, error: 'Account suspended', code: 'AUTH_SUSPENDED' });
      }
      if (pgUser.status === 'pending') {
        return res.status(403).json({ success: false, error: 'Account pending activation', code: 'AUTH_PENDING' });
      }
      if (pgUser.status === 'inactive') {
        return res.status(403).json({ success: false, error: 'Account inactive', code: 'AUTH_INACTIVE' });
      }
      await touchPgUserLogin(pgUser.id);
      await syncUserPlanLimit(pgUser.id, pgUser.plan);
      const profile = pgUserToAuthProfile(pgUser);
      return res.json(await buildAuthResponse(profile));
    }

    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  } catch (err: any) {
    logger.error('Login error', { error: err.message });
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.get('/me', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const pgUserId = req.user?.pgUserId ?? (req.user?.email ? (await findPgUserByEmail(req.user.email))?.id : null);
    let usage = null;
    if (pgUserId) usage = await getUserUsage(pgUserId);
    res.json({
      success: true,
      data: {
        user: {
          ...req.user,
          ...(usage ? {
            monthlyRequestLimit: usage.monthlyLimit,
            monthlyRequestsUsed: usage.monthlyUsed,
            remaining: usage.remaining,
            totalRequests: usage.totalRequests,
            lastRequestAt: usage.lastRequestAt,
          } : {}),
        },
      },
    });
  } catch {
    res.json({ success: true, data: { user: req.user } });
  }
});

router.put('/reset-password', authenticate, [
  body('currentPassword').exists(),
  body('newPassword').isLength({ min: 6 }),
], async (req: AuthenticatedRequest, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

    const { currentPassword, newPassword } = req.body;
    const pgUser = req.user?.email ? await findPgUserByEmail(req.user.email) : null;

    if (pgUser?.password_hash) {
      const valid = await bcryptjs.compare(currentPassword, pgUser.password_hash);
      if (!valid) return res.status(401).json({ success: false, error: 'Current password is incorrect' });
      await updatePgUserPassword(pgUser.id, newPassword);
      return res.json({ success: true, data: { message: 'Password updated successfully' } });
    }

    return res.status(404).json({ success: false, error: 'User not found in database' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.post('/guest', async (_req, res) => {
  res.status(410).json({
    success: false,
    error: 'Guest login disabled. Use a registered account.',
    code: 'GUEST_DISABLED',
  });
});

export default router;
