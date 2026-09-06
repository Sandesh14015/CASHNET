import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError, NotFoundError, ValidationFailureError } from "./app-error";

type ErrorAttributes = Record<string, unknown>;

function redactOperationalMessage(message: string) {
  return message
    .replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi, "$1[REDACTED]@")
    .replace(/\b(password|token|api[_-]?key|secret)\s*(=|:)\s*[^\s,;]+/gi, "$1$2 [REDACTED]");
}

/**
 * Preserve database diagnostics for server-side correlation while keeping the
 * public response generic and never emitting connection secrets.
 */
export function operationalErrorDetails(error: unknown) {
  const attributes = error !== null && typeof error === "object" ? error as ErrorAttributes : {};
  const message = error instanceof Error ? redactOperationalMessage(error.message) : "Non-Error exception";
  return {
    type: error instanceof Error ? error.name : "NonError",
    message,
    ...(typeof attributes.code === "string" ? { databaseCode: attributes.code } : {}),
    ...(typeof attributes.schema === "string" ? { schema: attributes.schema } : {}),
    ...(typeof attributes.table === "string" ? { table: attributes.table } : {}),
    ...(typeof attributes.column === "string" ? { column: attributes.column } : {}),
    ...(typeof attributes.constraint === "string" ? { constraint: attributes.constraint } : {}),
  };
}

export const v1NotFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`No API v1 route matches ${req.method} ${req.path}`));
};

export const apiErrorHandler: ErrorRequestHandler = async (error, req, res, _next) => {
  const appError = error instanceof ZodError
    ? new ValidationFailureError("Request validation failed", error.issues)
    : error instanceof AppError
      ? error
      : new AppError("INTERNAL_ERROR", "An unexpected error occurred", 500);

  req.log?.error({ err: operationalErrorDetails(error), code: appError.code, statusCode: appError.statusCode }, "API request failed");
  if (appError.code === "INTERNAL_ERROR") {
    try {
      const { getDatabaseRuntimeIdentity } = await import("@workspace/db");
      const database = await getDatabaseRuntimeIdentity();
      req.log?.error({ database, requestId: req.id }, "Database runtime identity for unexpected API error");
    } catch (diagnosticError) {
      req.log?.error({ err: operationalErrorDetails(diagnosticError), requestId: req.id }, "Database runtime identity query failed");
    }
  }
  res.status(appError.statusCode).json({
    error: {
      code: appError.code,
      message: appError.message,
      requestId: req.id,
      ...(appError.details === undefined ? {} : { details: appError.details }),
    },
  });
};
