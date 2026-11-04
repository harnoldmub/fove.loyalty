"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { X, Download, Copy, Check, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PartnerQrModalProps {
  open: boolean;
  partnerLink: string;
  partnerCode: string;
  onClose: () => void;
}

export function PartnerQrModal({ open, partnerLink, partnerCode, onClose }: PartnerQrModalProps) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(partnerLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSvg = () => {
    const svgElement = document.getElementById("partner-qr-code");
    if (!svgElement) return;
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `FOVE-QR-${partnerCode}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-line bg-surface p-6 text-center shadow-2xl">
        <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
          <div className="flex items-center gap-2 text-left">
            <span className="grid size-8 place-items-center rounded-lg bg-cobalt/10 text-cobalt">
              <QrCode className="size-4" />
            </span>
            <div>
              <h3 className="font-display text-sm font-semibold text-ink">QR Code Partenaire</h3>
              <p className="font-mono text-[11px] text-ink-3">{partnerCode}</p>
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

        {/* QR Code Container */}
        <div className="mx-auto my-4 grid place-items-center rounded-2xl border border-line bg-white p-6 shadow-sm max-w-[240px]">
          <QRCodeSVG
            id="partner-qr-code"
            value={partnerLink}
            size={180}
            level="H"
            includeMargin={false}
          />
        </div>

        <p className="text-xs text-ink-3 mb-4">
          Faites scanner ce QR code à un commerçant pour ouvrir directement votre page de recommandation.
        </p>

        <div className="space-y-2">
          <Button onClick={handleCopy} variant="secondary" className="w-full gap-2 text-xs">
            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
            {copied ? "Lien copié dans le presse-papier !" : "Copier le lien direct"}
          </Button>

          <Button onClick={handleDownloadSvg} variant="primary" className="w-full gap-2 text-xs">
            <Download className="size-3.5" />
            Télécharger le QR Code (SVG)
          </Button>
        </div>
      </div>
    </div>
  );
}
