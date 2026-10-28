import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import type { NextFunction, Response } from "express";
import { loadConfig } from "./config";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { PrismaService } from "./common/prisma.service";
import type { AppRequest } from "./common/context";

export async function createApp(): Promise<NestExpressApplication> {
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: config.NODE_ENV === "test" ? ["error"] : ["log", "warn", "error"],
  });
  app.set("trust proxy", config.TRUST_PROXY);
  app.disable("x-powered-by");
  app.setGlobalPrefix("api");
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cookieParser());
  app.useBodyParser("json", { limit: "2mb" });

  app.use((req: AppRequest, res: Response, next: NextFunction) => {
    req.requestId = (req.headers["x-request-id"] as string | undefined)?.slice(0, 64) ?? randomUUID();
    res.setHeader("X-Request-Id", req.requestId);

    // CORS : le widget est appelé depuis les sites des commerçants (sans cookie,
    // domaines vérifiés par la clé publique) ; le reste uniquement depuis l'app.
    const origin = req.headers.origin;
    if (origin) {
      if (req.path.startsWith("/api/widget/")) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Fove-Key");
        res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      } else if (config.corsOrigins.includes(origin) && !req.path.startsWith("/api/v1/")) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Fove-Csrf");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
      }
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.useGlobalFilters(new HttpExceptionFilter(app.get(PrismaService)));
  app.enableShutdownHooks();

  const doc = new DocumentBuilder()
    .setTitle("FOVE API")
    .setDescription("API de fidélisation FOVE. API publique : préfixe /api/v1, authentification par clé secrète.")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, doc), { jsonDocumentUrl: "api/openapi.json" });
  return app;
}
