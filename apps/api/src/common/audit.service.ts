import { Injectable } from "@nestjs/common";
import type { Prisma } from "@fove/database";
import { PrismaService } from "./prisma.service";
import { actorApiKeyId, actorUserId, type TenantContext } from "./context";

type Db = Pick<PrismaService["client"], "auditLog"> | Prisma.TransactionClient;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    entry: {
      tenantId?: string | null;
      actorUserId?: string | null;
      actorApiKeyId?: string | null;
      action: string;
      targetType?: string;
      targetId?: string;
      metadata?: Prisma.InputJsonValue;
      ip?: string | null;
    },
    db: Db = this.prisma.client,
  ): Promise<void> {
    await db.auditLog.create({
      data: {
        tenantId: entry.tenantId ?? null,
        actorUserId: entry.actorUserId ?? null,
        actorApiKeyId: entry.actorApiKeyId ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata: entry.metadata,
        ip: entry.ip ?? null,
      },
    });
  }

  forTenant(ctx: TenantContext, action: string, target?: { type: string; id: string }, metadata?: Prisma.InputJsonValue, db?: Db) {
    return this.log(
      {
        tenantId: ctx.tenantId,
        actorUserId: actorUserId(ctx),
        actorApiKeyId: actorApiKeyId(ctx),
        action,
        targetType: target?.type,
        targetId: target?.id,
        metadata,
      },
      db,
    );
  }
}
