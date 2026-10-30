"use client";

import { useState, type ReactNode } from "react";
import { FileCheck2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogContent, DialogRoot, DialogTrigger } from "@/components/ui/dialog";

export function TermsDialog({ trigger }: { trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="text-cobalt underline hover:text-cobalt-hover"
          >
            conditions d’utilisation
          </button>
        )}
      </DialogTrigger>
      <DialogContent
        title="Conditions Générales d’Utilisation (CGU & DPA)"
        description="Contrat de service SaaS FOVE et accord de sous-traitance des données personnelles."
        className="sm:max-w-2xl"
      >
        <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1 text-sm text-ink-2">
          <div className="flex items-center gap-2 rounded-md bg-cobalt-soft p-3 text-cobalt">
            <FileCheck2 className="size-5 shrink-0" />
            <p className="text-xs font-medium">
              Vous restez propriétaire exclusif de votre fichier client. Sans commission sur vos ventes et sans engagement caché.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-ink">1. Objet du service</h3>
            <p className="mt-1 leading-relaxed">
              <strong>FOVE</strong> (édité par <strong>Dizayna</strong>) fournit aux commerçants et entreprises une plateforme SaaS de création et de gestion de programmes de fidélité numériques (cartes à points ou à tampons, QR codes en caisse, Apple/Google Wallet, CRM et API).
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-ink">2. Compte commerçant et responsabilités</h3>
            <p className="mt-1 leading-relaxed">
              Le commerçant est responsable de la confidentialité de ses identifiants, de la gestion des droits de son équipe (propriétaire, manager, caissier, lecteur) et de la licéité des règles commerciales et récompenses qu&apos;il propose à ses clients finaux.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-ink">3. Essai gratuit, abonnement et continuité</h3>
            <p className="mt-1 leading-relaxed">
              L&apos;inscription ouvre droit à une période d&apos;essai gratuit sans carte bancaire. À l&apos;issue de l&apos;essai ou en cas de changement d&apos;offre, aucune carte ni aucun solde de points existant n&apos;est supprimé : seules les créations au-delà des quotas de l&apos;offre active sont suspendues jusqu&apos;à mise à niveau.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-ink">4. Propriété des données et sous-traitance (DPA)</h3>
            <p className="mt-1 leading-relaxed">
              Le commerçant demeure seul propriétaire de sa base clients et responsable de traitement au sens du RGPD. Dizayna agit uniquement en tant que sous-traitant technique (article 28 du RGPD), s&apos;interdit toute revente ou exploitation commerciale des données clients, et garantit l&apos;exportabilité complète (JSON/CSV) à tout moment.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-ink">5. Sécurité et intégrité du grand livre</h3>
            <p className="mt-1 leading-relaxed">
              Les opérations de points et de tampons sont inscrites dans un journal comptable immuable et audité. Toute tentative d&apos;utilisation frauduleuse, d&apos;envoi de spam ou d&apos;atteinte à la sécurité de la plateforme peut entraîner la suspension immédiate du compte.
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-line">
          <DialogClose asChild>
            <Button variant="secondary" size="sm">
              Fermer
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}

export function PrivacyDialog({ trigger }: { trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="text-cobalt underline hover:text-cobalt-hover"
          >
            politique de données
          </button>
        )}
      </DialogTrigger>
      <DialogContent
        title="Politique de données personnelles"
        description="Comment FOVE et Dizayna protègent et traitent vos données et celles de vos clients."
        className="sm:max-w-2xl"
      >
        <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1 text-sm text-ink-2">
          <div className="flex items-center gap-2 rounded-md bg-mint/10 p-3 text-mint-ink dark:text-mint">
            <ShieldCheck className="size-5 shrink-0" />
            <p className="text-xs font-medium">
              Conformité stricte aux standards RGPD : isolation des données, droits d&apos;export et d&apos;anonymisation en 1 clic.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-ink">1. Qui est responsable du traitement ?</h3>
            <p className="mt-1 leading-relaxed">
              Chaque commerçant est responsable du traitement des données de ses propres clients (son fichier client et les règles de son programme de fidélité). <strong>Dizayna</strong>, éditeur de <strong>FOVE</strong>, agit en qualité de sous-traitant technique : nous hébergeons et sécurisons ces données pour le compte du commerçant, selon ses strictes instructions.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-ink">2. Quelles données sont collectées ?</h3>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>
                <strong>Commerçants et équipes de vente</strong> : nom, prénom, email professionnel, rôle d&apos;accès et journal d&apos;audit des opérations en caisse.
              </li>
              <li>
                <strong>Clients finaux</strong> : prénom, nom, numéro de téléphone, email (facultatif), numéro de carte fidélité, historique des passages, points/tampons cumulés et récompenses remises.
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-ink">3. Consentements distincts</h3>
            <p className="mt-1 leading-relaxed">
              L&apos;adhésion au programme de fidélité et le consentement aux messages marketing (SMS, WhatsApp, email) sont strictement distincts. Un client peut bénéficier de sa carte de fidélité sans accepter de recevoir d&apos;offres promotionnelles.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-ink">4. Droits des personnes (Accès, Export, Effacement)</h3>
            <p className="mt-1 leading-relaxed">
              Le commerçant peut à tout moment exporter l&apos;intégralité des données d&apos;un client au format standard JSON ou procéder à son effacement définitif depuis sa fiche. L&apos;effacement anonymise immédiatement la personne : l&apos;historique comptable est conservé sans aucune donnée identifiante.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-ink">5. Durée de conservation</h3>
            <p className="mt-1 leading-relaxed">
              Les données d&apos;un client inactif sont conservées 36 mois par défaut (durée configurable par le commerçant dans ses paramètres). Les jetons et codes d&apos;authentification expirés sont automatiquement purgés.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-ink">6. Sécurité et hébergement</h3>
            <p className="mt-1 leading-relaxed">
              Isolation multi-tenant stricte en base de données, mots de passe à hachage cryptographique fort, chiffrement des secrets d&apos;intégration (AES-256-GCM), traçabilité immuable des écritures et sauvegardes quotidiennes.
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-line">
          <DialogClose asChild>
            <Button variant="secondary" size="sm">
              Fermer
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
