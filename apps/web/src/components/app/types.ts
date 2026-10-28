export type Mode = "POINTS" | "STAMPS";

export interface CustomerRow {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  externalRef: string | null;
  createdAt: string;
  anonymizedAt: string | null;
  accounts: { id: string; programId: string; balance: number; cardNumber: string; status: string }[];
}

export interface Program {
  id: string;
  name: string;
  mode: Mode;
  currency: string;
  spendStep: string;
  pointsPerStep: number;
  stampsPerPurchase: number;
  stampsTarget: number;
  minPurchaseAmount: string | null;
  maxPerTransaction: number | null;
  inactivityExpiryDays: number | null;
  enrollmentVerification: "NONE" | "EMAIL_OTP" | "IN_STORE";
  terms: string;
  active: boolean;
  _count?: { accounts: number; rewards: number };
}

export interface Transaction {
  id: string;
  kind: string;
  delta: number;
  balanceAfter: number;
  amount: string | null;
  currency: string | null;
  saleReference: string | null;
  reason: string | null;
  source: string;
  createdAt: string;
  reversesId: string | null;
  account?: { cardNumber: string; customer: { id: string; firstName: string; lastName: string }; program: { name: string; mode: Mode } };
}

export interface Account {
  id: string;
  cardNumber: string;
  qrToken: string;
  status: "ACTIVE" | "BLOCKED" | "PENDING_VERIFICATION" | "CLOSED";
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  createdAt: string;
  customer: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null; anonymizedAt: string | null };
  program: Program;
  transactions: Transaction[];
  rewards: { id: string; name: string; description: string; cost: number; stock: number | null; affordable: boolean }[];
}

export interface Establishment {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  active: boolean;
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}
