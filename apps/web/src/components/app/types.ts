import type { CustomerSegmentResult } from "@fove/shared";

export type Mode = "POINTS" | "STAMPS";

export interface CustomerNote {
  id: string;
  authorName: string;
  authorId?: string | null;
  content: string;
  createdAt: string;
}

export interface CustomerRow {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  externalRef: string | null;
  tags?: string[];
  notes?: string | null;
  totalVisits?: number;
  totalSpend?: string | number;
  lastVisitAt?: string | null;
  segment?: CustomerSegmentResult;
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
  oneVisitPerDay: boolean;
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
  cardUrl?: string | null;
  status: "ACTIVE" | "BLOCKED" | "PENDING_VERIFICATION" | "CLOSED";
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  createdAt: string;
  segment?: CustomerSegmentResult;
  recentNotes?: CustomerNote[];
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    anonymizedAt: string | null;
    tags?: string[];
    notes?: string | null;
    totalVisits?: number;
    totalSpend?: string | number;
    lastVisitAt?: string | null;
  };
  program: Program;
  transactions: Transaction[];
  rewards: { kind: "GIFT" | "PERCENTAGE" | "FIXED"; value: string | null; id: string; name: string; description: string; cost: number; stock: number | null; affordable: boolean }[];
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
