import { HttpStatus, Injectable } from "@nestjs/common";
import { AppError, conflict, isUniqueViolation, notFound } from "../common/errors";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { CardsService } from "../cards/cards.service";

const TENANT_SELECT = { name: true, settings: { select: { logoUrl: true, primaryColor: true } } } as const;
const PROGRAM_SELECT = { name: true, mode: true, stampsTarget: true } as const;

function tenantView(t: { name: string; settings: { logoUrl: string | null; primaryColor: string | null } | null }) {
  return { name: t.name, logoUrl: t.settings?.logoUrl ?? null, primaryColor: t.settings?.primaryColor ?? "#1F4FFF" };
}

const confirmationRequired = () =>
  new AppError(HttpStatus.FORBIDDEN, "confirmation_required", "Confirmez votre email pour ouvrir « Mes cartes »");

/**
 * « Mes cartes » (sous-lot A3) : les cartes du compte client FOVE, chacune aux couleurs de son
 * commerce, et les fiches créées avec son email (caisse, import, boutique) à rattacher.
 * Réservé aux comptes confirmés : la proposition repose sur l'email vérifié, jamais sur le téléphone.
 */
@Injectable()
export class ClientCardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cards: CardsService,
    private readonly audit: AuditService,
  ) {}

  async list(accountId: string) {
    const account = await this.verifiedAccount(accountId);
    const db = this.prisma.client;

    const accounts = await db.loyaltyAccount.findMany({
      where: { customer: { clientAccountId: account.id }, status: { not: "CLOSED" }, tenant: { status: "ACTIVE" } },
      orderBy: [{ lastActivityAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, tenantId: true, balance: true, status: true, lastActivityAt: true, program: { select: PROGRAM_SELECT }, tenant: { select: TENANT_SELECT } },
    });
    const cards = await Promise.all(
      accounts.map(async (a) => ({
        id: a.id,
        tenant: tenantView(a.tenant),
        program: a.program,
        balance: a.balance,
        status: a.status,
        lastActivityAt: a.lastActivityAt,
        cardPath: new URL(await this.cards.linkFor(a.id, a.tenantId)).pathname,
      })),
    );

    return { cards, linkable: await this.linkable(account) };
  }

  /** Rattache au compte une fiche proposée (même email que le compte confirmé). */
  async accept(accountId: string, customerId: string) {
    const account = await this.verifiedAccount(accountId);
    const fiche = await this.proposable(account, customerId);
    const db = this.prisma.client;
    let linked;
    try {
      linked = await db.customer.updateMany({ where: { id: fiche.id, clientAccountId: null, anonymizedAt: null }, data: { clientAccountId: account.id } });
    } catch (error) {
      // Une seule fiche par commerce et par compte (rattachement concurrent) : le doublon reste au commerçant.
      if (isUniqueViolation(error)) throw conflict("already_linked", "Vous avez déjà une carte rattachée chez ce commerce");
      throw error;
    }
    if (linked.count !== 1) throw notFound("Carte");
    await db.customerIdentity.updateMany({ where: { customerId: fiche.id, kind: "EMAIL", value: account.email, verifiedAt: null }, data: { verifiedAt: new Date() } });
    await this.audit.log({ tenantId: fiche.tenantId, action: "client.customer_linked", targetType: "customer", targetId: fiche.id, metadata: { from: "my_cards" } });
  }

  /** « Ce n'est pas moi » : la fiche n'est plus proposée à ce compte. */
  async dismiss(accountId: string, customerId: string) {
    const account = await this.verifiedAccount(accountId);
    const fiche = await this.proposable(account, customerId);
    await this.prisma.client.clientDismissedCustomer.upsert({
      where: { clientAccountId_customerId: { clientAccountId: account.id, customerId: fiche.id } },
      create: { clientAccountId: account.id, customerId: fiche.id },
      update: {},
    });
    await this.audit.log({ tenantId: fiche.tenantId, action: "client.customer_dismissed", targetType: "customer", targetId: fiche.id });
  }

  private async verifiedAccount(accountId: string) {
    const account = await this.prisma.client.clientAccount.findUniqueOrThrow({ where: { id: accountId }, select: { id: true, email: true, emailVerifiedAt: true } });
    if (!account.emailVerifiedAt) throw confirmationRequired();
    return account;
  }

  /** Fiches avec une carte, portant l'email vérifié du compte, libres, jamais refusées, chez des commerces où le compte n'a pas déjà sa fiche. */
  private linkableWhere(account: { id: string; email: string }) {
    return {
      clientAccountId: null,
      anonymizedAt: null,
      tenant: { status: "ACTIVE" as const, customers: { none: { clientAccountId: account.id } } },
      identities: { some: { kind: "EMAIL" as const, value: account.email } },
      dismissedBy: { none: { clientAccountId: account.id } },
      // Seules les fiches avec une carte sont proposées ; une fiche sans carte est reprise au scan du QR.
      accounts: { some: { status: { not: "CLOSED" as const } } },
    };
  }

  private async linkable(account: { id: string; email: string }) {
    const fiches = await this.prisma.client.customer.findMany({
      where: this.linkableWhere(account),
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        firstName: true,
        tenant: { select: TENANT_SELECT },
        accounts: { where: { status: { not: "CLOSED" } }, select: { balance: true, program: { select: PROGRAM_SELECT } } },
      },
    });
    return fiches.map((f) => ({
      customerId: f.id,
      firstName: f.firstName,
      tenant: tenantView(f.tenant),
      cards: f.accounts.map((a) => ({ program: a.program, balance: a.balance })),
    }));
  }

  private async proposable(account: { id: string; email: string }, customerId: string) {
    const fiche = await this.prisma.client.customer.findFirst({ where: { id: customerId, ...this.linkableWhere(account) }, select: { id: true, tenantId: true } });
    // Même réponse qu'une fiche inexistante : on ne révèle rien de ce qui n'est pas proposable.
    if (!fiche) throw notFound("Carte");
    return fiche;
  }
}
