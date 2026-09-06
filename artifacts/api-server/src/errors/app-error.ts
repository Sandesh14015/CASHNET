export type ErrorCode =
  | "VALIDATION_FAILED"
  | "PROVIDER_FAILED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "SERVICE_UNAVAILABLE"
  | "UNSUPPORTED_CHAIN"
  | "UNSUPPORTED_CAPABILITY"
  | "NOT_FOUND"
  | "AUTHENTICATION_REQUIRED"
  | "AUTHORIZATION_FAILED"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly statusCode: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationFailureError extends AppError {
  constructor(message = "Request validation failed", details?: unknown) { super("VALIDATION_FAILED", message, 400, details); }
}
export class ProviderFailureError extends AppError {
  constructor(message = "Provider request failed", details?: unknown) { super("PROVIDER_FAILED", message, 502, details); }
}
export class RateLimitError extends AppError {
  constructor(message = "Provider rate limit reached", details?: unknown) { super("RATE_LIMITED", message, 429, details); }
}
export class TimeoutError extends AppError {
  constructor(message = "Upstream request timed out", details?: unknown) { super("TIMEOUT", message, 504, details); }
}
export class UnavailableServiceError extends AppError {
  constructor(message = "Service is unavailable", details?: unknown) { super("SERVICE_UNAVAILABLE", message, 503, details); }
}
export class UnsupportedChainError extends AppError {
  constructor(message = "This blockchain is not supported", details?: unknown) { super("UNSUPPORTED_CHAIN", message, 422, details); }
}
export class UnsupportedCapabilityError extends AppError {
  constructor(message = "This provider capability is not supported", details?: unknown) { super("UNSUPPORTED_CAPABILITY", message, 422, details); }
}
export class NotFoundError extends AppError {
  constructor(message = "Resource not found", details?: unknown) { super("NOT_FOUND", message, 404, details); }
}
export class AuthorizationFailureError extends AppError {
  constructor(message = "Not authorized", details?: unknown) { super("AUTHORIZATION_FAILED", message, 403, details); }
}
export class AuthenticationRequiredError extends AppError {
  constructor(message = "Authentication is required") { super("AUTHENTICATION_REQUIRED", message, 401); }
}
