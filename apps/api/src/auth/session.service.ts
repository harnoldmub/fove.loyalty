import { Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { loadConfig } from "../config";
import { randomToken, sha256 } from "../common/crypto";
import { PrismaService } from "../common/prisma.service";
import type { AuthState } from "../common/context";

const SESSION_DAYS = 30;
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
      maxAge: SESSION_DAYS * 86_400_000,
    });
  }

  clearCookie(res: Response): void {
    res.clearCookie(sessionCookieName(), { path: "/", httpOnly: true, secure: loadConfig().isProd, sameSite: "lax" });
  }

  async resolve(token: string | undefined): Promise<AuthState | null> {
    if (!token || token.length > 100) return null;
    const session = await this.prisma.client.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { select: { id: true, email: true, name: true, emailVerifiedAt: true, isSuperAdmin: true } } },
    });
    if (!session || session.expiresAt < new Date()) return null;
    if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.client.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    }
    return {
      sessionId: session.id,
      user: session.user,
      activeTenantId: session.activeTenantId,
      supportGrantId: session.supportGrantId,
    };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.client.session.deleteMany({ where: { id: sessionId } });
  }

  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.client.session.deleteMany({ where: { userId, id: exceptSessionId ? { not: exceptSessionId } : undefined } });
  }
}
