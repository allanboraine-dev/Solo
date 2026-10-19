export type RequestLike = Request | {
  headers: Headers | { get: (name: string) => string | null };
  ip?: string;
};

interface RateLimitRecord {
  timestamps: number[];
}

// In-memory sliding window store keyed by `${bucket}:${ip}`
const rateLimitStore = new Map<string, RateLimitRecord>();

// Cleanup stale records every 5 minutes to prevent memory leaks
if (typeof setInterval !== 'undefined') {
  const timer = setInterval(() => {
    const now = Date.now();
    rateLimitStore.forEach((record, key) => {
      // Retain timestamps within the last 30 minutes
      record.timestamps = record.timestamps.filter((ts: number) => now - ts < 30 * 60 * 1000);
      if (record.timestamps.length === 0) {
        rateLimitStore.delete(key);
      }
    });
  }, 5 * 60 * 1000);
  if (timer && typeof timer.unref === 'function') {
    timer.unref();
  }
}

export function getClientIp(req: RequestLike): string {
  // 1. NextRequest IP getter
  if ('ip' in req && typeof req.ip === 'string' && req.ip) {
    return req.ip;
  }

  // 2. Standard proxy headers (Vercel, Cloudflare, AWS CloudFront)
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }

  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();

  return '127.0.0.1';
}

export interface RateLimitOptions {
  bucket: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

/**
 * Evaluates whether an incoming request is within rate limits.
 */
export function checkRateLimit(
  req: RequestLike,
  options: RateLimitOptions
): RateLimitResult {
  const ip = getClientIp(req);
  const key = `${options.bucket}:${ip}`;
  const now = Date.now();
  const windowStart = now - options.windowMs;

  let record = rateLimitStore.get(key);
  if (!record) {
    record = { timestamps: [] };
    rateLimitStore.set(key, record);
  }

  // Remove timestamps outside the sliding window
  record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

  if (record.timestamps.length >= options.limit) {
    const oldest = record.timestamps[0];
    const resetMs = oldest + options.windowMs - now;
    const resetSeconds = Math.max(1, Math.ceil(resetMs / 1000));
    return {
      allowed: false,
      limit: options.limit,
      remaining: 0,
      resetSeconds,
    };
  }

  // Record this request
  record.timestamps.push(now);
  const remaining = Math.max(0, options.limit - record.timestamps.length);
  const resetSeconds = Math.ceil(options.windowMs / 1000);

  return {
    allowed: true,
    limit: options.limit,
    remaining,
    resetSeconds,
  };
}

/**
 * Creates a standardized 429 Too Many Requests response with standard security headers.
 */
export function createRateLimitExceededResponse(
  result: RateLimitResult,
  message: string = 'Too many requests. Please slow down.'
): Response {
  return Response.json(
    {
      error: message,
      rateLimit: {
        limit: result.limit,
        remaining: result.remaining,
        retryAfter: `${result.resetSeconds}s`,
      },
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.resetSeconds),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + result.resetSeconds),
      },
    }
  );
}

/**
 * Rate Limiter for Geocoding & Address Autocomplete:
 * Limit: 45 requests per 60 seconds per IP
 */
export function checkGeocodeRateLimit(req: RequestLike) {
  const result = checkRateLimit(req, {
    bucket: 'geocode',
    limit: 45,
    windowMs: 60 * 1000,
  });

  if (!result.allowed) {
    return {
      allowed: false,
      response: createRateLimitExceededResponse(
        result,
        'Geocoding rate limit exceeded. Please wait a moment before searching again.'
      ),
    };
  }

  return { allowed: true, response: null };
}

/**
 * Rate Limiter for Driver Registration:
 * Limit: 5 registrations per 15 minutes per IP (prevents automated bot signups)
 */
export function checkRegistrationRateLimit(req: RequestLike) {
  const result = checkRateLimit(req, {
    bucket: 'driver_register',
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });

  if (!result.allowed) {
    return {
      allowed: false,
      response: createRateLimitExceededResponse(
        result,
        'Registration rate limit reached for this connection. Please try again in a few minutes.'
      ),
    };
  }

  return { allowed: true, response: null };
}

/**
 * Rate Limiter for Document Uploads:
 * Limit: 15 uploads per 10 minutes per IP
 */
export function checkUploadRateLimit(req: RequestLike) {
  const result = checkRateLimit(req, {
    bucket: 'doc_upload',
    limit: 15,
    windowMs: 10 * 60 * 1000,
  });

  if (!result.allowed) {
    return {
      allowed: false,
      response: createRateLimitExceededResponse(
        result,
        'Upload rate limit exceeded. Please wait a few moments before uploading more documents.'
      ),
    };
  }

  return { allowed: true, response: null };
}

/**
 * Rate Limiter for Safety / SOS Dispatches:
 * Limit: 10 SOS dispatches per 60 seconds per IP (protects control room from spam)
 */
export function checkSosRateLimit(req: RequestLike) {
  const result = checkRateLimit(req, {
    bucket: 'safety_sos',
    limit: 10,
    windowMs: 60 * 1000,
  });

  if (!result.allowed) {
    return {
      allowed: false,
      response: createRateLimitExceededResponse(
        result,
        'Emergency dispatch rate limit reached. If this is an active emergency, call 10111 directly.'
      ),
    };
  }

  return { allowed: true, response: null };
}

/**
 * For testing purposes: resets the in-memory rate limit store.
 */
export function _resetRateLimits(): void {
  rateLimitStore.clear();
}
