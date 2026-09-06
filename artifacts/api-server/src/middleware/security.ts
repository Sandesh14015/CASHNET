/**
 * API Security Middleware
 *
 * Production-grade security controls for the CASHNET API.
 * Implements rate limiting, secure headers, CORS, request IDs, and secret redaction.
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";

// ── Request ID ──────────────────────────────────────────────────────────────

export function requestIdMiddleware(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const requestId = req.headers["x-request-id"] as string ?? crypto.randomUUID();
    (req as unknown as Record<string, unknown>).requestId = requestId;
    _res.setHeader("X-Request-ID", requestId);
    next();
  };
}

// ── Secure Headers ──────────────────────────────────────────────────────────

export function secureHeadersMiddleware(): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "0");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    next();
  };
}

// ── CORS ────────────────────────────────────────────────────────────────────

export interface CORSOptions {
  allowedOrigins: string[];
  allowedMethods?: string[];
  allowedHeaders?: string[];
  maxAge?: number;
}

export function corsMiddleware(options: CORSOptions): RequestHandler {
  const methods = (options.allowedMethods ?? ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]).join(", ");
  const headers = (options.allowedHeaders ?? ["Content-Type", "Authorization", "X-Request-ID"]).join(", ");
  const maxAge = String(options.maxAge ?? 86400);

  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && options.allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", methods);
      res.setHeader("Access-Control-Allow-Headers", headers);
      res.setHeader("Access-Control-Max-Age", maxAge);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") { res.status(204).end(); return; }
    next();
  };
}

// ── Rate Limiting ───────────────────────────────────────────────────────────

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyExtractor?: (req: Request) => string;
}

interface TokenBucket { tokens: number; lastRefill: number }

export function rateLimitMiddleware(options: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, TokenBucket>();
  const { windowMs, maxRequests } = options;
  // Do not trust X-Forwarded-For here: without an explicitly configured trusted
  // reverse proxy, a client can rotate that header to bypass rate limiting.
  // Deployments that use a proxy must provide an explicit key extractor after
  // establishing their proxy-trust boundary.
  const keyExtractor = options.keyExtractor ?? ((req: Request) => req.socket.remoteAddress ?? "unknown");

  // Cleanup stale buckets periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now - bucket.lastRefill > windowMs * 2) buckets.delete(key);
    }
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyExtractor(req);
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tokens: maxRequests, lastRefill: now };
      buckets.set(key, bucket);
    }

    // Refill tokens based on time elapsed
    const elapsed = now - bucket.lastRefill;
    const refill = Math.floor((elapsed / windowMs) * maxRequests);
    if (refill > 0) {
      bucket.tokens = Math.min(maxRequests, bucket.tokens + refill);
      bucket.lastRefill = now;
    }

    if (bucket.tokens <= 0) {
      res.setHeader("Retry-After", String(Math.ceil(windowMs / 1000)));
      res.status(429).json({ error: "Rate limit exceeded. Please retry later." });
      return;
    }

    bucket.tokens--;
    res.setHeader("X-RateLimit-Remaining", String(bucket.tokens));
    res.setHeader("X-RateLimit-Limit", String(maxRequests));
    next();
  };
}

// ── Request Size Limit ──────────────────────────────────────────────────────

export function requestSizeLimitMiddleware(maxBytes: number = 1_048_576): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = req.headers["content-length"];
    if (contentLength && Number(contentLength) > maxBytes) {
      res.status(413).json({ error: `Request body too large. Maximum ${maxBytes} bytes.` });
      return;
    }
    next();
  };
}

// ── Secret Redaction ────────────────────────────────────────────────────────

const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey|token|secret|password|passwd|pwd|auth|bearer)\s*[=:]\s*["']?([^"'\s,;]+)/gi,
  /(?:DATABASE_URL|ETHERSCAN_API_KEY|BSCSCAN_API_KEY|POLYGONSCAN_API_KEY|TRONGRID_API_KEY|SOLANA_API_KEY)\s*=\s*([^\s]+)/gi,
];

export function redactSecrets(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, (match) => {
      return match.replace(/([=:]\s*["']?)([^"'\s,;]+)/, "$1[REDACTED]");
    });
  }
  return result;
}
