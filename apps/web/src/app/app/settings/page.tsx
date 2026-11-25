"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Gift } from "lucide-react";
import { useTranslations } from "next-intl";
import { LOCALE_NAMES, LOCALES } from "@/i18n/config";
import { toast } from "sonner";
import { defaultCurrencyForCountry } from "@fove/shared";
import { useCan } from "@/components/app/me-context";
import { Button } from "@/components/ui/button";
import { CountrySelect, getCountryOption } from "@/components/ui/country-select";
import { CurrencySelect } from "@/components/ui/currency-select";
import { Field, Input, Select } from "@/components/ui/field";
import { ErrorNote, PageHeader, Panel, Skeleton } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";

interface Tenant {
  name: string;
  slug: string;
  settings: {
    locale?: string | null;
    primaryColor: string;
    logoUrl: string | null;
    walletBannerUrl?: string | null;
    walletBannerVersion?: string | null;
    instagramHandle?: string | null;
    country: string;
    currency: string;
    timezone: string;
    legalName: string | null;
    contactEmail: string | null;
    privacyPolicyUrl: string | null;
  };
}

export default function SettingsPage() {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.settings");
  const { data, isLoading, error } = useQuery({ queryKey: ["tenant"], queryFn: () => api.get<Tenant>("/app/tenant") });
  const { data: walletStatus } = useQuery({
    queryKey: ["wallet-status"],
    queryFn: () => api.get<{ googleWallet: boolean; appleWallet?: boolean }>("/app/wallet/status"),
  });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={data ? t("pageAddress", { url: `fove.digital/${data.slug}` }) : undefined}
        actions={
          data ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={`/${data.slug}`} target="_blank">
                {t("viewPublic")}
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* État des intégrations Portefeuilles & WhatsApp */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <section className="rounded-[var(--radius-lg)] bg-surface p-4 text-sm shadow-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-semibold text-ink">Apple Wallet</h2>
            <span className={walletStatus?.appleWallet ? "shrink-0 whitespace-nowrap rounded-full bg-mint-soft px-2 py-0.5 text-xs font-medium text-mint" : "shrink-0 whitespace-nowrap rounded-full bg-stamp-soft px-2 py-0.5 text-xs font-medium text-stamp-ink dark:text-stamp"}>
              {walletStatus?.appleWallet ? t("enabled") : t("toConfigure")}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-ink-3">
            {walletStatus?.appleWallet ? t("apple.on") : t("apple.off")}
          </p>
        </section>

        <section className="rounded-[var(--radius-lg)] bg-surface p-4 text-sm shadow-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-semibold text-ink">Google Wallet</h2>
            <span className={walletStatus?.googleWallet ? "shrink-0 whitespace-nowrap rounded-full bg-mint-soft px-2 py-0.5 text-xs font-medium text-mint" : "shrink-0 whitespace-nowrap rounded-full bg-stamp-soft px-2 py-0.5 text-xs font-medium text-stamp-ink dark:text-stamp"}>
              {walletStatus?.googleWallet ? t("enabled") : t("toConfigure")}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-ink-3">
            {walletStatus?.googleWallet ? t("google.on") : t("google.off")}
          </p>
        </section>

        <section className="rounded-[var(--radius-lg)] bg-surface p-4 text-sm shadow-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-semibold text-ink">WhatsApp</h2>
            <span className="shrink-0 whitespace-nowrap rounded-full bg-mint-soft px-2 py-0.5 text-xs font-medium text-mint">
              {t("enabled")}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-ink-3">
            {t("whatsapp")}
          </p>
        </section>
      </div>

      {/* Programme Parrainage Commerçant */}
      {data && (
        <Panel className="mb-6 border border-emerald-500/20 bg-emerald-500/5 p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Gift className="size-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-base font-semibold text-ink">{t("referral.title")}</h2>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    {t("referral.badge")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-2 max-w-xl leading-relaxed">
                  {t.rich("referral.body", { strong: (c) => <strong>{c}</strong> })}
                </p>
              </div>
            </div>

            <Button asChild variant="secondary" size="sm" className="w-full sm:w-auto">
              <Link href="/app/parrainage">{t("referral.open")}</Link>
            </Button>
          </div>
        </Panel>
      )}

      {isLoading && <Skeleton className="h-64" />}
      {error && <ErrorNote>{toErrorMessage(error)}</ErrorNote>}
      {data && <SettingsForm data={data} />}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild variant="secondary"><Link href="/app/programs">{t("links.programs")}</Link></Button>
        <Button asChild variant="secondary"><Link href="/app/rewards">{t("links.rewards")}</Link></Button>
        <Button asChild variant="secondary"><Link href="/app/establishments">{t("links.establishments")}</Link></Button>
      </div>
    </>
  );
}

function SettingsForm({ data }: { data: Tenant }) {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.settings.form");
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const canWrite = useCan("tenant.update");
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<Record<string, string>>(() => ({
      name: data.name,
      slug: data.slug,
      primaryColor: data.settings.primaryColor,
      logoUrl: data.settings.logoUrl ?? "",
      walletBannerUrl: data.settings.walletBannerUrl ?? "",
      instagramHandle: data.settings.instagramHandle ?? "",
      country: data.settings.country,
      currency: data.settings.currency,
      locale: data.settings.locale ?? "",
      timezone: data.settings.timezone,
      legalName: data.settings.legalName ?? "",
      contactEmail: data.settings.contactEmail ?? "",
      privacyPolicyUrl: data.settings.privacyPolicyUrl ?? "",
  }));
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <Panel className="max-w-2xl p-5 sm:p-6">
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api.patch("/app/tenant", {
                name: f.name,
                slug: f.slug,
                primaryColor: f.primaryColor,
                country: f.country,
                currency: f.currency,
                locale: f.locale || null,
                timezone: f.timezone,
                logoUrl: f.logoUrl || null,
                walletBannerUrl: f.walletBannerUrl || null,
                walletBannerVersion: f.walletBannerUrl ? String(Date.now()) : null,
                instagramHandle: f.instagramHandle ? (f.instagramHandle.startsWith("@") ? f.instagramHandle : `@${f.instagramHandle}`) : null,
                legalName: f.legalName || null,
                contactEmail: f.contactEmail || null,
                privacyPolicyUrl: f.privacyPolicyUrl || null,
              });
              qc.invalidateQueries({ queryKey: ["tenant"] });
              router.refresh();
              toast.success(t("saved"));
            } catch (err) {
              setError(toErrorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && <ErrorNote>{error}</ErrorNote>}
          <fieldset disabled={!canWrite} className="grid gap-4">
            <Field label={t("name")}>{(p) => <Input {...p} value={f.name ?? ""} onChange={set("name")} />}</Field>
            <Field
              label={t("slug")}
              hint={`fove.digital/${f.slug || t("slugPlaceholder")}`}
            >
              {(p) => (
                <div className="flex items-stretch overflow-hidden rounded-[var(--radius)] bg-surface shadow-1 ring-1 ring-line focus-within:ring-2 focus-within:ring-cobalt">
                  <span dir="ltr" className="flex select-none items-center border-e border-line bg-surface-2 px-3.5 text-sm font-medium text-ink-2">
                    fove.digital/
                  </span>
                  <Input
                    {...p}
                    value={f.slug ?? ""}
                    onChange={(e) =>
                      setF({
                        ...f,
                        slug: e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]+/g, "-")
                          .replace(/^-+|-+$/g, "")
                          .slice(0, 48),
                      })
                    }
                    className="rounded-none border-0 shadow-none ring-0 focus-visible:ring-0"
                  />
                </div>
              )}
            </Field>
            <Field label={t("legalName")}>{(p) => <Input {...p} value={f.legalName ?? ""} onChange={set("legalName")} />}</Field>
            <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
              <Field label={t("color")}>{(p) => <input {...p} type="color" className="h-11 w-16 cursor-pointer rounded-md bg-surface shadow-1" value={f.primaryColor ?? "#2C55F5"} onChange={set("primaryColor")} />}</Field>
              <Field label={t("logoUpload")} hint={t("logoHint")}>
                {(p) => <Input {...p} type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 512 * 1024) { setError(t("logoTooBig")); return; }
                  setUploading(true); setError(null);
                  try {
                    const dataBase64 = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
                      reader.onerror = () => reject(new Error(t("readError")));
                      reader.readAsDataURL(file);
                    });
                    const { url } = await api.post<{ url: string }>("/app/media", { dataBase64 });
                    setF((current) => ({ ...current, logoUrl: url }));
                  } catch (err) { setError(toErrorMessage(err)); } finally { setUploading(false); }
                }} />}
              </Field>
              <Field label={t("logoUrl")}>{(p) => <Input {...p} value={f.logoUrl ?? ""} onChange={set("logoUrl")} />}</Field>
            </div>

            <div className="grid gap-2 rounded-xl border border-line bg-surface-2/60 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-ink">{t("banner")}</p>
                {f.walletBannerUrl && (
                  <button
                    type="button"
                    onClick={() => setF({ ...f, walletBannerUrl: "" })}
                    className="text-xs font-medium text-danger hover:underline"
                  >
                    {t("bannerReset")}
                  </button>
                )}
              </div>
              <p className="text-xs text-ink-3">
                {t("bannerHint")}
              </p>
              <div className="mt-2 aspect-[375/144] w-full max-w-md overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
                <img
                  src={f.walletBannerUrl || `/api/public/tenants/${f.slug}/wallet-banner.png?v=${encodeURIComponent(`${f.name ?? ""}-${f.primaryColor ?? ""}`)}`}
                  alt={t("banner")}
                  className="size-full object-cover"
                />
              </div>
              <Input
                type="file"
                aria-label={t("bannerUpload")}
                accept="image/png,image/jpeg,image/webp"
                disabled={uploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 1024 * 1024) { setError(t("bannerTooBig")); return; }
                  setUploading(true); setError(null);
                  try {
                    const dataBase64 = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
                      reader.onerror = () => reject(new Error(t("readError")));
                      reader.readAsDataURL(file);
                    });
                    const { url } = await api.post<{ url: string }>("/app/media", { dataBase64 });
                    setF((current) => ({ ...current, walletBannerUrl: url }));
                  } catch (err) { setError(toErrorMessage(err)); } finally { setUploading(false); }
                }}
              />
            </div>

            <Field label={t("instagram")} hint={t("instagramHint")}>
              {(p) => <Input {...p} value={f.instagramHandle ?? ""} onChange={set("instagramHandle")} />}
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("country")}>
                {(p) => (
                  <CountrySelect
                    {...p}
                    value={f.country ?? "CD"}
                    onChange={(code) =>
                      setF({
                        ...f,
                        country: code,
                        currency: defaultCurrencyForCountry(code),
                        timezone: getCountryOption(code)?.timezone ?? f.timezone ?? "Africa/Kinshasa",
                      })
                    }
                  />
                )}
              </Field>
              <Field label={t("currency")} hint={t("currencyHint")}>
                {(p) => (
                  <CurrencySelect {...p} value={f.currency ?? "CDF"} onChange={(code) => setF({ ...f, currency: code })} />
                )}
              </Field>
              <Field label={t("customerLanguage")} hint={t("customerLanguageHint")}>
                {(p) => (
                  <Select {...p} value={f.locale ?? ""} onChange={set("locale")}>
                    <option value="">{t("customerLanguageAuto")}</option>
                    {LOCALES.map((l) => (
                      <option key={l} value={l} lang={l}>
                        {LOCALE_NAMES[l]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t("timezone")}>
                {(p) => (
                  <Select {...p} value={f.timezone ?? "Africa/Kinshasa"} onChange={set("timezone")}>
                    <option value="Africa/Kinshasa">{t("tz.kinshasa")}</option>
                    <option value="Africa/Lubumbashi">{t("tz.lubumbashi")}</option>
                    <option value="Europe/Paris">{t("tz.paris")}</option>
                    <option value="Europe/Brussels">{t("tz.brussels")}</option>
                  </Select>
                )}
              </Field>
            </div>
            <Field label={t("contactEmail")}>{(p) => <Input {...p} type="email" value={f.contactEmail ?? ""} onChange={set("contactEmail")} />}</Field>
            <Field label={t("privacy")} hint={t("privacyHint")}>{(p) => <Input {...p} value={f.privacyPolicyUrl ?? ""} onChange={set("privacyPolicyUrl")} />}</Field>
            {canWrite && <Button type="submit" loading={busy || uploading} className="justify-self-start">{t("submit")}</Button>}
          </fieldset>
        </form>
      </Panel>
    </>
  );
}
