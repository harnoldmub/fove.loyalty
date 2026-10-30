import Link from "next/link";
import { pageMeta } from "@/lib/og";

export const metadata = pageMeta(
  "Conditions Générales d’Utilisation (CGU & DPA)",
  "Conditions contractuelles d’utilisation de la plateforme SaaS FOVE et accord de sous-traitance des données personnelles (RGPD).",
  "/cgu",
  ["CGU FOVE", "conditions générales d'utilisation fidélité", "DPA RGPD commerçant", "contrat SaaS Dizayna"],
);

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 pt-14 sm:px-6 [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_p]:mt-3 [&_p]:text-ink-2 [&_li]:text-ink-2 [&_ul]:mt-3 [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-1.5 [&_ul]:pl-5">
      <h1 className="font-display text-4xl font-bold">Conditions Générales d’Utilisation</h1>
      <p>
        Les présentes Conditions Générales d’Utilisation et de Services (« CGU ») encadrent l’accès et l’utilisation de la plateforme <strong>FOVE</strong>, éditée par <strong>Dizayna</strong>, par tout commerçant, enseigne ou entreprise cliente (« le Commerçant »).
      </p>

      <h2>1. Objet de la plateforme</h2>
      <p>
        FOVE met à disposition des commerçants une solution logicielle en mode SaaS permettant de créer et d’opérer des programmes de fidélité numériques (cartes à points ou à tampons, QR codes d’inscription en magasin, passes Apple Wallet et Google Wallet, scanner caisse mobile, CRM client, relances WhatsApp et API d’intégration e-commerce).
      </p>

      <h2>2. Création de compte et accès équipe</h2>
      <ul>
        <li>L’ouverture d’un compte est réservée aux professionnels agissant dans le cadre de leur activité commerciale.</li>
        <li>Le Commerçant définit librement les accès de ses collaborateurs selon quatre rôles stricts : Propriétaire, Manager, Caissier et Lecteur.</li>
        <li>Chaque opération réalisée au scanner ou depuis le tableau de bord est rattachée à l’utilisateur connecté et consignée dans un journal d’audit horodaté.</li>
      </ul>

      <h2>3. Essai gratuit, tarifs et continuité des données</h2>
      <ul>
        <li>Toute inscription bénéficie d’une période d’essai gratuit sans obligation de renseigner une carte bancaire.</li>
        <li>Aucune commission n’est prélevée sur le chiffre d’affaires ou les ventes du Commerçant.</li>
        <li>
          <strong>Garantie de non-destruction :</strong> à la fin de l’essai ou lors d’un passage à une offre inférieure, aucune carte client ni aucun historique de points n’est supprimé. Seules les fonctionnalités ou nouvelles créations dépassant les quotas de l’offre active sont restreintes.
        </li>
      </ul>

      <h2>4. Engagements et responsabilités du Commerçant</h2>
      <p>
        Le Commerçant fixe librement ses règles d’attribution de points ou tampons ainsi que son catalogue de récompenses. Il s’engage à honorer auprès de ses clients finaux les récompenses légitimement débloquées et à recueillir le consentement explicite de ses clients avant tout envoi de communication promotionnelle (SMS, WhatsApp ou email).
      </p>

      <h2>5. Accord de sous-traitance des données (DPA — Article 28 RGPD)</h2>
      <p>
        Dans le cadre de l’exécution du service, le Commerçant agit en qualité de <strong>Responsable de traitement</strong> de son fichier clients, et Dizayna (FOVE) agit en qualité de <strong>Sous-traitant</strong> :
      </p>
      <ul>
        <li><strong>Propriété exclusive :</strong> le Commerçant conserve l’entière propriété de ses données clients. Dizayna s’interdit toute revente, location ou exploitation commerciale des fichiers clients hébergés.</li>
        <li><strong>Cloisonnement multi-tenant :</strong> chaque base commerçant est logiquement isolée. Un client inscrit chez plusieurs commerçants utilisant FOVE possède des fiches et des soldes totalement indépendants.</li>
        <li><strong>Exercice des droits RGPD :</strong> FOVE fournit au Commerçant des outils natifs en un clic pour exporter l’intégralité des données d’un client (portabilité JSON) ou anonymiser définitivement sa fiche (droit à l’effacement) tout en préservant l’intégrité comptable du grand livre de points.</li>
        <li><strong>Sécurité technique :</strong> hachage cryptographique des mots de passe et des jetons de carte, chiffrement AES-256-GCM des secrets d’intégration, connexions TLS et sauvegardes quotidiennes automatisées.</li>
      </ul>

      <h2>6. Disponibilité, API et usage loyal</h2>
      <p>
        Dizayna met en œuvre les meilleures pratiques de l’industrie pour assurer la haute disponibilité de FOVE, y compris lors des pics d’encaissement en magasin. L’utilisation des clés API et webhooks est soumise à des limites de débit (rate-limiting) destinées à protéger la stabilité globale du service.
      </p>

      <h2>7. Résiliation et réversibilité</h2>
      <p>
        Le Commerçant peut résilier son abonnement à tout moment depuis son espace de gestion. Avant ou après résiliation, il peut exporter l’intégralité de sa base clients et de son historique d’opérations au format standard CSV ou JSON.
      </p>

      <h2>8. Contact et mentions</h2>
      <p>
        Pour toute question contractuelle, demande d’accompagnement ou exercice de vos droits, contactez notre équipe via la page <Link href="/contact" className="text-cobalt underline underline-offset-4">Contact & Démonstration</Link> ou consultez notre <Link href="/confidentialite" className="text-cobalt underline underline-offset-4">Politique de confidentialité</Link>.
      </p>
    </article>
  );
}

