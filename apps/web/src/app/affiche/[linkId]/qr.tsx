"use client";

import { QRCodeSVG } from "qrcode.react";

export function PosterQr({ value }: { value: string }) {
  return <QRCodeSVG value={value} size={360} marginSize={0} fgColor="#000000" level="M" className="h-auto w-full" />;
}

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="poster-print mt-[10mm] rounded-md bg-[#14204a] px-6 py-3 font-medium text-white">
      Imprimer l’affiche
    </button>
  );
}
