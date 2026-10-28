import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import { loadConfig } from "../config";
import { ZodPipe } from "../common/zod.pipe";
import { badRequest, notFound } from "../common/errors";
import { PrismaService } from "../common/prisma.service";
import { RequirePermission, Tenant } from "../common/decorators";
import type { TenantContext } from "../common/context";
import { TenantRoute } from "../auth/guards";

const MAX_BYTES = 512 * 1024;
const uploadSchema = z.object({ dataBase64: z.string().min(10).max(Math.ceil((MAX_BYTES * 4) / 3) + 8) });

/** Type réel déterminé par la signature binaire, jamais par ce qu'annonce le client. SVG refusé (scripts). */
function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

@ApiTags("media")
@Controller()
export class MediaController {
  constructor(private readonly prisma: PrismaService) {}

  @Post("app/media")
  @TenantRoute()
  @RequirePermission("tenant.update")
  async upload(@Tenant() ctx: TenantContext, @Body(new ZodPipe(uploadSchema)) body: z.infer<typeof uploadSchema>) {
    const data = Buffer.from(body.dataBase64, "base64");
    if (data.length > MAX_BYTES) throw badRequest("too_large", "Image trop lourde (512 Ko maximum)");
    const contentType = sniff(data);
    if (!contentType) throw badRequest("invalid_image", "Format accepté : PNG, JPEG ou WebP");
    const asset = await this.prisma.client.mediaAsset.create({ data: { tenantId: ctx.tenantId, contentType, size: data.length, data } });
    return { id: asset.id, url: `${loadConfig().APP_URL}/api/media/${asset.id}` };
  }

  @Get("media/:id")
  async serve(@Param("id", ParseUUIDPipe) id: string, @Res() res: Response) {
    const asset = await this.prisma.client.mediaAsset.findUnique({ where: { id } });
    if (!asset?.data) throw notFound("Image");
    res.setHeader("Content-Type", asset.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Security-Policy", "default-src 'none'");
    res.send(Buffer.from(asset.data));
  }
}
