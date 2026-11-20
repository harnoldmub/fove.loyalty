import { Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { loadConfig } from "../config";
import { randomToken, sha256 } from "../common/crypto";
import { PrismaService } from "../common/prisma.service";

/** 180 jours glissants : la session est prolongée à chaque passage. */
export const CLIENT_SESSION_DAYS = 180;
const SESSION_MS = CLIENT_SESSION_DAYS * 86_400_000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function clientSessionCookieName(): string {
  // Cookie distinct de celui des commerçants : un commerçant peut aussi être client FOVE sans mélange.
  return loadConfig().isProd ? "__Host-fove_client" : "fove_client";
}

export interface ClientAccountView {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  locale: string | null;
}

export interface ClientAuthState {
  sessionId: string;
  account: ClientAccountView;
}

const ACCOUNT_SELECT = { id: true, email: true, emailVerifiedAt: true, firstName: true, lastName: true, phone: true, locale: true } as const;

@Injectable()
export class ClientSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(clientAccountId: string, req: Request, res: Response): Promise<void> {
    const token = randomToken("", 32);
    await this.prisma.client.clientSession.create({
      data: {
        tokenHash: sha256(token),
        clientAccountId,
        ip: req.ip ?? null,
        userAgent: req.headers["user-agent"]?.slice(0, 300) ?? null,
        expiresAt: new Date(Date.now() + SESSION_MS),
      },
    });
    this.setCookie(res, token);
  }

  /** Résout la session et la prolonge (base et cookie) au plus toutes les 5 minutes. */
  async resolve(req: Request, res: Response): Promise<ClientAuthState | null> {
    const token = req.cookies?.[clientSessionCookieName()];
    if (typeof token !== "string" || !token || token.length > 100) return null;
    const session = await this.prisma.client.clientSession.findUnique({
      where: { tokenHash: sha256(token) },
      include: { clientAccount: { select: ACCOUNT_SELECT } },
    });
    if (!session || session.expiresAt < new Date()) return null;
    if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.client.clientSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_MS) },
      });
      this.setCookie(res, token);
    }
    return { sessionId: session.id, account: session.clientAccount };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.client.clientSession.deleteMany({ where: { id: sessionId } });
  }

  async revokeAll(clientAccountId: string): Promise<void> {
    await this.prisma.client.clientSession.deleteMany({ where: { clientAccountId } });
  }

  clearCookie(res: Response): void {
    res.clearCookie(clientSessionCookieName(), { path: "/", httpOnly: true, secure: loadConfig().isProd, sameSite: "lax" });
  }

  private setCookie(res: Response, token: string): void {
    res.cookie(clientSessionCookieName(), token, {
      httpOnly: true,
      secure: loadConfig().isProd,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MS,
    });
  }
}
