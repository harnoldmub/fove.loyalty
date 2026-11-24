import { createParamDecorator, Injectable, UseGuards, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { Request, Response } from "express";
import { forbidden, unauthorized } from "../common/errors";
import { ClientSessionService, type ClientAuthState } from "./client-session.service";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type ClientRequest = Request & { client?: ClientAuthState };

/** Session du compte client FOVE. Même protection CSRF que l'espace commerçant. */
@Injectable()
export class ClientSessionGuard implements CanActivate {
  constructor(private readonly sessions: ClientSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<ClientRequest>();
    if (MUTATING.has(req.method) && req.headers["x-fove-csrf"] !== "1") throw forbidden("En-tête anti-CSRF manquant");
    const state = await this.sessions.resolve(req, http.getResponse<Response>());
    if (!state) throw unauthorized();
    req.client = state;
    return true;
  }
}

export const ClientRoute = () => UseGuards(ClientSessionGuard);

export const Client = createParamDecorator((_: unknown, ctx: ExecutionContext): ClientAuthState => {
  const state = ctx.switchToHttp().getRequest<ClientRequest>().client;
  if (!state) throw unauthorized();
  return state;
});
