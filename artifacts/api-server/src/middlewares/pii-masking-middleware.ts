/**
 * PII Masking Middleware for Express
 * 
 * Automatically masks sensitive data in API responses based on:
 * - Dashboard routes (aggressive masking)
 * - Authenticated user context (role-based masking)
 * - Data sensitivity classification
 * 
 * Usage:
 *   app.use(piiMaskingMiddleware(config));
 */

import { Request, Response, NextFunction } from "express";
import { PiiMasker, DEFAULT_MASKING_CONFIG, MaskingConfig } from "../lib/pii-masking";

// Extend Express Response to allow intercepting json() calls
interface MaskableResponse extends Response {
  originalJson?: (body: any, ...args: any[]) => Response;
  piiMaskingConfig?: MaskingConfig;
  shouldMaskPII?: boolean;
}

// Routes that require PII masking
const DASHBOARD_ROUTES = ["/api/dashboard", "/api/cases", "/api/cases/"];

// Routes that require strict masking
const STRICT_MASKING_ROUTES = ["/api/reports", "/api/wallets", "/api/interventions"];

// Routes that should never be masked (internal/admin)
const NO_MASKING_ROUTES = ["/api/health", "/api/status"];

/**
 * Determine masking config based on route and request context
 */
function getMaskingConfigForRoute(
  req: Request,
  route: string
): { shouldMask: boolean; config: MaskingConfig } {
  // Check for explicit no-masking routes
  if (NO_MASKING_ROUTES.some((r) => route.startsWith(r))) {
    return {
      shouldMask: false,
      config: DEFAULT_MASKING_CONFIG,
    };
  }

  // Check for strict masking routes (dashboard views)
  if (DASHBOARD_ROUTES.some((r) => route.startsWith(r))) {
    return {
      shouldMask: true,
      config: {
        ...DEFAULT_MASKING_CONFIG,
        maskAccountNumbers: true,
        maskPhoneNumbers: true,
        maskEmails: true,
        maskNames: true,
        maskWalletAddresses: true,
        maskAadhaar: true,
        maskPANCard: true,
        maskDOB: true,
      },
    };
  }

  // Check for report routes (strict masking)
  if (STRICT_MASKING_ROUTES.some((r) => route.startsWith(r))) {
    return {
      shouldMask: true,
      config: {
        ...DEFAULT_MASKING_CONFIG,
        maskAccountNumbers: true,
        maskPhoneNumbers: true,
        maskAddresses: true,
        maskNames: true,
      },
    };
  }

  // Default: apply standard masking
  return {
    shouldMask: true,
    config: DEFAULT_MASKING_CONFIG,
  };
}

/**
 * Express middleware for PII masking in responses
 * 
 * @param options - Configuration options
 * @param options.enableMasking - Enable/disable PII masking (default: true)
 * @param options.logMaskedFields - Log which fields were masked (default: false)
 */
export function piiMaskingMiddleware(options: {
  enableMasking?: boolean;
  logMaskedFields?: boolean;
} = {}) {
  const { enableMasking = true, logMaskedFields = false } = options;

  return (req: Request, res: MaskableResponse, next: NextFunction) => {
    if (!enableMasking) {
      return next();
    }

    // Determine if this route should be masked
    const { shouldMask, config } = getMaskingConfigForRoute(req, req.path);

    // Store masking config on response for use in json()
    res.piiMaskingConfig = config;
    res.shouldMaskPII = shouldMask;

    // Intercept the res.json() method
    res.originalJson = res.json;
    res.json = function (body: any, ...args: any[]) {
      if (res.shouldMaskPII && res.piiMaskingConfig) {
        const masker = new PiiMasker(res.piiMaskingConfig);

        if (logMaskedFields) {
          console.debug(`[PII Masking] Masking response for route: ${req.path}`);
        }

        body = masker.apply(body);

        // Log headers if needed
        if (logMaskedFields) {
          console.debug(`[PII Masking] Config: ${JSON.stringify(res.piiMaskingConfig)}`);
        }
      }

      // Call original json with masked data
      return res.originalJson!.call(this, body, ...args);
    };

    next();
  };
}

/**
 * Middleware for dashboard-specific PII masking
 * More aggressive masking for public/investigator dashboards
 */
export function dashboardPiiMaskingMiddleware() {
  return (req: Request, res: MaskableResponse, next: NextFunction) => {
    const strictConfig: MaskingConfig = {
      ...DEFAULT_MASKING_CONFIG,
      maskAccountNumbers: true,
      maskPhoneNumbers: true,
      maskEmails: true,
      maskAddresses: true,
      maskNames: true,
      maskWalletAddresses: true,
      maskIFSC: false, // IFSC codes are less sensitive
      maskBranchNames: false, // Branch names are okay
      maskAadhaar: true,
      maskPANCard: true,
      maskDOB: true,
      showLastNCharacters: 4,
    };

    res.piiMaskingConfig = strictConfig;
    res.shouldMaskPII = true;

    res.originalJson = res.json;
    res.json = function (body: any, ...args: any[]) {
      const masker = new PiiMasker(strictConfig);
      body = masker.apply(body);
      return res.originalJson!.call(this, body, ...args);
    };

    next();
  };
}

/**
 * Context-aware PII masking based on user role/permissions
 * 
 * @param getRoleConfig - Function to determine masking config based on user role
 */
export function rolePiiMaskingMiddleware(
  getRoleConfig: (req: Request) => MaskingConfig | null
) {
  return (req: Request, res: MaskableResponse, next: NextFunction) => {
    const roleConfig = getRoleConfig(req);

    if (!roleConfig) {
      return next();
    }

    res.piiMaskingConfig = roleConfig;
    res.shouldMaskPII = true;

    res.originalJson = res.json;
    res.json = function (body: any, ...args: any[]) {
      const masker = new PiiMasker(roleConfig);
      body = masker.apply(body);
      return res.originalJson!.call(this, body, ...args);
    };

    next();
  };
}

/**
 * Selective PII masking for specific routes only
 */
export function selectivePiiMaskingMiddleware(routePatterns: string[]) {
  return (req: Request, res: MaskableResponse, next: NextFunction) => {
    const shouldMask = routePatterns.some((pattern) => {
      const regex = new RegExp(pattern);
      return regex.test(req.path);
    });

    if (!shouldMask) {
      return next();
    }

    const config = DEFAULT_MASKING_CONFIG;
    res.piiMaskingConfig = config;
    res.shouldMaskPII = true;

    res.originalJson = res.json;
    res.json = function (body: any, ...args: any[]) {
      const masker = new PiiMasker(config);
      body = masker.apply(body);
      return res.originalJson!.call(this, body, ...args);
    };

    next();
  };
}

export default piiMaskingMiddleware;
