import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger, type ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { ThrottlerException } from "@nestjs/throttler";
import type { AppRequest } from "./context";
import type { PrismaService } from "./prisma.service";
import { requestLocale, type Locale } from "../i18n/locale";
import { translateError } from "../i18n/errors";

interface ErrorBody {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}

/** Traduit le message et, pour une validation, le message de chaque champ. */
export function localizeErrorBody(body: ErrorBody, locale: Locale): ErrorBody {
  if (locale === "fr") return body;
  const { error } = body;
  const details = Array.isArray(error.details)
    ? error.details.map((d: unknown) =>
        d && typeof d === "object" && typeof (d as { message?: unknown }).message === "string"
          ? { ...(d as object), message: translateError(locale, (d as { message: string }).message) }
          : d,
      )
    : error.details;
  return { error: { ...error, message: translateError(locale, error.message), ...(details !== undefined ? { details } : {}) } };
}

/** Format d'erreur uniforme ; les 5xx sont journalisées pour l'administration. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("Errors");

  constructor(private readonly prisma: PrismaService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<AppRequest>();
    const locale = requestLocale(req);
    res.setHeader("Content-Language", locale);
    const send = (status: number, body: ErrorBody) => res.status(status).json(localizeErrorBody(body, locale));

    if (exception instanceof ThrottlerException) {
      send(429, { error: { code: "rate_limited", message: "Trop de requêtes, réessayez dans un instant." } });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "object" && body !== null && "error" in body) {
        send(status, body as ErrorBody);
      } else {
        const message = typeof body === "string" ? body : ((body as { message?: string }).message ?? exception.message);
        send(status, { error: { code: HttpStatus[status]?.toLowerCase() ?? "error", message } });
      }
      return;
    }

    const error = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(`${req.method} ${req.originalUrl} — ${error.message}`, error.stack);
    void this.prisma.client.errorLog
      .create({
        data: {
          requestId: req.requestId,
          method: req.method,
          path: req.originalUrl.split("?")[0]?.slice(0, 300),
          status: 500,
          message: error.message.slice(0, 1000),
          stack: error.stack?.slice(0, 4000),
          tenantId: req.tenant?.tenantId ?? null,
        },
      })
      .catch(() => undefined);
    send(500, { error: { code: "internal_error", message: "Erreur interne", requestId: req.requestId } });
  }
}
