import { pageMeta } from "@/lib/og";

export const metadata = pageMeta("Données personnelles", "Comment FOVE traite les données des commerçants et de leurs clients.", "/confidentialite");

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 pt-14 sm:px-6 [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_p]:mt-3 [&_p]:text-ink-2 [&_li]:text-ink-2 [&_ul]:mt-3 [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-1.5 [&_ul]:pl-5">
      <h1 className="font-display text-4xl font-bold">Données personnelles</h1>
      <p>Ce résumé décrit qui fait quoi. Il ne remplace pas les conditions contractuelles signées avec chaque commerçant.</p>

      <h2>Qui est responsable ?</h2>
      <p>
        Chaque commerçant est responsable du traitement des données de ses clients (fichier clients, programme de fidélité). Dizayna, éditeur de FOVE, agit comme sous-traitant : FOVE héberge et traite ces données pour le compte du commerçant, selon ses instructions.
      </p>

      <h2>Quelles données ?</h2>
      <ul>
        <li>Clients finaux : prénom, nom, téléphone, email facultatif, numéro de carte, historique des points et récompenses, consentements.</li>
        <li>Équipes des commerçants : nom, email, rôle, journal des actions.</li>
      </ul>

      <h2>Consentements</h2>
      <p>L’adhésion au programme et les communications marketing sont deux consentements distincts. Le client peut refuser le marketing et garder sa carte.</p>

      <h2>Droits des clients</h2>
      <p>
        Le commerçant peut exporter toutes les données d’un client et les effacer depuis sa fiche. L’effacement anonymise la personne : l’historique comptable des points est conservé sans aucune donnée permettant de l’identifier.
      </p>

      <h2>Conservation</h2>
      <p>Les données d’un client inactif sont conservées 36 mois par défaut, durée réglable par le commerçant. Les sessions et codes de vérification expirés sont supprimés automatiquement.</p>

      <h2>Sécurité</h2>
      <p>Isolation stricte entre commerçants, mots de passe hachés, liens de carte secrets non stockés en clair, chiffrement des secrets d’intégration, journal d’audit des actions sensibles, sauvegardes quotidiennes de la base.</p>
    </article>
  );
}
