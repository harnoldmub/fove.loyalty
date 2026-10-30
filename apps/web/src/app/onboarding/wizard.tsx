"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Coffee, ImageUp, Printer, Smartphone, Sparkles } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { CitySelect, CountrySelect, getCountryOption, SUGGESTED_CITIES } from "@/components/ui/country-select";
import { Field, Input, Select } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

const STEPS = ["Votre commerce", "Logo et couleur", "Établissement", "Programme", "Récompense", "QR code"] as const;
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
  const [step, setStep] = useState(tenant ? 1 : 0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Données saisies
  const [name, setName] = useState(tenant?.name ?? "");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [currency, setCurrency] = useState("CDF");
  const [color, setColor] = useState(COLORS[0]!);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [estName, setEstName] = useState("");
  const [estCountry, setEstCountry] = useState("CD");
  const [estCity, setEstCity] = useState("Kinshasa");
  const [mode, setMode] = useState<"POINTS" | "STAMPS">("STAMPS");
  const [spendStep, setSpendStep] = useState("1000");
  const [stampsTarget, setStampsTarget] = useState("10");
  const [program, setProgram] = useState<Program | null>(null);
  const [rewardName, setRewardName] = useState("");
  const [rewardCost, setRewardCost] = useState("100");
  const [joinUrl, setJoinUrl] = useState<string | null>(null);

  // Reprise d’un onboarding interrompu
  useEffect(() => {
    if (!tenant) return;
    (async () => {
      try {
        const [ests, programs, tenantData] = await Promise.all([
          api.get<{ id: string }[]>("/app/establishments"),
          api.get<Program[]>("/app/programs"),
          api.get<{ settings?: { country?: string } }>("/app/tenant").catch(() => null),
        ]);
        const savedCountry = tenantData?.settings?.country;
        if (savedCountry) {
          setEstCountry(savedCountry);
          setEstCity(SUGGESTED_CITIES[savedCountry]?.[0] ?? "Kinshasa");
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
        const defaultCountry = currency === "EUR" ? "FR" : "CD";
        const defaultTimezone = currency === "EUR" ? "Europe/Paris" : "Africa/Kinshasa";
        await api.post("/app/tenants", { name, slug: slug || slugify(name), currency, country: defaultCountry, timezone: defaultTimezone });
        setEstName(name);
        setEstCountry(defaultCountry);
        setEstCity(SUGGESTED_CITIES[defaultCountry]?.[0] ?? "Kinshasa");
        setStep(1);
      });
    if (step === 1)
      return run(async () => {
        await api.patch("/app/tenant", { primaryColor: color, ...(logoUrl ? { logoUrl } : {}) });
        if (!estName) setEstName(name || "Boutique principale");
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
          name: mode === "STAMPS" ? "Carte à tampons" : "Carte à points",
          mode,
          currency,
          spendStep: mode === "POINTS" ? spendStep : "1000",
          pointsPerStep: 1,
          stampsTarget: Number(stampsTarget),
        });
        setProgram(created);
        setRewardName(mode === "STAMPS" ? "Produit offert" : "Bon de réduction");
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
      window.location.assign("/app");
    });
  };

  const uploadLogo = async (file: File) => {
    if (file.size > 512 * 1024) return setError("Image trop lourde (512 Ko maximum)");
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
            Étape {step + 1} sur {STEPS.length}
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
                <h1 className="font-display text-3xl font-semibold">Bonjour {userName.split(" ")[0]}, présentez votre commerce</h1>
                <Field label="Nom du commerce">
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
                <Field label="Adresse de votre page" hint={`app.fove.digital/${slug || "votre-commerce"}`}>
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
                <Field label="Devise de vos ventes">
                  {(p) => (
                    <Select {...p} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                      <option value="CDF">Franc congolais (CDF)</option>
                      <option value="USD">Dollar américain (USD)</option>
                      <option value="EUR">Euro (EUR)</option>
                    </Select>
                  )}
                </Field>
                <Button type="submit" loading={busy} disabled={name.trim().length < 2}>Créer mon commerce</Button>
              </>
            )}

            {step === 1 && (
              <>
                <h1 className="font-display text-3xl font-semibold">Votre logo et votre couleur</h1>
                <p className="-mt-2 text-ink-2">Ils habillent la carte de vos clients et votre page d’inscription.</p>
                <div className="grid gap-2">
                  <span className="text-sm font-medium">Logo (facultatif)</span>
                  <label className="flex cursor-pointer items-center gap-4 rounded-md bg-surface p-3 shadow-1 hover:bg-surface-2">
                    <span className="grid size-14 place-items-center overflow-hidden rounded-md bg-surface-2">
                      {logoUrl ? <img src={logoUrl} alt="Logo" className="size-full object-cover" /> : <ImageUp className="size-6 text-ink-3" aria-hidden />}
                    </span>
                    <span className="text-sm text-ink-2">{logoUrl ? "Changer l’image" : "Choisir une image PNG, JPEG ou WebP (512 Ko max.)"}</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
                  </label>
                </div>
                <fieldset className="grid gap-2">
                  <legend className="mb-2 text-sm font-medium">Couleur principale</legend>
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
                <Button type="submit" loading={busy}>Continuer</Button>
              </>
            )}

            {step === 2 && (
              <>
                <h1 className="font-display text-3xl font-semibold">Votre point de vente</h1>
                <p className="-mt-2 text-ink-2">Vous pourrez en ajouter d’autres ensuite.</p>
                <Field label="Nom de l’établissement">{(p) => <Input {...p} value={estName} onChange={(e) => setEstName(e.target.value)} />}</Field>
                <Field label="Pays">
                  {(p) => (
                    <CountrySelect
                      {...p}
                      value={estCountry}
                      onChange={(code) => {
                        setEstCountry(code);
                        setEstCity(SUGGESTED_CITIES[code]?.[0] ?? "");
                      }}
                    />
                  )}
                </Field>
                <Field label="Ville">
                  {(p) => <CitySelect {...p} countryCode={estCountry} value={estCity} onChange={setEstCity} />}
                </Field>
                <Button type="submit" loading={busy} disabled={estName.trim().length < 2}>Continuer</Button>
              </>
            )}

            {step === 3 && (
              <>
                <h1 className="font-display text-3xl font-semibold">Comment vos clients gagnent-ils ?</h1>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["STAMPS", "Tampons", "Un achat = un tampon. Simple, idéal pour un café, un salon, un snack.", Coffee],
                      ["POINTS", "Points", "Les points suivent le montant dépensé. Idéal pour une boutique ou un supermarché.", Sparkles],
                    ] as const
                  ).map(([value, label, text, Icon]) => (
                    <label key={value} className={cn("grid cursor-pointer gap-2 rounded-[var(--radius-lg)] bg-surface p-4 shadow-1", mode === value && "ring-2 ring-cobalt")}>
                      <input type="radio" name="mode" className="sr-only" checked={mode === value} onChange={() => setMode(value)} />
                      <Icon className="size-5 text-cobalt" aria-hidden />
                      <span className="font-display text-lg font-semibold">{label}</span>
                      <span className="text-sm text-ink-2">{text}</span>
                    </label>
                  ))}
                </div>
                {mode === "POINTS" ? (
                  <Field label={`Montant pour gagner 1 point (${currency})`} hint={`Exemple : 1 000 ${currency} dépensés = 1 point.`}>
                    {(p) => <Input {...p} inputMode="decimal" value={spendStep} onChange={(e) => setSpendStep(e.target.value.replace(",", "."))} />}
                  </Field>
                ) : (
                  <Field label="Tampons pour une récompense">
                    {(p) => <Input {...p} type="number" min={2} max={50} value={stampsTarget} onChange={(e) => setStampsTarget(e.target.value)} />}
                  </Field>
                )}
                <Button type="submit" loading={busy}>Créer le programme</Button>
              </>
            )}

            {step === 4 && program && (
              <>
                <h1 className="font-display text-3xl font-semibold">La récompense</h1>
                <p className="-mt-2 text-ink-2">
                  {program.mode === "STAMPS" ? `Offerte quand la carte atteint ${program.stampsTarget} tampons.` : "Ce que vos clients obtiennent avec leurs points. Vous en ajouterez d’autres plus tard."}
                </p>
                <Field label="Nom de la récompense">{(p) => <Input {...p} value={rewardName} onChange={(e) => setRewardName(e.target.value)} />}</Field>
                {program.mode === "POINTS" && (
                  <Field label="Coût en points">{(p) => <Input {...p} type="number" min={1} value={rewardCost} onChange={(e) => setRewardCost(e.target.value)} />}</Field>
                )}
                <Button type="submit" loading={busy} disabled={rewardName.trim().length < 2}>Continuer</Button>
              </>
            )}

            {step === 5 && (
              <>
                <h1 className="font-display text-3xl font-semibold">Votre QR code d’inscription</h1>
                <p className="-mt-2 text-ink-2">Affichez-le au comptoir. Vos clients le scannent pour créer leur carte.</p>
                {joinUrl && (
                  <div className="grid justify-items-center gap-4 rounded-[var(--radius-lg)] bg-white p-6 shadow-1">
                    <QRCodeSVG id="join-qr" value={joinUrl} size={208} marginSize={2} fgColor="#14204a" />
                    <p className="break-all text-center text-xs text-[#4a5579]">{joinUrl}</p>
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button type="button" variant="secondary" onClick={() => window.print()}>
                    <Printer /> Imprimer
                  </Button>
                  {joinUrl && (
                    <Button type="button" variant="secondary" asChild>
                      <a href={joinUrl} target="_blank" rel="noreferrer">
                        <Smartphone /> Voir la page client
                      </a>
                    </Button>
                  )}
                </div>
                <Button type="submit" loading={busy}>Ouvrir mon tableau de bord</Button>
              </>
            )}
          </form>
          {step > 0 && step < 5 && (
            <p className="mt-6 text-center text-sm text-ink-3">
              <Link href="/login" className="hover:text-ink">Reprendre plus tard</Link>
            </p>
          )}
        </div>
      </div>

      <aside aria-hidden className="hidden items-center justify-center bg-surface-2 p-10 lg:flex">
        <div className="w-full max-w-sm rounded-[28px] p-7 text-white shadow-2" style={{ background: color }}>
          <div className="flex items-center gap-3">
            {logoUrl ? <img src={logoUrl} alt="" className="size-11 rounded-full bg-white object-cover" /> : <span className="grid size-11 place-items-center rounded-full bg-white/20 font-display text-lg font-bold">{(name || "F").slice(0, 1)}</span>}
            <div>
              <p className="text-sm text-white/75">Carte de fidélité</p>
              <p className="font-display text-xl font-semibold">{name || "Votre commerce"}</p>
            </div>
          </div>
          <div className="mt-8 grid grid-cols-5 gap-2.5">
            {Array.from({ length: mode === "STAMPS" ? Math.min(Number(stampsTarget) || 10, 15) : 5 }, (_, i) => (
              <span key={i} className={cn("aspect-square rounded-full border-2 border-dashed border-white/40", i < 3 && "border-solid border-transparent bg-[#f5b82e]")} />
            ))}
          </div>
          <p className="mt-8 text-sm text-white/80">Aperçu de la carte que vos clients verront sur leur téléphone.</p>
        </div>
      </aside>
    </div>
  );
}
