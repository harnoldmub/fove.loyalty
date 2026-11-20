"use client";

import { useEffect, useState } from "react";
import { X, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { CitySelect, CountrySelect, detectClientCountry, getCountryOption } from "@/components/ui/country-select";
import { PhoneInput } from "@/components/ui/phone-input";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";

interface PartnerLeadModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function PartnerLeadModal({ open, onClose, onCreated }: PartnerLeadModalProps) {
  const t = useTranslations("partner.leadModal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("CD");
  const [city, setCity] = useState("Kinshasa");
  const [sector, setSector] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const detected = detectClientCountry();
      setCountryCode(detected);
      const opt = getCountryOption(detected);
      if (opt?.defaultCity) {
        setCity(opt.defaultCity);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const countryLabel = getCountryOption(countryCode)?.label ?? countryCode;

      await api.post("/partner/leads", {
        businessName: businessName.trim(),
        contactName: contactName.trim() || undefined,
        email: email.trim().toLowerCase() || undefined,
        phone: phone.trim() || undefined,
        city: city.trim() || undefined,
        country: countryLabel,
        sector: sector.trim() || undefined,
        notes: notes.trim() || undefined,
        status: "NEW",
      });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err?.message || t("error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-cobalt/10 text-cobalt">
              <UserPlus className="size-4" />
            </span>
            <div>
              <h2 className="font-display text-base font-semibold text-ink">{t("title")}</h2>
              <p className="text-xs text-ink-3">{t("subtitle")}</p>
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
          <div className="mt-4 rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs font-medium text-rose-500">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">{t("businessName")}</label>
              <Input
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">{t("contact")}</label>
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">{t("email")}</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">{t("phone")}</label>
              <PhoneInput
                value={phone}
                onChange={setPhone}
                defaultCountry={countryCode}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">{t("country")}</label>
              <CountrySelect
                value={countryCode}
                onChange={(code) => {
                  setCountryCode(code);
                  const opt = getCountryOption(code);
                  if (opt?.defaultCity) {
                    setCity(opt.defaultCity);
                  }
                }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">{t("city")}</label>
              <CitySelect
                countryCode={countryCode}
                value={city}
                onChange={setCity}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-2">{t("sector")}</label>
            <Input
              value={sector}
              onChange={(e) => setSector(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-2">{t("notes")}</label>
            <textarea
              rows={3}
              className="w-full rounded-md border border-line bg-surface p-2.5 text-xs text-ink focus-visible:outline-none focus-visible:border-cobalt"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? t("submitting") : t("submit")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
