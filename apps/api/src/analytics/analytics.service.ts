import { Injectable } from "@nestjs/common";

import { PrismaService } from "../common/prisma.service";
import type { TenantContext } from "../common/context";

/** Indicateurs calculés uniquement à partir des données réelles du registre. */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(ctx: TenantContext, days: number) {
    const tenantId = ctx.tenantId;
    const since = new Date(Date.now() - days * 86_400_000);
    const db = this.prisma.client;

    const [members, newMembers, earned, used, reversedRedemptions, redemptions, returning, daily] = await Promise.all([
      db.loyaltyAccount.count({ where: { tenantId, status: { not: "CLOSED" } } }),
      db.loyaltyAccount.count({ where: { tenantId, createdAt: { gte: since } } }),
      db.loyaltyTransaction.aggregate({
        where: { tenantId, createdAt: { gte: since }, kind: { in: ["EARN", "ADJUSTMENT"] }, delta: { gt: 0 } },
        _sum: { delta: true },
      }),
      db.loyaltyTransaction.aggregate({ where: { tenantId, createdAt: { gte: since }, kind: "REDEMPTION" }, _sum: { delta: true } }),
      db.loyaltyTransaction.aggregate({ where: { tenantId, createdAt: { gte: since }, kind: "REDEMPTION_REVERSAL" }, _sum: { delta: true } }),
      db.rewardRedemption.count({ where: { tenantId, createdAt: { gte: since }, status: "COMPLETED" } }),
      db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM (
          SELECT "accountId" FROM "LoyaltyTransaction"
          WHERE "tenantId" = ${tenantId}::uuid AND kind = 'EARN' AND "createdAt" >= ${since}
          GROUP BY "accountId" HAVING COUNT(*) >= 2
        ) t`,
      db.$queryRaw<{ day: Date; visits: bigint; points: bigint; enrollments: bigint }[]>`
        WITH days AS (
          SELECT generate_series(date_trunc('day', ${since}::timestamp), date_trunc('day', now()), interval '1 day') AS day
        )
        SELECT d.day,
          COALESCE((SELECT COUNT(*) FROM "LoyaltyTransaction" t WHERE t."tenantId" = ${tenantId}::uuid AND t.kind = 'EARN' AND date_trunc('day', t."createdAt") = d.day), 0)::bigint AS visits,
          COALESCE((SELECT SUM(t.delta) FROM "LoyaltyTransaction" t WHERE t."tenantId" = ${tenantId}::uuid AND t.kind = 'EARN' AND date_trunc('day', t."createdAt") = d.day), 0)::bigint AS points,
          COALESCE((SELECT COUNT(*) FROM "LoyaltyAccount" a WHERE a."tenantId" = ${tenantId}::uuid AND date_trunc('day', a."createdAt") = d.day), 0)::bigint AS enrollments
        FROM days d ORDER BY d.day`,
    ]);

    return {
      periodDays: days,
      members,
      newMembers,
      pointsDistributed: earned._sum.delta ?? 0,
      pointsUsed: -(used._sum.delta ?? 0) - (reversedRedemptions._sum.delta ?? 0),
      rewardsRedeemed: redemptions,
      returningCustomers: Number(returning[0]?.count ?? 0),
      daily: daily.map((d) => ({
        day: d.day.toISOString().slice(0, 10),
        visits: Number(d.visits),
        points: Number(d.points),
        enrollments: Number(d.enrollments),
      })),
    };
  }
}

