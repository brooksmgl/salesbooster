// Simple in-memory rate limiter (best-effort). For multi-region, swap for Upstash/Redis.
const BUCKET = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, maxPerMin = 20) {
  const now = Date.now();
  const slot = Math.floor(now / 60000);
  const rec = BUCKET.get(key);
  if (!rec || rec.reset !== slot) {
    BUCKET.set(key, { count: 1, reset: slot });
    return { ok: true };
  }
  if (rec.count >= maxPerMin) return { ok: false };
  rec.count++;
  return { ok: true };
}
