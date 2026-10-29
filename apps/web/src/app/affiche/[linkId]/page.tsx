import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/session";
import { serverGet } from "@/lib/server-api";
import { PosterQr, PrintButton } from "./qr";

export const metadata: Metadata = { title: "Affiche d’inscription", robots: { index: false } };

interface Link { id: string; url: string; programId: string; establishment: { name: string } | null }
interface Program { id: string; name: string; mode: "POINTS" | "STAMPS"; currency: string; spendStep: string; pointsPerStep: number; stampsTarget: number }
interface Tenant { name: string; settings: { logoUrl: string | null; primaryColor: string } }
interface Reward { programId: string; name: string; cost: number }

/**
 * Affiche A4 à imprimer pour le comptoir : le QR ouvre l'inscription.
 * Ce QR sert à s'inscrire ; celui de la carte personnelle sert à identifier le client.
 */
export default async function PosterPage({ params }: { params: Promise<{ linkId: string }> }) {
  await requireMe("/app/programs");
  const { linkId } = await params;
  const [links, programs, tenant, rewards] = await Promise.all([
    serverGet<Link[]>("/app/enrollment-links", true),
    serverGet<Program[]>("/app/programs", true),
    serverGet<Tenant>("/app/tenant", true),
    serverGet<Reward[]>("/app/rewards", true),
  ]);
  const link = links.data?.find((l) => l.id === linkId);
  const program = programs.data?.find((p) => p.id === link?.programId);
  if (!link || !program || !tenant.data) notFound();
  const reward = rewards.data?.filter((r) => r.programId === program.id).sort((a, b) => a.cost - b.cost)[0];
  const offer =
    program.mode === "STAMPS"
      ? `${program.stampsTarget} passages = ${reward?.name ?? "une récompense"}`
      : `${new Intl.NumberFormat("fr-FR").format(Number(program.spendStep))} ${program.currency} = ${program.pointsPerStep} point${program.pointsPerStep > 1 ? "s" : ""}`;
  const color = /^#[0-9a-fA-F]{6}$/.test(tenant.data.settings.primaryColor) ? tenant.data.settings.primaryColor : "#2C55F5";

  return (
    <main id="contenu" className="poster mx-auto flex min-h-dvh max-w-[210mm] flex-col items-center justify-center bg-white p-[16mm] text-center text-black">
      {tenant.data.settings.logoUrl ? (
        <img src={tenant.data.settings.logoUrl} alt={tenant.data.name} className="h-[28mm] w-auto rounded-full" />
      ) : (
        <span className="grid size-[28mm] place-items-center rounded-full font-display text-[40pt] font-bold text-white" style={{ background: color }}>
          {tenant.data.name.slice(0, 1)}
        </span>
      )}
      <p className="mt-[8mm] text-[16pt] font-semibold" style={{ color }}>
        {tenant.data.name}
        {link.establishment ? ` · ${link.establishment.name}` : ""}
      </p>
      <h1 className="mt-[4mm] font-display text-[46pt] font-bold leading-[0.95]">Votre carte de fidélité, gratuite</h1>
      <p className="mt-[4mm] text-[15pt] text-[#4a5579]">Scannez avec l’appareil photo de votre téléphone</p>
      <div className="mt-[10mm] w-[95mm] max-w-[80vw]">
        <PosterQr value={link.url} />
      </div>
      <p className="mt-[10mm] rounded-full px-[8mm] py-[3mm] text-[20pt] font-semibold text-white" style={{ background: "#14204a" }}>
        {offer}
      </p>
      <p className="mt-[4mm] text-[11pt] text-[#4a5579]">{link.url.replace(/^https?:\/\//, "")}</p>
      <PrintButton />
      <style>{`
        @media print {
          .poster-print { display: none; }
          .poster { min-height: 297mm; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </main>
  );
}
