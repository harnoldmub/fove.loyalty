import { Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { loadConfig } from "../config";
import { randomToken, sha256 } from "../common/crypto";
import { PrismaService } from "../common/prisma.service";
import type { AuthState } from "../common/context";

/** Session glissante : 90 jours après la dernière utilisation (docs/chantier-connexion-otp.md). */
const SESSION_DAYS = 90;
/** Le cookie vit plus longtemps (maximum des navigateurs) : c'est l'échéance en base qui fait foi. */
const COOKIE_DAYS = 400;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function sessionCookieName(): string {
  // __Host- : cookie lié à l'hôte, HTTPS obligatoire, aucun domaine partagé.
  return loadConfig().isProd ? "__Host-fove_session" : "fove_session";
}

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, req: Request, res: Response, activeTenantId: string | null = null): Promise<void> {
    const token = randomToken("", 32);
    await this.prisma.client.session.create({
      data: {
        tokenHash: sha256(token),
        userId,
        activeTenantId,
        ip: req.ip ?? null,
        userAgent: req.headers["user-agent"]?.slice(0, 300) ?? null,
        expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
      },
    });
    res.cookie(sessionCookieName(), token, {
      httpOnly: true,
      secure: loadConfig().isProd,
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_DAYS * 86_400_000,
    });
  }

  clearCookie(res: Response): void {
    res.clearCookie(sessionCookieName(), { path: "/", httpOnly: true, secure: loadConfig().isProd, sameSite: "lax" });
  }

  async resolve(token: string | undefined): Promise<AuthState | null> {
    if (!token || token.length > 100) return null;
    const session = await this.prisma.client.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { select: { id: true, email: true, name: true, emailVerifiedAt: true, isSuperAdmin: true, isPartner: true, adminRole: true, totpEnabledAt: true } } },
    });
    if (!session || session.expiresAt < new Date()) return null;
    if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      // Chaque utilisation repousse l'échéance : on ne retape presque jamais de code sur son appareil.
      await this.prisma.client.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) } });
    }
    return {
      sessionId: session.id,
      user: session.user,
      activeTenantId: session.activeTenantId,
      supportGrantId: session.supportGrantId,
      mfaVerifiedAt: session.mfaVerifiedAt,
    };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.client.session.deleteMany({ where: { id: sessionId } });
  }

  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.client.session.deleteMany({ where: { userId, id: exceptSessionId ? { not: exceptSessionId } : undefined } });
  }
}
