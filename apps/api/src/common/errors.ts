import { HttpException, HttpStatus } from "@nestjs/common";

/** Erreur métier : code stable lisible par le front et les intégrations. */
export class AppError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super({ error: { code, message, details } }, status);
  }
}

export const notFound = (what = "Ressource") => new AppError(HttpStatus.NOT_FOUND, "not_found", `${what} introuvable`);
export const forbidden = (message = "Action non autorisée") => new AppError(HttpStatus.FORBIDDEN, "forbidden", message);
export const unauthorized = (message = "Authentification requise") =>
  new AppError(HttpStatus.UNAUTHORIZED, "unauthorized", message);
export const conflict = (code: string, message: string) => new AppError(HttpStatus.CONFLICT, code, message);
export const unprocessable = (code: string, message: string, details?: unknown) =>
  new AppError(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details);
export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(HttpStatus.BAD_REQUEST, code, message, details);
export const paymentRequired = (code: string, message: string) => new AppError(HttpStatus.PAYMENT_REQUIRED, code, message);

/** Violation de contrainte d'unicité Prisma. */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}
