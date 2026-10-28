import { type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";
import { badRequest } from "./errors";

export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value ?? {});
    if (!parsed.success) {
      throw badRequest(
        "validation_failed",
        "Données invalides",
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }
    return parsed.data;
  }
}
