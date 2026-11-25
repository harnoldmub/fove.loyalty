import { describe, expect, it } from "vitest";
import { findPaymentReferences, generatePaymentReference, normalizePaymentReference } from "./payment-reference";

const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe("références de paiement", () => {
  it("génère une référence avec une clé de contrôle", () => {
    const ref = generatePaymentReference("invoice", seq([8, 30, 2, 1, 9, 0]));
    expect(ref).toMatch(/^FV-[A-Z2-9]{6}-[A-Z2-9]$/);
    expect(normalizePaymentReference(ref)).toEqual({ reference: ref, kind: "invoice" });
    const statement = generatePaymentReference("statement", seq([3]));
    expect(statement.startsWith("FV-RL-")).toBe(true);
  });

  it("accepte une saisie approximative et refuse une faute de frappe", () => {
    const ref = generatePaymentReference("invoice", seq([4, 7, 12, 20, 25, 3]));
    const body = ref.slice(3, 9);
    expect(normalizePaymentReference(`fv ${body.toLowerCase()} ${ref.at(-1)}`)?.reference).toBe(ref);
    const typo = body[0] === "A" ? `B${body.slice(1)}` : `A${body.slice(1)}`;
    expect(normalizePaymentReference(`FV-${typo}-${ref.at(-1)}`)).toBeNull();
    const swapped = body[1] + body[0] + body.slice(2);
    if (swapped !== body) expect(normalizePaymentReference(`FV-${swapped}-${ref.at(-1)}`)).toBeNull();
  });

  it("retrouve les références dans un libellé bancaire", () => {
    const invoice = generatePaymentReference("invoice", seq([1, 2, 3, 4, 5, 6]));
    const statement = generatePaymentReference("statement", seq([9, 8, 7, 6, 5, 4]));
    const label = `VIR SEPA BOUTIQUE AMAL ${invoice.replace(/-/g, " ").toLowerCase()} / ${statement.replace(/-/g, "")}`;
    expect(findPaymentReferences(label).map((r) => r.reference).sort()).toEqual([invoice, statement].sort());
    expect(findPaymentReferences("VIREMENT FV 123")).toEqual([]);
  });
});
