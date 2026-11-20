"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Coffee, ImageUp, Printer, Smartphone, Sparkles } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { defaultCurrencyForCountry } from "@fove/shared";
import { CitySelect, CountrySelect, detectClientCountry, getCountryOption } from "@/components/ui/country-select";
import { Field, Input } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { afterAuthPath } from "@/lib/plan-choice";
import { CurrencySelect } from "@/components/ui/currency-select";
import { cn, formatNumber } from "@/lib/utils";

const STEPS = ["business", "branding", "establishment", "program", "reward", "qr"] as const;
const COLORS = ["#2C55F5", "#0E7C66", "#C2410C", "#7C3AED", "#BE123C", "#14204A", "#B45309", "#0369A1"];

function slugify(v: string) {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

interface Program {
  id: string;
  name: string;
  mode: "POINTS" | "STAMPS";
  stampsTarget: number;
}

export function OnboardingWizard({ userName, tenant }: { userName: string; tenant: { id: string; name: string } | null }) {
  const t = useTranslations("onboarding");
  const [step, setStep] = useState(tenant ? 1 : 0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Données saisies
  const [name, setName] = useState(tenant?.name ?? "");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [currency, setCurrency] = useState("EUR");
  const [color, setColor] = useState(COLORS[0]!);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [estName, setEstName] = useState("");
  const [estCountry, setEstCountry] = useState("FR");
  const [estCity, setEstCity] = useState("");
  const [mode, setMode] = useState<"POINTS" | "STAMPS">("STAMPS");
  const [spendStep, setSpendStep] = useState("1000");
  const [stampsTarget, setStampsTarget] = useState("10");
  const [program, setProgram] = useState<Program | null>(null);
  const [rewardName, setRewardName] = useState("");
  const [rewardCost, setRewardCost] = useState("100");
  const [joinUrl, setJoinUrl] = useState<string | null>(null);

  // Pour une nouvelle entreprise, utiliser les signaux locaux du navigateur
  // (fuseau horaire puis langue). La France reste le repli explicite.
  useEffect(() => {
    if (tenant) return;
    const frame = requestAnimationFrame(() => {
      const detectedCountry = detectClientCountry();
      setEstCountry(detectedCountry);
      setCurrency(defaultCurrencyForCountry(detectedCountry));
      setEstCity("");
    });
    return () => cancelAnimationFrame(frame);
  }, [tenant]);

  // Reprise d’un onboarding interrompu
  useEffect(() => {
    if (!tenant) return;
    (async () => {
      try {
        const [ests, programs, tenantData] = await Promise.all([
          api.get<{ id: string }[]>("/app/establishments"),
          api.get<Program[]>("/app/programs"),
          api.get<{ settings?: { country?: string; currency?: string } }>("/app/tenant").catch(() => null),
        ]);
        const savedCountry = tenantData?.settings?.country;
        if (savedCountry) {
          setEstCountry(savedCountry);
          setEstCity("");
        }
        if (tenantData?.settings?.currency) {
          setCurrency(tenantData.settings.currency);
        }
        if (programs.length > 0) {
          setProgram(programs[0]!);
          setStep(4);
        } else if (ests.length > 0) setStep(3);
      } catch {
        /* reste à l’étape courante */
      }
    })();
  }, [tenant]);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 0)
      return run(async () => {
        const timezone = getCountryOption(estCountry)?.timezone ?? (currency === "EUR" ? "Europe/Paris" : "Africa/Kinshasa");
        const partnerCodeCookie = typeof document !== "undefined"
          ? document.cookie
              .split("; ")
              .find((row) => row.startsWith("fove_partner_code="))
              ?.split("=")[1]
          : undefined;
        const referrerCookie = typeof document !== "undefined"
          ? document.cookie
              .split("; ")
              .find((row) => row.startsWith("fove_ref="))
              ?.split("=")[1]
          : undefined;

        await api.post("/app/tenants", {
          name,
          slug: slug || slugify(name),
          currency,
          country: estCountry,
          timezone,
          partnerCode: partnerCodeCookie ? decodeURIComponent(partnerCodeCookie) : undefined,
          referrerSlug: referrerCookie ? decodeURIComponent(referrerCookie) : undefined,
        });
        setEstName(name);
        setStep(1);
      });
    if (step === 1)
      return run(async () => {
        await api.patch("/app/tenant", { primaryColor: color, ...(logoUrl ? { logoUrl } : {}) });
        if (!estName) setEstName(name || t("defaults.establishment"));
        setStep(2);
      });
    if (step === 2)
      return run(async () => {
        const timezone = getCountryOption(estCountry)?.timezone ?? "Africa/Kinshasa";
        await Promise.all([
          api.patch("/app/tenant", { country: estCountry, timezone }),
          api.post("/app/establishments", { name: estName, city: estCity || null }),
        ]);
        setStep(3);
      });
    if (step === 3)
      return run(async () => {
        const created = await api.post<Program>("/app/programs", {
          name: mode === "STAMPS" ? t("defaults.stampsProgram") : t("defaults.pointsProgram"),
          mode,
          currency,
          spendStep: mode === "POINTS" ? spendStep : "1000",
          pointsPerStep: 1,
          stampsTarget: Number(stampsTarget),
        });
        setProgram(created);
        setRewardName(mode === "STAMPS" ? t("defaults.stampsReward") : t("defaults.pointsReward"));
        setRewardCost(mode === "STAMPS" ? String(created.stampsTarget) : "100");
        setStep(4);
      });
    if (step === 4)
      return run(async () => {
        if (program && program.mode === "POINTS") {
          await api.post("/app/rewards", { programId: program.id, name: rewardName, cost: Number(rewardCost) });
        } else if (program && rewardName) {
          // Carte à tampons : la récompense « carte complète » existe déjà, on la renomme.
          const rewards = await api.get<{ id: string }[]>(`/app/rewards?programId=${program.id}`);
          if (rewards[0]) await api.patch(`/app/rewards/${rewards[0].id}`, { name: rewardName });
        }
        const links = await api.get<{ url: string; programId: string }[]>("/app/enrollment-links");
        setJoinUrl(links.find((l) => l.programId === program?.id)?.url ?? links[0]?.url ?? null);
        setStep(5);
      });
    return run(async () => {
      await api.post("/app/tenant/onboarding/complete");
      // Offre payante choisie sur la page tarifs : direction le paiement.
      window.location.assign(afterAuthPath("/app"));
    });
  };

  const uploadLogo = async (file: File) => {
    if (file.size > 512 * 1024) return setError(t("errors.logoTooLarge"));
    await run(async () => {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const { url } = await api.post<{ url: string }>("/app/media", { dataBase64 });
      setLogoUrl(url);
    });
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Logo />
        <div className="mx-auto mt-10 w-full max-w-md flex-1">
          <p className="text-sm text-ink-3">
            {t("progress", { current: step + 1, total: STEPS.length })}
          </p>
          <div className="mt-2 flex gap-1.5" aria-hidden>
            {STEPS.map((s, i) => (
              <span key={s} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-cobalt" : "bg-line")} />
            ))}
          </div>

          <form onSubmit={submit} className="mt-8 grid gap-5" noValidate>
            {error && <ErrorNote>{error}</ErrorNote>}

            {step === 0 && (
              <>
                <h1 className="font-display text-3xl font-semibold">{t("business.title", { name: userName.split(" ")[0] ?? "" })}</h1>
                <Field label={t("business.name")}>
                  {(p) => (
                    <Input
                      {...p}
                      required
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (!slugTouched) setSlug(slugify(e.target.value));
                      }}
                    />
                  )}
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("business.country")}>
                    {(p) => (
                      <CountrySelect
                        {...p}
                        value={estCountry}
                        onChange={(code) => {
                          setEstCountry(code);
                          setEstCity("");
                          setCurrency(defaultCurrencyForCountry(code));
                        }}
                      />
                    )}
                  </Field>
                  <Field label={t("business.city")}>
                    {(p) => <CitySelect {...p} countryCode={estCountry} value={estCity} onChange={setEstCity} />}
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("business.currency")}>
                    {(p) => (
                      <CurrencySelect {...p} value={currency} onChange={setCurrency} />
                    )}
                  </Field>
                  <Field label={t("business.slug")} hint={<span dir="ltr">{`app.fove.digital/${slug || t("defaults.slug")}`}</span>}>
                    {(p) => (
                      <Input
                        {...p}
                        value={slug}
                        onChange={(e) => {
                          setSlugTouched(true);
                          setSlug(slugify(e.target.value));
                        }}
                      />
                    )}
                  </Field>
                </div>
                <Button type="submit" loading={busy} disabled={name.trim().length < 2}>{t("business.submit")}</Button>
              </>
            )}

            {step === 1 && (
              <>
                <h1 className="font-display text-3xl font-semibold">{t("branding.title")}</h1>
                <p className="-mt-2 text-ink-2">{t("branding.subtitle")}</p>
                <div className="grid gap-2">
                  <span className="text-sm font-medium">{t("branding.logo")}</span>
                  <label className="flex cursor-pointer items-center gap-4 rounded-md bg-surface p-3 shadow-1 hover:bg-surface-2">
                    <span className="grid size-14 place-items-center overflow-hidden rounded-md bg-surface-2">
                      {logoUrl ? <img src={logoUrl} alt={t("branding.logoAlt")} className="size-full object-cover" /> : <ImageUp className="size-6 text-ink-3" aria-hidden />}
                    </span>
                    <span className="text-sm text-ink-2">{logoUrl ? t("branding.change") : t("branding.choose")}</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
                  </label>
                </div>
                <fieldset className="grid gap-2">
                  <legend className="mb-2 text-sm font-medium">{t("branding.color")}</legend>
                  <div className="flex flex-wrap gap-2.5">
                    {COLORS.map((c) => (
                      <label key={c} className="relative">
                        <input type="radio" name="color" value={c} checked={color === c} onChange={() => setColor(c)} className="peer sr-only" />
                        <span className="grid size-10 cursor-pointer place-items-center rounded-full ring-offset-2 ring-offset-paper peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:ring-2 peer-focus-visible:ring-cobalt" style={{ background: c }}>
                          {color === c && <Check className="size-4 text-white" aria-hidden />}
                        </span>
                        <span className="sr-only">{c}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Button type="submit" loading={busy}>{t("continue")}</Button>
              </>
            )}

            {step === 2 && (
              <>
                <h1 className="font-display text-3xl font-semibold">{t("establishment.title")}</h1>
                <p className="-mt-2 text-ink-2">{t("establishment.subtitle")}</p>
                <Field label={t("establishment.name")}>{(p) => <Input {...p} value={estName} onChange={(e) => setEstName(e.target.value)} />}</Field>
                <Field label={t("establishment.country")}>
                  {(p) => (
                    <CountrySelect
                      {...p}
                      value={estCountry}
                      onChange={(code) => {
                        setEstCountry(code);
                        setEstCity("");
                      }}
                    />
                  )}
                </Field>
                <Field label={t("establishment.city")}>
                  {(p) => <CitySelect {...p} countryCode={estCountry} value={estCity} onChange={setEstCity} />}
                </Field>
                <Button type="submit" loading={busy} disabled={estName.trim().length < 2}>{t("continue")}</Button>
              </>
            )}

            {step === 3 && (
              <>
                <h1 className="font-display text-3xl font-semibold">{t("program.title")}</h1>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["STAMPS", "stamps", Coffee],
                      ["POINTS", "points", Sparkles],
                    ] as const
                  ).map(([value, key, Icon]) => (
                    <label key={value} className={cn("grid cursor-pointer gap-2 rounded-[var(--radius-lg)] bg-surface p-4 shadow-1", mode === value && "ring-2 ring-cobalt")}>
                      <input type="radio" name="mode" className="sr-only" checked={mode === value} onChange={() => setMode(value)} />
                      <Icon className="size-5 text-cobalt" aria-hidden />
                      <span className="font-display text-lg font-semibold">{t(`program.${key}Label`)}</span>
                      <span className="text-sm text-ink-2">{t(`program.${key}Text`)}</span>
                    </label>
                  ))}
                </div>
                {mode === "POINTS" ? (
                  <Field label={t("program.spendStep", { currency })} hint={t("program.spendStepHint", { amount: formatNumber(1000), currency })}>
                    {(p) => <Input {...p} inputMode="decimal" value={spendStep} onChange={(e) => setSpendStep(e.target.value.replace(",", "."))} />}
                  </Field>
                ) : (
                  <Field label={t("program.stampsTarget")}>
                    {(p) => <Input {...p} type="number" min={2} max={50} value={stampsTarget} onChange={(e) => setStampsTarget(e.target.value)} />}
                  </Field>
                )}
                <Button type="submit" loading={busy}>{t("program.submit")}</Button>
              </>
            )}

            {step === 4 && program && (
              <>
                <h1 className="font-display text-3xl font-semibold">{t("reward.title")}</h1>
                <p className="-mt-2 text-ink-2">
                  {program.mode === "STAMPS" ? t("reward.stampsText", { count: program.stampsTarget }) : t("reward.pointsText")}
                </p>
                <Field label={t("reward.name")}>{(p) => <Input {...p} value={rewardName} onChange={(e) => setRewardName(e.target.value)} />}</Field>
                {program.mode === "POINTS" && (
                  <Field label={t("reward.cost")}>{(p) => <Input {...p} type="number" min={1} value={rewardCost} onChange={(e) => setRewardCost(e.target.value)} />}</Field>
                )}
                <Button type="submit" loading={busy} disabled={rewardName.trim().length < 2}>{t("continue")}</Button>
              </>
            )}

            {step === 5 && (
              <>
                <h1 className="font-display text-3xl font-semibold">{t("qr.title")}</h1>
                <p className="-mt-2 text-ink-2">{t("qr.subtitle")}</p>
                {joinUrl && (
                  <div className="grid justify-items-center gap-4 rounded-[var(--radius-lg)] bg-white p-6 shadow-1">
                    <QRCodeSVG id="join-qr" value={joinUrl} size={208} marginSize={2} fgColor="#14204a" />
                    <p dir="ltr" className="break-all text-center text-xs text-[#4a5579]">{joinUrl}</p>
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button type="button" variant="secondary" onClick={() => window.print()}>
                    <Printer /> {t("qr.print")}
                  </Button>
                  {joinUrl && (
                    <Button type="button" variant="secondary" asChild>
                      <a href={joinUrl} target="_blank" rel="noreferrer">
                        <Smartphone /> {t("qr.customerPage")}
                      </a>
                    </Button>
                  )}
                </div>
                <Button type="submit" loading={busy}>{t("qr.submit")}</Button>
              </>
            )}
          </form>
          {step > 0 && step < 5 && (
            <p className="mt-6 text-center text-sm text-ink-3">
              <Link href="/login" className="hover:text-ink">{t("later")}</Link>
            </p>
          )}
        </div>
      </div>

      <aside aria-hidden className="hidden items-center justify-center bg-surface-2 p-10 lg:flex">
        <div className="w-full max-w-sm rounded-[28px] p-7 text-white shadow-2" style={{ background: color }}>
          <div className="flex items-center gap-3">
            {logoUrl ? <img src={logoUrl} alt="" className="size-11 rounded-full bg-white object-cover" /> : <span className="grid size-11 place-items-center rounded-full bg-white/20 font-display text-lg font-bold">{(name || "F").slice(0, 1)}</span>}
            <div>
              <p className="text-sm text-white/75">{t("preview.label")}</p>
              <p className="font-display text-xl font-semibold">{name || t("defaults.business")}</p>
            </div>
          </div>
          <div className="mt-8 grid grid-cols-5 gap-2.5">
            {Array.from({ length: mode === "STAMPS" ? Math.min(Number(stampsTarget) || 10, 15) : 5 }, (_, i) => (
              <span key={i} className={cn("grid aspect-square place-items-center rounded-full border-2 border-dashed border-white/40", i < 3 && "border-solid border-transparent bg-[#f5b82e]")}>
                {i < 3 && <Check className="size-4 stroke-[3] text-[#14204a]" aria-hidden="true" />}
              </span>
            ))}
          </div>
          <p className="mt-8 text-sm text-white/80">{t("preview.caption")}</p>
        </div>
      </aside>
    </div>
  );
}
