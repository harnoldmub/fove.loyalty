import { ImageResponse } from "next/og";

export const alt = "FOVE — Plateforme de fidélisation et force de vente retail";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0d1430",
          backgroundImage:
            "radial-gradient(circle at 85% 20%, rgba(44, 85, 245, 0.45) 0%, rgba(13, 20, 48, 0) 55%), radial-gradient(circle at 15% 85%, rgba(21, 183, 126, 0.25) 0%, rgba(13, 20, 48, 0) 50%)",
          color: "#f6f7fb",
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "14px",
                backgroundColor: "#2c55f5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "30px",
                fontWeight: 800,
                color: "#ffffff",
              }}
            >
              F
            </div>
            <span style={{ fontSize: "34px", fontWeight: 800, letterSpacing: "-0.03em" }}>FOVE</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "10px 20px",
              borderRadius: "999px",
              backgroundColor: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.16)",
              fontSize: "20px",
              color: "#cdd6ff",
            }}
          >
            fove.digital · FOrce de VEnte
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "22px", maxWidth: "960px" }}>
          <div
            style={{
              fontSize: "68px",
              fontWeight: 800,
              lineHeight: 1.06,
              letterSpacing: "-0.03em",
              color: "#ffffff",
            }}
          >
            Transformez vos clients en habitués.
          </div>
          <div
            style={{
              fontSize: "28px",
              lineHeight: 1.4,
              color: "#b9c4ec",
              maxWidth: "860px",
            }}
          >
            Cartes de fidélité numériques, QR codes en caisse, Apple & Google Wallet et relances WhatsApp. Sans application à installer.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: "16px" }}>
            {["Points & Tampons", "Apple & Google Wallet", "Scanner Caisse Mobile", "CRM & Relance WhatsApp"].map((pill) => (
              <div
                key={pill}
                style={{
                  padding: "10px 18px",
                  borderRadius: "10px",
                  backgroundColor: "rgba(44, 85, 245, 0.22)",
                  border: "1px solid rgba(114, 146, 255, 0.35)",
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "#e4e9ff",
                }}
              >
                {pill}
              </div>
            ))}
          </div>
          <div style={{ fontSize: "18px", color: "#8d9bd1" }}>Un produit Dizayna</div>
        </div>
      </div>
    ),
    { ...size },
  );
}

