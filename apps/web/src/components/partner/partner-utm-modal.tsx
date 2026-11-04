"use client";

import { useState } from "react";
import { X, Link2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

interface PartnerUtmModalProps {
  open: boolean;
  partnerLink: string;
  onClose: () => void;
}

export function PartnerUtmModal({ open, partnerLink, onClose }: PartnerUtmModalProps) {
  const [copied, setCopied] = useState(false);
  const [source, setSource] = useState("whatsapp");
  const [medium, setMedium] = useState("social");
  const [campaign, setCampaign] = useState("prospection");

  if (!open) return null;

  const url = new URL(partnerLink);
  if (source.trim()) url.searchParams.set("utm_source", source.trim());
  if (medium.trim()) url.searchParams.set("utm_medium", medium.trim());
  if (campaign.trim()) url.searchParams.set("utm_campaign", campaign.trim());

  const fullUrl = url.toString();

  const handleCopy = () => {
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-cobalt/10 text-cobalt">
              <Link2 className="size-4" />
            </span>
            <div>
              <h3 className="font-display text-sm font-semibold text-ink">Générateur de liens de campagne</h3>
              <p className="text-[11px] text-ink-3">Paramètres UTM pour suivre vos différents canaux</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">Source (utm_source)</label>
            <Input
              placeholder="whatsapp, linkedin, flyer, email..."
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">Support (utm_medium)</label>
            <Input
              placeholder="social, cpc, qr, direct..."
              value={medium}
              onChange={(e) => setMedium(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">Nom de campagne (utm_campaign)</label>
            <Input
              placeholder="prospection_kinshasa, salon_retail..."
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">Lien généré</label>
            <div className="rounded-lg border border-line bg-surface-2 p-3 text-xs font-mono text-ink break-all select-all">
              {fullUrl}
            </div>
          </div>

          <Button onClick={handleCopy} variant="primary" className="w-full gap-2 text-xs mt-2">
            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
            {copied ? "Lien de campagne copié !" : "Copier le lien avec UTM"}
          </Button>
        </div>
      </div>
    </div>
  );
}
