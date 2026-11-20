"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { CitySelect, CountrySelect, detectClientCountry, getCountryOption } from "@/components/ui/country-select";
import { PhoneInput } from "@/components/ui/phone-input";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";

const PARTNER_TYPES = [
  "AGENCY",
  "DEVELOPER",
  "SALES_FREELANCE",
  "CONSULTANT",
  "ENTREPRENEUR",
  "MERCHANT_NETWORK",
  "OTHER",
] as const;

const NETWORK_SIZES = [
  { value: "1-10", key: "small" },
  { value: "11-50", key: "medium" },
  { value: "51-200", key: "large" },
  { value: "200+", key: "xlarge" },
] as const;

export default function RejoindrePartenairePage() {
  const t = useTranslations("partner.join");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{
    code: string;
    partnerId: string;
    status: string;
  } | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [countryCode, setCountryCode] = useState("CD");
  const [city, setCity] = useState("Kinshasa");
  const [partnerType, setPartnerType] = useState("SALES_FREELANCE");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [promotionStrategy, setPromotionStrategy] = useState("");
  const [networkSizeEstimate, setNetworkSizeEstimate] = useState("11-50");
  const [acceptTerms, setAcceptTerms] = useState(false);

  // Détection automatique de la région du client (fuseau horaire + locale)
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const detected = detectClientCountry();
      setCountryCode(detected);
      const opt = getCountryOption(detected);
      if (opt?.defaultCity) {
        setCity(opt.defaultCity);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!acceptTerms) {
      setError(t("errors.terms"));
      return;
    }

    if (!city.trim()) {
      setError(t("errors.city"));
      return;
    }

    setLoading(true);
    try {
      const selectedCountryLabel = getCountryOption(countryCode)?.label ?? countryCode;

      const res = await api.post<{ success: boolean; partnerId: string; code: string; status: string }>(
        "/partners/apply",
        {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          company: company.trim() || undefined,
          country: selectedCountryLabel,
          city: city.trim(),
          partnerType,
          websiteUrl: websiteUrl.trim() || undefined,
          promotionStrategy: promotionStrategy.trim(),
          networkSizeEstimate: networkSizeEstimate.trim() || undefined,
          acceptTerms: true,
        }
      );

      setSubmitted({
        code: res.code,
        partnerId: res.partnerId,
        status: res.status,
      });
    } catch (err: any) {
      setError(err?.message || t("errors.generic"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="mb-6">
        <Link
          href="/partenaires"
          className="inline-flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink transition-colors"
        >
          <ArrowLeft className="size-3.5 rtl-flip" />
          {t("back")}
        </Link>
      </div>

      {submitted ? (
        <div className="rounded-2xl border border-line bg-surface p-8 sm:p-12 text-center shadow-lg">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-6">
            <CheckCircle2 className="size-8" />
          </div>

          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink mb-3">
            {t("success.title")}
          </h1>

          <p className="text-sm text-ink-2 max-w-lg mx-auto mb-8 leading-relaxed">
            {t.rich("success.body", { name, email, strong: (chunks) => <strong>{chunks}</strong> })}
          </p>

          <div className="rounded-xl border border-line bg-surface-2 p-5 max-w-md mx-auto text-start text-xs space-y-2 mb-8">
            <div className="flex justify-between items-center">
              <span className="text-ink-3">{t("success.code")}</span>
              <span className="font-mono font-bold text-ink text-sm bg-surface px-2 py-0.5 rounded border border-line">
                {submitted.code}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-ink-3">{t("success.status")}</span>
              <span className="font-medium text-amber-500">{t("success.statusValue")}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-ink-3">{t("success.commission")}</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{t("success.commissionValue")}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild variant="secondary" className="w-full sm:w-auto">
              <Link href="/">{t("success.home")}</Link>
            </Button>
            <Button asChild className="w-full sm:w-auto">
              <Link href="/login">{t("success.login")}</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-surface p-6 sm:p-10 shadow-md">
          <div className="mb-8">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#C7FF3D]/20 px-3 py-1 text-xs font-semibold text-black dark:text-[#C7FF3D] mb-3">
              <Sparkles className="size-3.5" /> {t("badge")}
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink mb-2">
              {t("title")}
            </h1>
            <p className="text-xs sm:text-sm text-ink-2 leading-relaxed">
              {t("subtitle")}
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-lg bg-rose-500/10 border border-rose-500/20 p-3.5 text-xs font-medium text-rose-500">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Prénom & Nom */}
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">{t("fields.name")}</label>
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Email & Téléphone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">{t("fields.email")}</label>
                <Input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">{t("fields.phone")}</label>
                <PhoneInput
                  required
                  value={phone}
                  onChange={setPhone}
                  defaultCountry={countryCode}
                />
              </div>
            </div>

            {/* Entreprise & Type de profil */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">
                  {t("fields.company")}
                </label>
                <Input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">{t("fields.profile")}</label>
                <select
                  value={partnerType}
                  onChange={(e) => setPartnerType(e.target.value)}
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:border-cobalt"
                >
                  {PARTNER_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`types.${type}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Pays (select avec drapeau) & Ville (API) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">{t("fields.country")}</label>
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
                <label className="block text-xs font-medium text-ink-2 mb-1">{t("fields.city")}</label>
                <CitySelect
                  countryCode={countryCode}
                  value={city}
                  onChange={setCity}
                />
              </div>
            </div>

            {/* Site web ou réseau social */}
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">
                {t("fields.website")}
              </label>
              <Input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
              />
            </div>

            {/* Stratégie de recommandation */}
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">
                {t("fields.strategy")}
              </label>
              <textarea
                required
                rows={3}
                className="w-full rounded-md border border-line bg-surface p-3 text-sm text-ink focus-visible:outline-none focus-visible:border-cobalt"
                value={promotionStrategy}
                onChange={(e) => setPromotionStrategy(e.target.value)}
              />
            </div>

            {/* Réseau estimé */}
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">
                {t("fields.network")}
              </label>
              <select
                value={networkSizeEstimate}
                onChange={(e) => setNetworkSizeEstimate(e.target.value)}
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:border-cobalt"
              >
                {NETWORK_SIZES.map((size) => (
                  <option key={size.value} value={size.value}>
                    {t(`network.${size.key}`)}
                  </option>
                ))}
              </select>
            </div>

            {/* Consentement & CGU */}
            <div className="rounded-xl border border-line bg-surface-2 p-4 space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  required
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="mt-0.5 rounded border-line"
                />
                <span className="text-xs text-ink-2 leading-relaxed">
                  {t.rich("terms", {
                    link: (chunks) => (
                      <Link href="/cgu" className="underline text-ink">
                        {chunks}
                      </Link>
                    ),
                  })}
                </span>
              </label>
            </div>

            <Button type="submit" size="lg" className="w-full font-semibold" disabled={loading}>
              {loading ? t("submitting") : t("submit")}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
