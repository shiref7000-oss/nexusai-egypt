import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db_pg';
import { logger } from '../config/logger';
import { syncUserPlanLimit } from './usage';

const ALLOWED_PLANS = ['free', 'starter', 'pro', 'enterprise'] as const;
const ALLOWED_ROLES = ['superadmin', 'admin', 'moderator', 'user', 'viewer'] as const;

export function normalizePlan(plan?: string): string {
  if (!plan || plan === 'professional') return 'pro';
  if (plan === 'basic') return 'starter';
  return ALLOWED_PLANS.includes(plan as any) ? plan : 'free';
}

export function normalizeRole(role?: string): string {
  if (role && ALLOWED_ROLES.includes(role as any)) return role;
  return 'user';
}

export interface PgUserRecord {
  id: number;
  email: string;
  full_name: string | null;
  role: string;
  plan: string;
  status: string;
  password_hash?: string;
}

export async function findPgUserByEmail(email: string): Promise<PgUserRecord | null> {
  const r = await pool.query(
    `SELECT id, email, full_name, role::text AS role, plan::text AS plan,
            status::text AS status, password_hash
     FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email]
  );
  return r.rows[0] || null;
}

export async function createPgUser(input: {
  email: string;
  password: string;
  name: string;
  role?: string;
  plan?: string;
}): Promise<PgUserRecord> {
  const passwordHash = await bcrypt.hash(input.password, 12);
  const role = normalizeRole(input.role);
  const plan = normalizePlan(input.plan);
  const supabaseUid = crypto.randomUUID();

  const limitRes = await pool.query(
    'SELECT monthly_requests FROM plans WHERE slug = $1 OR slug = $2 LIMIT 1',
    [plan, plan === 'starter' ? 'basic' : plan]
  );
  const monthlyLimit = limitRes.rows[0]?.monthly_requests ?? (plan === 'free' ? 100 : 1000);

  const r = await pool.query(
    `INSERT INTO users (
      supabase_uid, email, full_name, password_hash, role, plan, status, monthly_request_limit
    ) VALUES (
      $1::uuid, $2, $3, $4, $5::role_enum, $6::plan_enum, 'active'::status_enum, $7
    )
    RETURNING id, email, full_name, role::text AS role, plan::text AS plan, status::text AS status`,
    [supabaseUid, input.email, input.name, passwordHash, role, plan, monthlyLimit]
  );

  const user = r.rows[0] as PgUserRecord;
  await syncUserPlanLimit(user.id, plan);
  logger.info('User registered in PostgreSQL', { userId: user.id, email: user.email, role, plan });
  return user;
}

export async function verifyPgUserPassword(
  email: string,
  password: string
): Promise<PgUserRecord | null> {
  const user = await findPgUserByEmail(email);
  if (!user?.password_hash) return null;
  const valid = await bcrypt.compare(password, user.password_hash);
  return valid ? user : null;
}

export async function touchPgUserLogin(userId: number): Promise<void> {
  await pool.query(
    `UPDATE users SET last_login = NOW(), login_count = COALESCE(login_count, 0) + 1, updated_at = NOW()
     WHERE id = $1`,
    [userId]
  );
}

export async function updatePgUserPassword(userId: number, newPassword: string): Promise<void> {
  const hash = await bcrypt.hash(newPassword, 12);
  await pool.query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [hash, userId]
  );
}

export function pgUserToAuthProfile(pg: PgUserRecord) {
  return {
    id: String(pg.id),
    email: pg.email,
    name: pg.full_name || pg.email.split('@')[0],
    role: pg.role,
    plan: pg.plan,
    status: pg.status,
    pgUserId: pg.id,
  };
}
