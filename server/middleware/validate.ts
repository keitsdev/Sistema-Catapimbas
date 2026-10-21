import type { RequestHandler } from "express";
import type { ZodType } from "zod";

export function validate(schema: {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}): RequestHandler {
  return (req, _res, next) => {
    if (schema.body) req.body = schema.body.parse(req.body);
    if (schema.query) req.query = schema.query.parse(req.query) as typeof req.query;
    if (schema.params) req.params = schema.params.parse(req.params) as typeof req.params;
    next();
  };
}
