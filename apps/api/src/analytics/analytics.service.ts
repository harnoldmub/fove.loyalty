import { Injectable } from "@nestjs/common";
import { computeCustomerSegment, type CustomerSegment } from "@fove/shared";
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

    const [members, newMembers, earned, used, reversedRedemptions, redemptions, returning, daily, customers, estsWithStats] = await Promise.all([
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
      db.customer.findMany({
        where: { tenantId, anonymizedAt: null },
        select: { totalVisits: true, totalSpend: true, lastVisitAt: true, createdAt: true },
      }),
      db.establishment.findMany({
        where: { tenantId, active: true },
        select: {
          id: true,
          name: true,
          city: true,
        },
      }),
    ]);

    // Calcul de la répartition RFM (Sidely)
    const segmentsCount: Record<CustomerSegment, number> = {
      VIP: 0,
      REGULAR: 0,
      NEW: 0,
      AT_RISK: 0,
      DORMANT: 0,
    };
    for (const c of customers) {
      const seg = computeCustomerSegment({
        totalVisits: c.totalVisits,
        totalSpend: c.totalSpend ? Number(c.totalSpend) : 0,
        lastVisitAt: c.lastVisitAt,
        createdAt: c.createdAt,
      });
      segmentsCount[seg.segment] = (segmentsCount[seg.segment] || 0) + 1;
    }

    // Statistiques par établissement
    const estStats = await Promise.all(
      estsWithStats.map(async (est) => {
        const [scans, points] = await Promise.all([
          db.loyaltyTransaction.count({
            where: { tenantId, establishmentId: est.id, kind: "EARN", createdAt: { gte: since } },
          }),
          db.loyaltyTransaction.aggregate({
            where: { tenantId, establishmentId: est.id, kind: "EARN", createdAt: { gte: since } },
            _sum: { delta: true },
          }),
        ]);
        return {
          id: est.id,
          name: est.name,
          city: est.city,
          scans,
          points: points._sum.delta ?? 0,
        };
      }),
    );

    return {
      periodDays: days,
      members,
      newMembers,
      pointsDistributed: earned._sum.delta ?? 0,
      pointsUsed: -(used._sum.delta ?? 0) - (reversedRedemptions._sum.delta ?? 0),
      rewardsRedeemed: redemptions,
      returningCustomers: Number(returning[0]?.count ?? 0),
      segments: segmentsCount,
      atRiskCount: segmentsCount.AT_RISK,
      establishments: estStats,
      daily: daily.map((d) => ({
        day: d.day.toISOString().slice(0, 10),
        visits: Number(d.visits),
        points: Number(d.points),
        enrollments: Number(d.enrollments),
      })),
    };
  }
}

