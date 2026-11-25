/**
 * Lecture d'un relevé bancaire exporté en CSV (docs/chantier-encaissement-hors-ligne.md, 5).
 * Tolérant aux formats courants des banques : séparateur « ; », « , » ou tabulation,
 * dates JJ/MM/AAAA ou AAAA-MM-JJ, montants « 1 234,56 » ou « 1234.56 », une colonne
 * montant signée ou deux colonnes crédit / débit, monnaie facultative.
 */

export interface BankCsvRow {
  entryDate: Date;
  label: string;
  amountCents: number;
  currency: string | null;
}

export interface BankCsvResult {
  rows: BankCsvRow[];
  /** Lignes ignorées (numéro de ligne dans le fichier, 1 = première ligne). */
  skipped: number[];
}

const HEADERS = {
  date: ["date", "date operation", "date opération", "date valeur", "booking date", "value date", "fecha", "تاريخ"],
  label: ["libelle", "libellé", "label", "description", "motif", "intitule", "intitulé", "details", "détails", "reference", "référence", "concepto", "البيان"],
  amount: ["montant", "amount", "importe", "المبلغ"],
  credit: ["credit", "crédit", "entree", "entrée", "haber"],
  debit: ["debit", "débit", "sortie", "debe"],
  currency: ["devise", "monnaie", "currency", "moneda", "العملة"],
};

const norm = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");

function splitLine(line: string, separator: string): string[] {
  const out: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]!;
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (c === separator && !quoted) {
      out.push(cell);
      cell = "";
    } else cell += c;
  }
  out.push(cell);
  return out.map((v) => v.trim());
}

export function parseAmount(raw: string): number | null {
  let v = raw.replace(/[\s  ']/g, "").replace(/[^\d,.\-+()]/g, "");
  if (!v) return null;
  const negative = v.startsWith("-") || (v.startsWith("(") && v.endsWith(")"));
  v = v.replace(/[-+()]/g, "");
  const lastComma = v.lastIndexOf(",");
  const lastDot = v.lastIndexOf(".");
  // Le dernier séparateur suivi de 1 ou 2 chiffres est le séparateur décimal.
  const decimalAt = Math.max(lastComma, lastDot);
  let integer = v;
  let decimals = "";
  if (decimalAt !== -1 && v.length - decimalAt - 1 <= 2) {
    integer = v.slice(0, decimalAt);
    decimals = v.slice(decimalAt + 1);
  }
  integer = integer.replace(/[.,]/g, "");
  if (!/^\d+$/.test(integer || "0") || !/^\d{0,2}$/.test(decimals)) return null;
  const cents = Number(integer || "0") * 100 + Number(decimals.padEnd(2, "0") || "0");
  return negative ? -cents : cents;
}

export function parseDate(raw: string): Date | null {
  const v = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(v);
  if (m) {
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const date = new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1])));
    return Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(m[1]) ? null : date;
  }
  return null;
}

export function parseBankCsv(text: string): BankCsvResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const headerIndex = lines.findIndex((l) => l.trim() !== "");
  if (headerIndex === -1) return { rows: [], skipped: [] };
  const header = lines[headerIndex]!;
  const separator = [";", "\t", ","].map((s) => [s, header.split(s).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const columns = splitLine(header, separator).map(norm);
  const find = (names: string[]) => columns.findIndex((c) => names.some((n) => c === norm(n) || c.startsWith(`${norm(n)} `)));
  const col = { date: find(HEADERS.date), label: find(HEADERS.label), amount: find(HEADERS.amount), credit: find(HEADERS.credit), debit: find(HEADERS.debit), currency: find(HEADERS.currency) };
  if (col.date === -1 || col.label === -1 || (col.amount === -1 && col.credit === -1)) {
    throw new Error("Colonnes attendues : date, libellé, et montant (ou crédit / débit).");
  }

  const rows: BankCsvRow[] = [];
  const skipped: number[] = [];
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const cells = splitLine(line, separator);
    const entryDate = parseDate(cells[col.date] ?? "");
    const label = (cells[col.label] ?? "").slice(0, 500);
    let amountCents: number | null;
    if (col.amount !== -1 && (cells[col.amount] ?? "").trim() !== "") amountCents = parseAmount(cells[col.amount]!);
    else {
      const credit = col.credit !== -1 ? parseAmount(cells[col.credit] ?? "") : null;
      const debit = col.debit !== -1 ? parseAmount(cells[col.debit] ?? "") : null;
      amountCents = credit ? Math.abs(credit) : debit ? -Math.abs(debit) : null;
    }
    const currency = col.currency !== -1 ? (cells[col.currency] ?? "").trim().toUpperCase() || null : null;
    if (!entryDate || !label || amountCents === null || amountCents === 0) {
      skipped.push(i + 1);
      continue;
    }
    rows.push({ entryDate, label, amountCents, currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null });
  }
  return { rows, skipped };
}
