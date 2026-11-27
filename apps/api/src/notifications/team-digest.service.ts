import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { formatDay, formatMoney } from "../i18n/format";
import type { TeamSection } from "../i18n/email-layout";
import { hasBankDetails } from "../partners/partners.service";
import { TeamAlertService } from "./team-alert.service";

const DAY = 86_400_000;
/** Heure d'envoi (UTC) : 6 h, soit 7 h ou 8 h à Paris. */
export const DIGEST_HOUR_UTC = 6;

/**
 * Récapitulatif quotidien des actions à mener par l'équipe FOVE : virements à rapprocher,
 * accès provisoires, impayés, échéances, partenaires, messages. Un seul envoi par jour,
 * rien n'est envoyé quand il n'y a rien à faire.
 */
@Injectable()
export class TeamDigestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly team: TeamAlertService,
  ) {}

  /** Envoi du jour, à partir de 6 h UTC ; renvoie le nombre d'actions signalées (null : pas d'envoi). */
  async sendDaily(now = new Date()): Promise<number | null> {
    if (now.getUTCHours() < DIGEST_HOUR_UTC) return null;
    // Désactivé dans Admin > Système : rien n'est calculé ni noté, l'envoi reprend dès la réactivation.
    if (!(await this.team.isEnabled("digest"))) return null;
    const day = now.toISOString().slice(0, 10);
    if (await this.prisma.client.auditLog.count({ where: { action: "team.digest", metadata: { path: ["key"], equals: day } } })) return null;
    const sections = await this.sections(now);
    const total = sections.reduce((sum, s) => sum + s.rows.length, 0);
    await this.audit.log({ action: "team.digest", metadata: { key: day, total } });
    if (total === 0) return 0;
    await this.team.send({
      topic: "digest",
      subject: `${total} action${total > 1 ? "s" : ""} à suivre · ${formatDay(now, "fr")}`,
      heading: `Récapitulatif du ${formatDay(now, "fr")}`,
      intro: "Ce qui attend une action de l'équipe FOVE aujourd'hui.",
      sections: sections.filter((s) => s.rows.length > 0),
      button: { label: "Ouvrir l'administration", url: this.team.adminUrl("/") },
    });
    return total;
  }

  async sections(now: Date): Promise<TeamSection[]> {
    const db = this.prisma.client;
    const fr = (cents: number, currency: string) => formatMoney(cents, currency, "fr");
    const day = (d: Date | null) => (d ? formatDay(d, "fr") : "—");
    const tenantUrl = (id: string) => this.team.adminUrl(`/tenants/${id}`);

    const [transfers, provisional, pastDue, renewals, applications, payouts, waitingBank, messages] = await Promise.all([
      db.invoice.findMany({ where: { status: "OPEN", paymentReference: { not: null } }, include: { tenant: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 50 }),
      db.subscription.findMany({ where: { provider: "OFFLINE", status: { not: "CANCELED" }, provisionalUntil: { gt: now, lte: new Date(now.getTime() + 2 * DAY) } }, include: { tenant: { select: { name: true } } }, take: 50 }),
      db.subscription.findMany({ where: { provider: "STRIPE", status: "PAST_DUE" }, include: { tenant: { select: { name: true } }, plan: { select: { name: true } } }, take: 50 }),
      db.subscription.findMany({
        where: { provider: { in: ["OFFLINE", "MANUAL"] }, status: "ACTIVE", provisionalUntil: null, currentPeriodEnd: { gt: now, lte: new Date(now.getTime() + 30 * DAY) }, plan: { kind: { not: "FREE" } } },
        include: { tenant: { select: { name: true } }, plan: { select: { name: true, kind: true } } },
        orderBy: { currentPeriodEnd: "asc" },
        take: 50,
      }),
      db.partner.findMany({ where: { status: { in: ["PENDING", "UNDER_REVIEW"] } }, orderBy: { createdAt: "asc" }, take: 50 }),
      db.partnerPayout.findMany({ where: { status: "PENDING" }, include: { partner: { select: { name: true, code: true } } }, orderBy: { createdAt: "asc" }, take: 50 }),
      db.partner.findMany({ where: { status: { in: ["APPROVED", "ACTIVE"] }, commissions: { some: { status: "AVAILABLE", payoutId: null } } }, select: { name: true, code: true, payoutInfo: true }, take: 200 }),
      db.contactMessage.findMany({ where: { status: "NEW" }, orderBy: { createdAt: "asc" }, take: 50 }),
    ]);

    return [
      {
        title: "Virements à rapprocher",
        rows: transfers.map((i) => ({ text: `${i.paymentReference} · ${i.tenant.name} · ${fr(i.amountDueCents, i.currency)} · demandé le ${day(i.createdAt)}`, url: this.team.adminUrl(`/finance/offline?q=${i.paymentReference}`) })),
      },
      {
        title: "Accès provisoires qui se terminent sous 48 h",
        rows: provisional.map((s) => ({ text: `${s.tenant.name} · fin le ${day(s.provisionalUntil)}`, url: tenantUrl(s.tenantId) })),
      },
      {
        title: "Impayés par carte (délai de grâce)",
        rows: pastDue.map((s) => ({ text: `${s.tenant.name} · ${s.plan.name} · impayé depuis le ${day(s.pastDueSince)}`, url: tenantUrl(s.tenantId) })),
      },
      {
        title: "Échéances sous 30 jours (virement, espèces, contrats)",
        rows: renewals.map((s) => ({ text: `${s.tenant.name} · ${s.plan.name}${s.plan.kind === "CUSTOM" ? " (contrat)" : ""} · fin le ${day(s.currentPeriodEnd)}`, url: tenantUrl(s.tenantId) })),
      },
      {
        title: "Candidatures partenaires à examiner",
        rows: applications.map((p) => `${p.name}${p.company ? ` (${p.company})` : ""} · ${p.city ?? ""}${p.country ? `, ${p.country}` : ""} · reçue le ${day(p.createdAt)}`),
      },
      {
        title: "Versements partenaires à payer",
        rows: payouts.map((p) => `${p.reference ?? "—"} · ${p.partner.name} · ${fr(p.amountCents, p.currency)}`),
      },
      {
        title: "Partenaires sans coordonnées bancaires (commissions en attente)",
        rows: waitingBank.filter((p) => !hasBankDetails(p.payoutInfo)).map((p) => `${p.name} · ${p.code}`),
      },
      {
        title: "Messages de contact non traités",
        rows: messages.map((m) => `${m.name}${m.companyName ? ` (${m.companyName})` : ""} · ${m.subject ?? "Demande"} · reçu le ${day(m.createdAt)}`),
      },
    ];
  }
}
