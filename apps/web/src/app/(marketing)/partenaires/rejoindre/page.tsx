"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { api } from "@/lib/api";

export default function RejoindrePartenairePage() {
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
  const [country, setCountry] = useState("République Démocratique du Congo");
  const [city, setCity] = useState("Kinshasa");
  const [partnerType, setPartnerType] = useState("SALES_FREELANCE");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [promotionStrategy, setPromotionStrategy] = useState("");
  const [networkSizeEstimate, setNetworkSizeEstimate] = useState("11-50");
  const [acceptTerms, setAcceptTerms] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!acceptTerms) {
      setError("Veuillez accepter les conditions du programme partenaires.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{ success: boolean; partnerId: string; code: string; status: string }>(
        "/partners/apply",
        {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          company: company.trim() || undefined,
          country: country.trim(),
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
      setError(err?.message || "Impossible de soumettre votre candidature. Veuillez réessayer.");
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
          <ArrowLeft className="size-3.5" />
          Retour à la présentation du programme
        </Link>
      </div>

      {submitted ? (
        <div className="rounded-2xl border border-line bg-surface p-8 sm:p-12 text-center shadow-lg">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-6">
            <CheckCircle2 className="size-8" />
          </div>

          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink mb-3">
            Candidature enregistrée avec succès !
          </h1>

          <p className="text-sm text-ink-2 max-w-lg mx-auto mb-8 leading-relaxed">
            Merci <strong>{name}</strong>. Votre candidature a été transmise à notre équipe. Un email de confirmation a été
            envoyé à <strong>{email}</strong>.
          </p>

          <div className="rounded-xl border border-line bg-surface-2 p-5 max-w-md mx-auto text-left text-xs space-y-2 mb-8">
            <div className="flex justify-between items-center">
              <span className="text-ink-3">Code partenaire projeté :</span>
              <span className="font-mono font-bold text-ink text-sm bg-surface px-2 py-0.5 rounded border border-line">
                {submitted.code}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-ink-3">Statut actuel :</span>
              <span className="font-medium text-amber-500">En cours d&apos;examen (24-48h)</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-ink-3">Commission proposée :</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">20% net</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild variant="secondary" className="w-full sm:w-auto">
              <Link href="/">Retour à l&apos;accueil</Link>
            </Button>
            <Button asChild className="w-full sm:w-auto">
              <Link href="/login">Accéder à la connexion FOVE</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-surface p-6 sm:p-10 shadow-md">
          <div className="mb-8">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#C7FF3D]/20 px-3 py-1 text-xs font-semibold text-black dark:text-[#C7FF3D] mb-3">
              <Sparkles className="size-3.5" /> Candidature Partenaire
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink mb-2">
              Rejoindre le réseau FOVE
            </h1>
            <p className="text-xs sm:text-sm text-ink-2 leading-relaxed">
              Remplissez ce formulaire pour soumettre votre candidature. Notre équipe valide les dossiers sous 24 à 48 heures.
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
              <label className="block text-xs font-medium text-ink-2 mb-1">Prénom & Nom complet *</label>
              <Input
                required
                placeholder="Ex : Arnold Mub"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Email & Téléphone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">Email professionnel *</label>
                <Input
                  required
                  type="email"
                  placeholder="partenaire@domaine.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">Téléphone / WhatsApp *</label>
                <Input
                  required
                  placeholder="+243 89 000 0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            {/* Entreprise & Type de profil */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">
                  Nom d&apos;agence ou activité (facultatif)
                </label>
                <Input
                  placeholder="Ex : Digital Growth Studio"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">Votre profil *</label>
                <select
                  value={partnerType}
                  onChange={(e) => setPartnerType(e.target.value)}
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:border-cobalt"
                >
                  <option value="AGENCY">Agence digitale / Marketing</option>
                  <option value="DEVELOPER">Développeur / Intégrateur</option>
                  <option value="SALES_FREELANCE">Commercial indépendant</option>
                  <option value="CONSULTANT">Consultant / Formateur retail</option>
                  <option value="ENTREPRENEUR">Entrepreneur / Influenceur B2B</option>
                  <option value="MERCHANT_NETWORK">Réseau / Fédération de commerçants</option>
                  <option value="OTHER">Autre profil</option>
                </select>
              </div>
            </div>

            {/* Pays & Ville */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">Pays *</label>
                <Input
                  required
                  placeholder="Ex : République Démocratique du Congo, France..."
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">Ville principale *</label>
                <Input
                  required
                  placeholder="Ex : Kinshasa, Lubumbashi, Paris..."
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
            </div>

            {/* Site web ou réseau social */}
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">
                Site internet, LinkedIn ou portfolio (facultatif)
              </label>
              <Input
                type="url"
                placeholder="https://..."
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
              />
            </div>

            {/* Stratégie de recommandation */}
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">
                Comment comptez-vous promouvoir FOVE auprès des commerçants ? *
              </label>
              <textarea
                required
                rows={3}
                placeholder="Décrivez brièvement votre démarche (démarchage direct, clients existants de votre agence, réseau de boutiques, réseaux sociaux...)"
                className="w-full rounded-md border border-line bg-surface p-3 text-sm text-ink focus-visible:outline-none focus-visible:border-cobalt"
                value={promotionStrategy}
                onChange={(e) => setPromotionStrategy(e.target.value)}
              />
            </div>

            {/* Réseau estimé */}
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">
                Nombre estimé de commerces dans votre réseau
              </label>
              <select
                value={networkSizeEstimate}
                onChange={(e) => setNetworkSizeEstimate(e.target.value)}
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:border-cobalt"
              >
                <option value="1-10">1 à 10 commerces</option>
                <option value="11-50">11 à 50 commerces</option>
                <option value="51-200">51 à 200 commerces</option>
                <option value="200+">Plus de 200 commerces</option>
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
                  J&apos;accepte les <Link href="/cgu" className="underline text-ink">Conditions Générales d&apos;Utilisation</Link> et
                  m&apos;engage à recommander FOVE de manière loyale et professionnelle, sans pratiques de spam.
                </span>
              </label>
            </div>

            <Button type="submit" size="lg" className="w-full font-semibold" disabled={loading}>
              {loading ? "Envoi de votre candidature..." : "Soumettre ma candidature"}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
