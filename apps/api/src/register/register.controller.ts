import { Body, Controller, Delete, Get, HttpCode, Ip, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe";
import { forbidden } from "../common/errors";
import { Auth, RegisterAllowed, RequirePermission, Tenant } from "../common/decorators";
import type { AuthState, TenantContext } from "../common/context";
import { TenantRoute, UserRoute } from "../auth/guards";
import { RegisterService } from "./register.service";

const activateSchema = z.object({ name: z.string().trim().min(2).max(40), establishmentId: z.uuid().nullable().optional() });
const pinSchema = z.object({ pin: z.string().regex(/^\d{4}$/, "Le code caisse fait 4 chiffres") });
const unlockSchema = z.object({ membershipId: z.uuid(), pin: z.string().max(8) });
const settingsSchema = z.object({ lockMinutes: z.int().min(1).max(60) });

/** Mode caisse (docs/chantier-code-caisse.md). */
@ApiTags("app")
@Controller("app")
export class RegisterController {
  constructor(private readonly register: RegisterService) {}

  /** « Utiliser cet appareil comme caisse » (propriétaire ou gérant, sur l'appareil). */
  @Post("register/activate")
  @TenantRoute()
  @RequirePermission("establishments.read")
  activate(@Tenant() ctx: TenantContext, @Auth() auth: AuthState, @Body(new ZodPipe(activateSchema)) body: z.infer<typeof activateSchema>) {
    return this.register.activate(ctx, auth, body);
  }

  @Get("register")
  @UserRoute()
  @RegisterAllowed("locked")
  state(@Auth() auth: AuthState) {
    if (!auth.register) throw forbidden("Cet appareil n'est pas une caisse");
    return this.register.state(auth);
  }

  @Post("register/unlock")
  @UserRoute()
  @RegisterAllowed("locked")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  unlock(@Auth() auth: AuthState, @Body(new ZodPipe(unlockSchema)) body: z.infer<typeof unlockSchema>, @Ip() ip: string) {
    if (!auth.register) throw forbidden("Cet appareil n'est pas une caisse");
    return this.register.unlock(auth, body.membershipId, body.pin, ip);
  }

  @Post("register/lock")
  @UserRoute()
  @RegisterAllowed("locked")
  @HttpCode(204)
  async lock(@Auth() auth: AuthState) {
    if (auth.register) await this.register.lock(auth);
  }

  /** Mon code caisse, dans le commerce actif. */
  @Put("me/cashier-pin")
  @TenantRoute()
  @HttpCode(200)
  setPin(@Tenant() ctx: TenantContext, @Body(new ZodPipe(pinSchema)) body: z.infer<typeof pinSchema>) {
    return this.register.setOwnPin(ctx, body.pin);
  }

  @Delete("team/members/:id/cashier-pin")
  @TenantRoute()
  @RequirePermission("members.read")
  @HttpCode(204)
  async resetPin(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    await this.register.resetPin(ctx, id);
  }

  @Get("registers")
  @TenantRoute()
  @RequirePermission("members.read")
  list(@Tenant() ctx: TenantContext) {
    return this.register.list(ctx.tenantId);
  }

  @Delete("registers/:id")
  @TenantRoute()
  @RequirePermission("members.read")
  @HttpCode(204)
  async revoke(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    await this.register.revoke(ctx, id);
  }

  @Put("registers/settings")
  @TenantRoute()
  @RequirePermission("tenant.update")
  settings(@Tenant() ctx: TenantContext, @Body(new ZodPipe(settingsSchema)) body: z.infer<typeof settingsSchema>) {
    return this.register.setLockMinutes(ctx, body.lockMinutes);
  }
}
