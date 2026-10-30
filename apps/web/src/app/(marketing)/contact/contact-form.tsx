"use client";

import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ErrorNote, Panel } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";

const SUBJECTS = [
  "Demande de démonstration & essai accompagné",
  "Déploiement multi-boutiques / Offre Réseau",
  "Question sur les tarifs & moyens de paiement (RDC / International)",
  "Intégration caisse (POS) ou boutique e-commerce",
  "Partenariat ou autre demande",
];

export function ContactForm() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    subject: SUBJECTS[0]!,
    message: "",
    website: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/public/contact", {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        companyName: form.company.trim() || null,
        subject: form.subject,
        message: form.message.trim(),
        source: "WEBSITE",
        website: form.website || undefined,
      });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Panel className="p-8 text-center">
        <CheckCircle2 className="mx-auto size-12 text-mint" aria-hidden />
        <h2 className="mt-4 font-display text-2xl font-semibold">Votre demande est bien enregistrée</h2>
        <p className="mx-auto mt-2 max-w-md text-ink-2">
          Notre équipe commerciale a reçu votre message et vous répondra sous 24 heures ouvrées (par email ou WhatsApp selon vos coordonnées).
        </p>
        <Button
          variant="secondary"
          className="mt-6"
          onClick={() => {
            setSent(false);
            setForm({ name: "", email: "", phone: "", company: "", subject: SUBJECTS[0]!, message: "", website: "" });
          }}
        >
          Envoyer un autre message
        </Button>
      </Panel>
    );
  }

  return (
    <Panel className="p-6 sm:p-8">
      <h2 className="font-display text-2xl font-semibold">Écrivez-nous</h2>
      <p className="mt-1 text-sm text-ink-2">
        Installation offerte, configuration de votre programme et création de votre affiche QR prête à imprimer.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 grid gap-4" noValidate>
        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="hidden" aria-hidden="true">
          <label htmlFor="contact-website">Site web</label>
          <input
            id="contact-website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Votre nom complet">
            {(p) => (
              <Input
                {...p}
                required
                autoComplete="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            )}
          </Field>
          <Field label="Nom de votre commerce / enseigne">
            {(p) => (
              <Input
                {...p}
                autoComplete="organization"
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email professionnel">
            {(p) => (
              <Input
                {...p}
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            )}
          </Field>
          <Field label="Téléphone / WhatsApp (recommandé)">
            {(p) => (
              <Input
                {...p}
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            )}
          </Field>
        </div>

        <Field label="Objet de votre demande">
          {(p) => (
            <Select
              {...p}
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            >
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Votre message" hint="Précisez votre secteur d'activité, le nombre de points de vente et vos besoins.">
          {(p) => (
            <Textarea
              {...p}
              rows={4}
              required
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
          )}
        </Field>

        <Button
          type="submit"
          size="lg"
          loading={busy}
          disabled={form.name.trim().length < 2 || !form.email.includes("@") || form.message.trim().length < 10}
        >
          <Send className="size-4" /> Envoyer ma demande
        </Button>
      </form>
    </Panel>
  );
}

