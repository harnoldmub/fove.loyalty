import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, PrismaClient } from "@fove/database";
import { loadConfig } from "../config";

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient = createPrismaClient(loadConfig().DATABASE_URL);

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
