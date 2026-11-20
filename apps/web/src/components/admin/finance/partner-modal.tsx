"use client";

import { useState } from "react";
import { X, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useTranslations } from "next-intl";
import { api, useErrorMessage } from "@/lib/api";

interface PartnerModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function PartnerModal({ open, onClose, onCreated }: PartnerModalProps) {
  const t = useTranslations("admin.finance.partnerModal");
  const errMsg = useErrorMessage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [rateStr, setRateStr] = useState("20");

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const rateFloat = Number.parseFloat(rateStr);
    if (Number.isNaN(rateFloat) || rateFloat < 0 || rateFloat > 100) {
      setError(t("invalidRate"));
      return;
    }

    setLoading(true);
    try {
      await api.post("/admin/finance/partners", {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        code: code.trim().toUpperCase(),
        phone: phone.trim() || undefined,
        company: company.trim() || undefined,
        commissionRatePercent: rateFloat,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl border border-line bg-surface p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-cobalt/10 text-cobalt">
              <WalletCards className="size-4" />
            </span>
            <div>
              <h2 className="font-display text-base font-semibold text-ink">{t("title")}</h2>
              <p className="text-xs text-ink-3">{t("description")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-rose-500/10 p-3 text-xs font-medium text-rose-500">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">{t("name")}</label>
              <Input
                required
                placeholder={t("namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">{t("email")}</label>
              <Input
                required
                type="email"
                placeholder={t("emailPlaceholder")}
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">{t("code")}</label>
              <Input
                required
                placeholder={t("codePlaceholder")}
                dir="ltr"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">{t("rate")}</label>
              <Input
                required
                type="number"
                min="0"
                max="100"
                step="0.5"
                placeholder="20"
                value={rateStr}
                onChange={(e) => setRateStr(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">{t("company")}</label>
              <Input
                placeholder={t("companyPlaceholder")}
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">{t("phone")}</label>
              <Input
                placeholder="+243 / +33 ..."
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

