"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/misc";
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
      // Candidature pré-remplie depuis la page Parrainage d'un commerçant FOVE.
      const params = new URLSearchParams(window.location.search);
      const prefill = (key: string, max: number) => params.get(key)?.trim().slice(0, max) ?? "";
      if (prefill("name", 100)) setName(prefill("name", 100));
      if (prefill("email", 254)) setEmail(prefill("email", 254));
      if (prefill("company", 100)) setCompany(prefill("company", 100));
      if (prefill("strategy", 2000)) setPromotionStrategy(prefill("strategy", 2000));
      if (params.get("source") === "referral") setPartnerType("MERCHANT_NETWORK");
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
          className="inline-flex min-h-6 items-center gap-1.5 text-sm text-ink-2 hover:text-ink transition-colors"
        >
          <ArrowLeft className="size-3.5 rtl-flip" aria-hidden />
          {t("back")}
        </Link>
      </div>

      {submitted ? (
        <div className="rounded-2xl border border-line bg-surface p-8 sm:p-12 text-center shadow-lg">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-mint-soft text-mint mb-6">
            <CheckCircle2 className="size-8" aria-hidden />
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
              <span className="font-medium text-stamp-ink dark:text-stamp">{t("success.statusValue")}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-ink-3">{t("success.commission")}</span>
              <span className="font-semibold text-mint-ink">{t("success.commissionValue")}</span>
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
            <div className="inline-flex items-center gap-1.5 rounded-full bg-stamp-soft px-3 py-1 text-xs font-semibold text-stamp-ink mb-3">
              <Sparkles className="size-3.5" aria-hidden /> {t("badge")}
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink mb-2">
              {t("title")}
            </h1>
            <p className="text-sm text-ink-2 leading-relaxed">
              {t("subtitle")}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <ErrorNote>{error}</ErrorNote>}

            <Field label={t("fields.name")}>
              {(f) => <Input {...f} required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />}
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("fields.email")}>
                {(f) => <Input {...f} required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
              </Field>
              <Field label={t("fields.phone")}>
                {(f) => <PhoneInput {...f} required value={phone} onChange={setPhone} defaultCountry={countryCode} />}
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("fields.company")}>
                {(f) => <Input {...f} autoComplete="organization" value={company} onChange={(e) => setCompany(e.target.value)} />}
              </Field>
              <Field label={t("fields.profile")}>
                {(f) => (
                  <Select {...f} value={partnerType} onChange={(e) => setPartnerType(e.target.value)}>
                    {PARTNER_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(`types.${type}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("fields.country")}>
                {(f) => (
                  <CountrySelect
                    {...f}
                    value={countryCode}
                    onChange={(code) => {
                      setCountryCode(code);
                      const opt = getCountryOption(code);
                      if (opt?.defaultCity) {
                        setCity(opt.defaultCity);
                      }
                    }}
                  />
                )}
              </Field>
              <Field label={t("fields.city")}>
                {(f) => <CitySelect {...f} countryCode={countryCode} value={city} onChange={setCity} />}
              </Field>
            </div>

            <Field label={t("fields.website")}>
              {(f) => <Input {...f} type="url" inputMode="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} />}
            </Field>

            <Field label={t("fields.strategy")}>
              {(f) => <Textarea {...f} required rows={3} value={promotionStrategy} onChange={(e) => setPromotionStrategy(e.target.value)} />}
            </Field>

            <Field label={t("fields.network")}>
              {(f) => (
                <Select {...f} value={networkSizeEstimate} onChange={(e) => setNetworkSizeEstimate(e.target.value)}>
                  {NETWORK_SIZES.map((size) => (
                    <option key={size.value} value={size.value}>
                      {t(`network.${size.key}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            {/* Consentement & CGU */}
            <div className="rounded-xl border border-line bg-surface-2 p-4 space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  required
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="mt-0.5 size-4.5 shrink-0 accent-[var(--cobalt)]"
                />
                <span className="text-sm text-ink-2 leading-relaxed">
                  {t.rich("terms", {
                    link: (chunks) => (
                      <Link href="/cgu" className="text-cobalt underline underline-offset-4">
                        {chunks}
                      </Link>
                    ),
                  })}
                </span>
              </label>
            </div>

            <Button type="submit" size="lg" className="w-full font-semibold" loading={loading}>
              {loading ? t("submitting") : t("submit")}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
