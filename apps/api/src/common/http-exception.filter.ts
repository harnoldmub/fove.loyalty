import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger, type ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { ThrottlerException } from "@nestjs/throttler";
import type { AppRequest } from "./context";
import type { PrismaService } from "./prisma.service";

/** Format d'erreur uniforme ; les 5xx sont journalisées pour l'administration. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("Errors");

  constructor(private readonly prisma: PrismaService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<AppRequest>();

    if (exception instanceof ThrottlerException) {
      res.status(429).json({ error: { code: "rate_limited", message: "Trop de requêtes, réessayez dans un instant." } });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "object" && body !== null && "error" in body) {
        res.status(status).json(body);
      } else {
        const message = typeof body === "string" ? body : ((body as { message?: string }).message ?? exception.message);
        res.status(status).json({ error: { code: HttpStatus[status]?.toLowerCase() ?? "error", message } });
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
    res.status(500).json({ error: { code: "internal_error", message: "Erreur interne", requestId: req.requestId } });
  }
}
