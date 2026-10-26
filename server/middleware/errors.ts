import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../../src/lib/http-error";

export const notFound: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, "NOT_FOUND", `Rota não encontrada: ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) {
    return res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Dados inválidos",
        details: error.flatten(),
      },
      requestId: req.id,
    });
  }

  const normalized =
    error instanceof HttpError
      ? error
      : new HttpError(500, "INTERNAL_ERROR", "Erro interno inesperado");

  if (normalized.status >= 500) {
    if (req.log) {
      req.log.error({ err: error }, normalized.message);
    } else {
      console.error(error);
    }
  }

  return res.status(normalized.status).json({
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details === undefined ? {} : { details: normalized.details }),
    },
    requestId: req.id,
  });
};