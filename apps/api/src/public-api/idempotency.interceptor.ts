import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import type { Response } from "express";
import { from, of, switchMap, type Observable } from "rxjs";
import type { Prisma } from "@fove/database";
import { PrismaService } from "../common/prisma.service";
import { sha256 } from "../common/crypto";
import { badRequest, isUniqueViolation, unprocessable } from "../common/errors";
import type { AppRequest } from "../common/context";

/**
 * En-tête `Idempotency-Key` (obligatoire sur les POST de l'API publique) :
 * une requête rejouée avec la même clé et le même corps renvoie la réponse
 * d'origine ; avec un corps différent, elle est refusée.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    if (req.method !== "POST") return next.handle();
    const key = req.headers["idempotency-key"];
    if (typeof key !== "string" || key.length < 8 || key.length > 120) {
      throw badRequest("idempotency_key_required", "En-tête Idempotency-Key requis (8 à 120 caractères)");
    }
    const tenantId = req.tenant!.tenantId;
    const requestHash = sha256(`${req.method} ${req.path} ${JSON.stringify(req.body ?? {})}`);

    return from(this.prisma.client.idempotencyRecord.findUnique({ where: { tenantId_key: { tenantId, key } } })).pipe(
      switchMap((existing) => {
        if (existing) {
          if (existing.requestHash !== requestHash) throw unprocessable("idempotency_mismatch", "Clé déjà utilisée avec une autre requête");
          res.status(existing.statusCode);
          res.setHeader("Idempotent-Replayed", "true");
          return of(existing.responseBody);
        }
        return next.handle().pipe(
          switchMap(async (body) => {
            try {
              await this.prisma.client.idempotencyRecord.create({
                data: { tenantId, key, requestHash, statusCode: res.statusCode, responseBody: (body ?? null) as Prisma.InputJsonValue },
              });
            } catch (error) {
              if (!isUniqueViolation(error)) throw error;
            }
            return body;
          }),
        );
      }),
    );
  }
}
