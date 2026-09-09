import "server-only";

/**
 * Simple in-memory sliding-window-ish rate limiter (fixed window,
 * actually — good enough here). Deliberately has no external dependency
 * so it works with zero setup.
 *
 * IMPORTANT CAVEAT: this only limits requests handled by a single
 * serverless function instance's memory. On Vercel, concurrent requests
 * can land on different instances (and cold starts reset the map
 * entirely), so this is a best-effort speed bump against casual abuse —
 * not a hard guarantee. For real protection at scale, swap this for
 * `@upstash/ratelimit` backed by Upstash Redis (a few lines to wire up,
 * and has a generous free tier) so limits are enforced across instances.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

// Periodically clear old entries so this map doesn't grow unbounded across
// a long-lived instance's lifetime.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}, 60_000).unref?.();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count++;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Best-effort caller IP from standard proxy headers (Vercel sets these). */
export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
