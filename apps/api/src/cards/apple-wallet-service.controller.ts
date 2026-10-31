import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { PrismaService } from "../common/prisma.service";
import { CardsService } from "./cards.service";
import { AppleWalletProvider } from "./apple-wallet";

const MEDIA_URL = /\/api\/media\/([0-9a-f-]{36})$/;

/**
 * Implémentation officielle du protocole PassKit Apple Wallet Web Service (v1).
 * Utilisé directement par iOS pour enregistrer l'iPhone, synchroniser les cartes
 * et recevoir les notifications push lors des changements de solde.
 */
@ApiTags("apple-wallet-service")
@Controller("loyalty/apple-wallet-service/v1")
export class AppleWalletServiceController {
  private readonly logger = new Logger("AppleWalletService");

  constructor(
    private readonly prisma: PrismaService,
    private readonly cards: CardsService,
    private readonly appleWallet: AppleWalletProvider,
  ) {}

  private extractToken(authHeader: string | undefined): string | null {
    if (!authHeader) return null;
    const match = authHeader.match(/^ApplePass\s+(.+)$/i);
    return match ? match[1]!.trim() : null;
  }

  /** Logs d'erreurs envoyés directement par iOS. */
  @Post("log")
  @HttpCode(HttpStatus.OK)
  log(@Body() body: unknown) {
    this.logger.warn("Log reçu d'Apple Wallet :", body);
    return {};
  }

  /** 1. Enregistrement d'un iPhone pour recevoir les notifications push. */
  @Post("devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber")
  async registerDevice(
    @Param("deviceLibraryIdentifier") deviceLibraryIdentifier: string,
    @Param("passTypeIdentifier") passTypeIdentifier: string,
    @Param("serialNumber") serialNumber: string,
    @Headers("authorization") authHeader: string | undefined,
    @Body() body: { pushToken?: string },
    @Res() res: Response,
  ) {
    const authToken = this.extractToken(authHeader);
    if (!authToken || !body.pushToken) {
      return res.status(HttpStatus.UNAUTHORIZED).send();
    }

    const account = await this.prisma.client.loyaltyAccount.findUnique({
      where: { id: serialNumber },
      select: { id: true, qrToken: true, tenantId: true },
    });

    if (!account || account.qrToken !== authToken) {
      return res.status(HttpStatus.UNAUTHORIZED).send();
    }

    const existing = await this.prisma.client.appleWalletRegistration.findUnique({
      where: {
        deviceLibraryIdentifier_serialNumber: {
          deviceLibraryIdentifier,
          serialNumber,
        },
      },
    });

    await this.prisma.client.appleWalletRegistration.upsert({
      where: {
        deviceLibraryIdentifier_serialNumber: {
          deviceLibraryIdentifier,
          serialNumber,
        },
      },
      create: {
        tenantId: account.tenantId,
        deviceLibraryIdentifier,
        passTypeIdentifier,
        serialNumber,
        pushToken: body.pushToken,
      },
      update: {
        tenantId: account.tenantId,
        pushToken: body.pushToken,
        passTypeIdentifier,
      },
    });

    return res.status(existing ? HttpStatus.OK : HttpStatus.CREATED).send();
  }

  /** 2. Liste des cartes mises à jour pour cet appareil. */
  @Get("devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier")
  async getUpdatedPasses(
    @Param("deviceLibraryIdentifier") deviceLibraryIdentifier: string,
    @Param("passTypeIdentifier") passTypeIdentifier: string,
    @Res() res: Response,
  ) {
    const registrations = await this.prisma.client.appleWalletRegistration.findMany({
      where: { deviceLibraryIdentifier, passTypeIdentifier },
      select: { serialNumber: true },
    });

    if (!registrations.length) {
      return res.status(HttpStatus.NO_CONTENT).send();
    }

    return res.status(HttpStatus.OK).json({
      lastUpdated: new Date().toISOString(),
      serialNumbers: registrations.map((r) => r.serialNumber),
    });
  }

  /** 3. Désenregistrement de l'appareil (suppression du pass). */
  @Delete("devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber")
  async unregisterDevice(
    @Param("deviceLibraryIdentifier") deviceLibraryIdentifier: string,
    @Param("serialNumber") serialNumber: string,
    @Headers("authorization") authHeader: string | undefined,
    @Res() res: Response,
  ) {
    const authToken = this.extractToken(authHeader);
    const account = await this.prisma.client.loyaltyAccount.findUnique({
      where: { id: serialNumber },
      select: { id: true, qrToken: true },
    });

    if (!account || account.qrToken !== authToken) {
      return res.status(HttpStatus.UNAUTHORIZED).send();
    }

    await this.prisma.client.appleWalletRegistration.deleteMany({
      where: { deviceLibraryIdentifier, serialNumber },
    });

    return res.status(HttpStatus.OK).send();
  }

  /** 4. Téléchargement de la dernière version du pass par iOS après push. */
  @Get("passes/:passTypeIdentifier/:serialNumber")
  async getLatestPass(
    @Param("serialNumber") serialNumber: string,
    @Headers("authorization") authHeader: string | undefined,
    @Res() res: Response,
  ) {
    const authToken = this.extractToken(authHeader);
    const account = await this.prisma.client.loyaltyAccount.findUnique({
      where: { id: serialNumber },
      include: {
        customer: { select: { firstName: true, lastName: true } },
        program: true,
        tenant: { include: { settings: true } },
      },
    });

    if (!account || account.qrToken !== authToken) {
      return res.status(HttpStatus.UNAUTHORIZED).send();
    }

    let logoBuffer: Buffer | null = null;
    if (account.tenant.settings?.logoUrl) {
      const match = MEDIA_URL.exec(account.tenant.settings.logoUrl);
      if (match?.[1]) {
        const asset = await this.prisma.client.mediaAsset.findFirst({
          where: { id: match[1], tenantId: account.tenantId },
        });
        if (asset?.data) logoBuffer = Buffer.from(asset.data);
      }
    }

    const passBuffer = await this.appleWallet.generatePass(
      {
        id: account.id,
        tenantId: account.tenantId,
        qrToken: account.qrToken,
        cardNumber: account.cardNumber,
        balance: account.balance,
        createdAt: account.createdAt,
        customer: account.customer,
        program: account.program,
        tenant: account.tenant,
      },
      logoBuffer,
    );

    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Last-Modified", account.lastActivityAt.toUTCString());
    res.setHeader("Cache-Control", "no-cache");
    return res.status(HttpStatus.OK).send(passBuffer);
  }
}

