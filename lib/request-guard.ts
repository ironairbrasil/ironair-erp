import crypto from 'node:crypto';
import { db } from './db';

const buckets = new Map<string, { count: number; resetAt: number }>();

export function clientIp(req: Request) {
  return (req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || 'unknown').trim();
}

export function enforceBodyLimit(req: Request, maxBytes: number) {
  const length = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > maxBytes) throw new Error('payload_too_large');
}

export function enforceRateLimit(req: Request, scope: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  const key = crypto.createHash('sha256').update(`${scope}:${clientIp(req)}`).digest('hex');
  const prior = buckets.get(key);
  const bucket = !prior || prior.resetAt <= now ? { count: 0, resetAt: now + windowMs } : prior;
  bucket.count += 1;
  buckets.set(key, bucket);
  if (bucket.count > limit) throw new Error('rate_limited');
  if (buckets.size > 10_000) for (const [entry, value] of buckets) if (value.resetAt <= now) buckets.delete(entry);
}

export async function enforceDistributedRateLimit(req: Request, scope: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const expiresAt = new Date(windowStart.getTime() + windowMs * 2);
  const key = crypto.createHash('sha256').update(`${scope}:${clientIp(req)}`).digest('hex');
  const rows = await db.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count", "expiresAt")
    VALUES (${key}, ${windowStart}, 1, ${expiresAt})
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
    RETURNING "count"
  `;
  if ((rows[0]?.count || 0) > limit) throw new Error('rate_limited');
}

export function guardStatus(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'payload_too_large') return 413;
  if (message === 'rate_limited') return 429;
  return 400;
}
